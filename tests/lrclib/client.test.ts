import { describe, it, expect } from 'vitest';
import { searchLyrics, LrclibRateLimitError } from '../../src/lrclib/client';
import type { LrclibRecord } from '../../src/core/types';

const record: LrclibRecord = {
  id: 1,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: '(Whats The Story) Morning Glory?',
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('searchLyrics', () => {
  it('returns parsed records on success', async () => {
    const { impl } = fakeFetch(200, [record]);
    const result = await searchLyrics('oasis wonderwall', impl);
    expect(result).toHaveLength(1);
    expect(result[0]?.trackName).toBe('Wonderwall');
  });

  it('url-encodes the query, including Thai text', async () => {
    const { impl, calls } = fakeFetch(200, []);
    await searchLyrics('Bodyslam ครั้งหนึ่ง', impl);
    expect(calls[0]).toBe(
      'https://lrclib.net/api/search?q=' + encodeURIComponent('Bodyslam ครั้งหนึ่ง'),
    );
  });

  it('throws LrclibRateLimitError carrying retry-after on 429', async () => {
    const { impl } = fakeFetch(429, {}, { 'retry-after': '30' });
    await expect(searchLyrics('x', impl)).rejects.toBeInstanceOf(LrclibRateLimitError);
    await expect(searchLyrics('x', impl)).rejects.toMatchObject({ retryAfterSec: 30 });
  });

  it('defaults retry-after to 60 seconds when the header is missing', async () => {
    const { impl } = fakeFetch(429, {});
    await expect(searchLyrics('x', impl)).rejects.toMatchObject({ retryAfterSec: 60 });
  });

  it('throws a plain error on server failure', async () => {
    const { impl } = fakeFetch(500, {});
    await expect(searchLyrics('x', impl)).rejects.toThrow('HTTP 500');
  });
});
