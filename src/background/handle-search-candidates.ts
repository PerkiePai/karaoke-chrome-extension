import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics } from '../core/match-scorer';
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

  return {
    ok: true,
    candidates: results.filter(hasUsableLyrics).slice(0, MAX_CANDIDATES),
  };
}
