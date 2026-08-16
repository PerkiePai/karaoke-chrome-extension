import { LrclibRateLimitError } from '../lrclib/client';
import {
  hasUsableLyrics,
  pickBestScored,
  scoreCandidates,
  MATCH_THRESHOLD,
  MIN_TRACK_SIMILARITY,
  MIN_ARTIST_SIMILARITY,
  type ScoredCandidate,
} from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import {
  readVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  type StorageLike,
} from './storage';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function and an optional storage injection so it can be
 * tested without a network, a browser, or any chrome.* global.
 *
 * With storage: checks the cache before searching and writes back on success.
 * Without storage: behaves identically to the pre-Sprint-4 version.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
  storage?: StorageLike,
): Promise<FetchLyricsResponse> {
  const existingMeta = storage ? await readVideoMeta(storage, request.videoId) : null;

  if (existingMeta) {
    const cached = await readLyricsCache(storage!, existingMeta.lrclibId);
    if (cached) {
      // Re-score the cached record against the current song readings before
      // serving it. A record stored under a previous wrong match (or an old
      // scorer run) would otherwise be returned forever — the root cause of
      // "change video but lyrics don't change".
      const allReadings = [
        { artist: request.artist, track: request.track },
        ...(request.alternates ?? []),
      ];
      let bestHitScore = 0;
      const cacheValid = allReadings.some(({ artist, track }) => {
        const hit = scoreCandidates(
          { artist, track, durationSec: request.durationSec },
          [cached],
        )[0];
        if (hit !== undefined && hit.score > bestHitScore) bestHitScore = hit.score;
        return (
          hit !== undefined &&
          hit.score >= MATCH_THRESHOLD &&
          hit.trackSimilarity >= MIN_TRACK_SIMILARITY &&
          (hit.artistSimilarity === null || hit.artistSimilarity >= MIN_ARTIST_SIMILARITY)
        );
      });
      if (cacheValid) {
        console.log(
          `[karaoke] cache HIT videoId=${request.videoId} "${request.track}"`,
          `lrclibId=${existingMeta.lrclibId} score=${bestHitScore.toFixed(3)} offsetSec=${existingMeta.offsetSec}`,
        );
        return {
          ok: true,
          record: cached,
          lrclibId: existingMeta.lrclibId,
          offsetSec: existingMeta.offsetSec,
          scrollSpeed: existingMeta.scrollSpeed ?? 1,
        };
      }
      console.warn(
        `[karaoke] cache REJECTED videoId=${request.videoId} "${request.track}"`,
        `— cached="${cached.trackName} / ${cached.artistName}" lrclibId=${existingMeta.lrclibId}`,
        `score=${bestHitScore.toFixed(3)} < threshold=${MATCH_THRESHOLD} → re-searching`,
      );
      // Validation failed — fall through to a fresh search rather than
      // serving stale or mismatched lyrics.
    } else {
      console.log(`[karaoke] cache MISS "${request.track}" (lrclibId=${existingMeta.lrclibId} not in lc: store) → searching`);
    }
  } else {
    console.log(`[karaoke] no VideoMeta for videoId=${request.videoId} → first visit, searching`);
  }

  const readings = [
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  const query = buildSearchQuery(request.artist, request.track);

  let candidates: LrclibRecord[];
  try {
    candidates = await search(query);
  } catch (error) {
    if (error instanceof LrclibRateLimitError) {
      return {
        ok: false,
        reason: 'rate-limited',
        message: `Rate limited by lrclib. Try again in ${error.retryAfterSec}s.`,
      };
    }
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : 'Network request failed.',
    };
  }

  const usable = candidates.filter(hasUsableLyrics);

  let best: ScoredCandidate | null = null;
  for (const reading of readings) {
    const scored = pickBestScored(
      { artist: reading.artist, track: reading.track, durationSec: request.durationSec },
      usable,
    );
    if (scored && (best === null || scored.score > best.score)) best = scored;
  }

  if (!best) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  // Preserve any offset/scroll-speed the user previously set for this video,
  // but only when the fresh search found the SAME lrclibId — if a different
  // record was matched, those values were calibrated for the wrong song and
  // must not carry over.
  const sameRecordAsBefore = existingMeta !== null && existingMeta.lrclibId === best.record.id;
  const offsetSec = sameRecordAsBefore ? existingMeta!.offsetSec : 0;
  const scrollSpeed = sameRecordAsBefore ? (existingMeta!.scrollSpeed ?? 1) : 1;

  if (storage) {
    await writeLyricsCache(storage, best.record.id, best.record);
    // VideoMeta (vm:videoId) is written by the content script after its
    // generation check passes — doing it here would race with concurrent
    // in-flight requests and corrupt the stored lrclibId.
  }

  console.log(
    `[karaoke] search OK "${best.record.trackName} / ${best.record.artistName}"`,
    `lrclibId=${best.record.id} score=${best.score.toFixed(3)} offsetSec=${offsetSec} scrollSpeed=${scrollSpeed}`,
  );

  return { ok: true, record: best.record, lrclibId: best.record.id, offsetSec, scrollSpeed };
}
