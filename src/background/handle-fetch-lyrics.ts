import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics, pickBestScored, type ScoredCandidate } from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import {
  readVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  writeVideoMeta,
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
  let existingMeta = storage ? await readVideoMeta(storage, request.videoId) : null;

  if (existingMeta) {
    const cached = await readLyricsCache(storage!, existingMeta.lrclibId);
    if (cached) {
      return {
        ok: true,
        record: cached,
        lrclibId: existingMeta.lrclibId,
        offsetSec: existingMeta.offsetSec,
      };
    }
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

  // Preserve any offset the user previously set for this video; default to 0 on first visit.
  const offsetSec = existingMeta?.offsetSec ?? 0;

  if (storage) {
    await writeLyricsCache(storage, best.record.id, best.record);
    await writeVideoMeta(storage, request.videoId, { lrclibId: best.record.id, offsetSec });
  }

  return { ok: true, record: best.record, lrclibId: best.record.id, offsetSec };
}
