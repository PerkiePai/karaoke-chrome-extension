import { describe, it, expect } from 'vitest';
import { handleFetchLyrics } from '../../src/background/handle-fetch-lyrics';
import { LrclibRateLimitError } from '../../src/lrclib/client';
import type { FetchLyricsRequest } from '../../src/messaging/types';
import type { LrclibRecord } from '../../src/core/types';

const request: FetchLyricsRequest = {
  type: 'FETCH_LYRICS',
  videoId: 'abc123',
  artist: 'Oasis',
  track: 'Wonderwall',
  durationSec: 258,
};

const wonderwall: LrclibRecord = {
  id: 99,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

describe('handleFetchLyrics', () => {
  it('returns the best matching record', async () => {
    const result = await handleFetchLyrics(request, async () => [wonderwall]);
    expect(result).toEqual({ ok: true, record: wonderwall });
  });

  it('searches using artist and track together', async () => {
    const queries: string[] = [];
    await handleFetchLyrics(request, async (q) => {
      queries.push(q);
      return [wonderwall];
    });
    expect(queries[0]).toBe('Oasis Wonderwall');
  });

  it('searches on track alone when the artist is unknown', async () => {
    const queries: string[] = [];
    await handleFetchLyrics({ ...request, artist: null }, async (q) => {
      queries.push(q);
      return [wonderwall];
    });
    expect(queries[0]).toBe('Wonderwall');
  });

  it('reports not-found when the search returns nothing', async () => {
    const result = await handleFetchLyrics(request, async () => []);
    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
      message: 'No lyrics found for this song.',
    });
  });

  it('reports not-found when no candidate clears the threshold', async () => {
    const unrelated: LrclibRecord = { ...wonderwall, id: 1, trackName: 'Zzz', artistName: 'Nobody', duration: 60 };
    const result = await handleFetchLyrics(request, async () => [unrelated]);
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('reports rate-limited with the retry delay', async () => {
    const result = await handleFetchLyrics(request, async () => {
      throw new LrclibRateLimitError(45);
    });
    expect(result).toMatchObject({ ok: false, reason: 'rate-limited' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('45');
  });

  it('reports a network failure for any other error', async () => {
    const result = await handleFetchLyrics(request, async () => {
      throw new Error('offline');
    });
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });
});

describe('handleFetchLyrics with alternate readings', () => {
  const thai: LrclibRecord = {
    id: 500,
    trackName: 'คืนจันทร์',
    artistName: 'Loso',
    albumName: null,
    duration: 240,
    instrumental: false,
    plainLyrics: 'x',
    syncedLyrics: '[00:01.00]x',
  };

  it('searches with the Latin token only, not the Thai text', async () => {
    const queries: string[] = [];
    await handleFetchLyrics(
      { type: 'FETCH_LYRICS', videoId: 'v', artist: 'คืนจันทร์', track: 'LOSO', durationSec: 240 },
      async (q) => {
        queries.push(q);
        return [thai];
      },
    );
    expect(queries).toEqual(['LOSO']);
  });

  it('matches via the swapped reading when the primary one is backwards', async () => {
    const result = await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: 240,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => [thai],
    );
    expect(result).toEqual({ ok: true, record: thai });
  });

  it('issues exactly one search no matter how many readings are offered', async () => {
    let calls = 0;
    await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: 240,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => {
        calls += 1;
        return [thai];
      },
    );
    expect(calls).toBe(1);
  });

  it('reports not-found when no reading clears the gates', async () => {
    const unrelated: LrclibRecord = { ...thai, id: 501, trackName: 'ครึ่งทาง' };
    const result = await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: null,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => [unrelated],
    );
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });
});
