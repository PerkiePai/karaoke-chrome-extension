import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics, pickBestScored, type ScoredCandidate } from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function as an argument so it can be tested without a
 * network, a browser, or any chrome.* global.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
): Promise<FetchLyricsResponse> {
  const readings = [
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  // buildSearchQuery is ordering-independent, so every reading shares one
  // request -- readings differ only in how the results are scored locally.
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

  // Filtered once, ahead of the readings loop: a karaoke/instrumental cut must
  // never win against the vocal record beside it regardless of which reading
  // scores it (see the exclude-no-usable-lyrics fix in match-scorer.ts).
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

  return { ok: true, record: best.record };
}
