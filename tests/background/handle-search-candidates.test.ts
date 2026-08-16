import { describe, it, expect } from 'vitest';
import { handleSearchCandidates } from '../../src/background/handle-search-candidates';
import { LrclibRateLimitError } from '../../src/lrclib/client';
import type { LrclibRecord } from '../../src/core/types';

const base: LrclibRecord = {
  id: 1,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

describe('handleSearchCandidates', () => {
  it('returns candidates from the search results', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'wonderwall oasis' },
      async () => [base],
    );
    expect(result).toEqual({ ok: true, candidates: [base] });
  });

  it('filters out records with no usable lyrics', async () => {
    const noLyrics: LrclibRecord = { ...base, id: 2, plainLyrics: null, syncedLyrics: null };
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'wonderwall' },
      async () => [noLyrics, base],
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.id).toBe(1);
  });

  it('caps the result list at 10 entries', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...base, id: i + 1 }));
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => many,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidates).toHaveLength(10);
  });

  it('passes the raw query string to search without modification', async () => {
    const captured: string[] = [];
    await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'คืนจันทร์ loso' },
      async (q) => { captured.push(q); return [base]; },
    );
    expect(captured).toEqual(['คืนจันทร์ loso']);
  });

  it('reports rate-limited', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => { throw new LrclibRateLimitError(30); },
    );
    expect(result).toMatchObject({ ok: false, reason: 'rate-limited' });
  });

  it('reports a network error', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => { throw new Error('offline'); },
    );
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });
});
