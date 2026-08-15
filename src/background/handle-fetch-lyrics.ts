import { LrclibRateLimitError } from '../lrclib/client';
import { pickBestMatch } from '../core/match-scorer';
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
  const query = request.artist ? `${request.artist} ${request.track}` : request.track;

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

  const match = pickBestMatch(
    { artist: request.artist, track: request.track, durationSec: request.durationSec },
    candidates,
  );

  if (!match) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  return { ok: true, record: match };
}
