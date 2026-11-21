import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics, scoreCandidates } from '../core/match-scorer';
import type { LrclibRecord } from '../core/types';
import type { SearchCandidatesRequest, SearchCandidatesResponse } from '../messaging/types';

const MAX_CANDIDATES = 10;

export async function handleSearchCandidates(
  request: SearchCandidatesRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
): Promise<SearchCandidatesResponse> {
  let results: LrclibRecord[];
  try {
    results = await search(request.query);
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

  const usable = results.filter(hasUsableLyrics);
  // SYNCED_BONUS already puts a synced record ahead of a plain one of equal match.
  const ranked = request.rankAgainst
    ? scoreCandidates(request.rankAgainst, usable).map((c) => c.record)
    : usable;
  return { ok: true, candidates: ranked.slice(0, MAX_CANDIDATES) };
}
