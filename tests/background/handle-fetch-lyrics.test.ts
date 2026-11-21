import { describe, it, expect } from 'vitest';
import { handleFetchLyrics } from '../../src/background/handle-fetch-lyrics';
import { LrclibRateLimitError } from '../../src/lrclib/client';
import type { FetchLyricsRequest } from '../../src/messaging/types';
import type { LrclibRecord } from '../../src/core/types';
import { readLyricsCache, readVideoMeta, writeVideoMeta, isNotFoundCached, writeUserPicked, type StorageLike } from '../../src/background/storage';

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
    expect(result).toMatchObject({ ok: true, record: wonderwall });
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

  it('prepends the Thai field text to the Latin artist token', async () => {
    const queries: string[] = [];
    await handleFetchLyrics(
      { type: 'FETCH_LYRICS', videoId: 'v', artist: 'คืนจันทร์', track: 'LOSO', durationSec: 240 },
      async (q) => {
        queries.push(q);
        return [thai];
      },
    );
    expect(queries).toEqual(['คืนจันทร์ LOSO']);
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
    expect(result).toMatchObject({ ok: true, record: thai });
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

describe('handleFetchLyrics — retry chain', () => {
  const memoryStorage = (): StorageLike => {
    const store = new Map<string, unknown>();
    return {
      async get(keys) {
        const r: Record<string, unknown> = {};
        for (const k of keys) { if (store.has(k)) r[k] = store.get(k); }
        return r;
      },
      async set(items) { for (const [k, v] of Object.entries(items)) store.set(k, v); },
      async remove(keys) { for (const k of keys) store.delete(k); },
    };
  };
  // Full query "Oasis Wonderwall Official MV"; core query "Oasis Wonderwall".
  const noisy: FetchLyricsRequest = { ...request, track: 'Wonderwall | Official MV' };

  it('retries with the core query when the full query finds nothing', async () => {
    const queries: string[] = [];
    const result = await handleFetchLyrics(noisy, async (q) => {
      queries.push(q);
      return q === 'Oasis Wonderwall' ? [wonderwall] : [];
    });
    expect(result).toMatchObject({ ok: true, record: wonderwall });
    expect(queries).toEqual(['Oasis Wonderwall Official MV', 'Oasis Wonderwall']);
  });

  it('stops after the first query when it already matches', async () => {
    let calls = 0;
    await handleFetchLyrics(noisy, async () => { calls++; return [wonderwall]; });
    expect(calls).toBe(1);
  });

  it('caches not-found only after every query in the chain missed', async () => {
    const s = memoryStorage();
    let calls = 0;
    const result = await handleFetchLyrics(noisy, async () => { calls++; return []; }, s);
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
    expect(calls).toBe(2);
    expect(await isNotFoundCached(s, noisy.videoId)).toBe(true);
  });

  it('returns rate-limited mid-chain without caching not-found', async () => {
    const s = memoryStorage();
    let calls = 0;
    const result = await handleFetchLyrics(noisy, async () => {
      calls++;
      if (calls === 2) throw new LrclibRateLimitError(30);
      return [];
    }, s);
    expect(result).toMatchObject({ ok: false, reason: 'rate-limited' });
    expect(await isNotFoundCached(s, noisy.videoId)).toBe(false);
  });

  it('reports not-found for a bracketed (Thai Version) cover when every query returns the original', async () => {
    const original: LrclibRecord = { ...wonderwall, id: 7, trackName: 'Angel With A Shotgun', artistName: 'The Cab', duration: 225 };
    const result = await handleFetchLyrics(
      { ...request, artist: 'The Cab', track: 'Angel With A Shotgun (Thai Version)', durationSec: 225 },
      async () => [original],
    );
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });

  // Eval row pMYaW7IcJw4: only the core reading matches this record.
  it('serves a record found via the core reading from cache on revisit, without searching', async () => {
    const s = memoryStorage();
    const guessWho: LrclibRecord = { ...wonderwall, id: 18437028, trackName: 'เธอ ๆ เพื่อนเราชอบ (Guess Who?)', artistName: 'SERIOUS BACON', duration: 186 };
    const raw = { artist: '【cover】เธอ ๆ เพื่อนเราชอบ (Guess Who?)', track: 'SERIOUS BACON【Poru】#arproject' };
    const req: FetchLyricsRequest = { ...request, videoId: 'pMYaW7IcJw4', ...raw, durationSec: 184, alternates: [{ artist: raw.track, track: raw.artist }] };
    const first = await handleFetchLyrics(req, async () => [guessWho], s);
    expect(first).toMatchObject({ ok: true, lrclibId: 18437028 });
    await writeVideoMeta(s, req.videoId, { lrclibId: 18437028, offsetSec: 0 });
    let calls = 0;
    const again = await handleFetchLyrics(req, async () => { calls++; return []; }, s);
    expect(calls).toBe(0);
    expect(again).toMatchObject({ ok: true, record: guessWho });
  });

  it('serves a user-picked record without searching at all', async () => {
    const s = memoryStorage();
    await s.set({ 'lc:99': wonderwall });
    await writeVideoMeta(s, noisy.videoId, { lrclibId: 99, offsetSec: 0 });
    await writeUserPicked(s, noisy.videoId);
    let calls = 0;
    const result = await handleFetchLyrics({ ...noisy, track: 'Something Unrelated' }, async () => { calls++; return []; }, s);
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: true, record: wonderwall });
  });

  it('reports not-found for a translated cover even when every query returns the original', async () => {
    const original: LrclibRecord = { ...wonderwall, id: 7, trackName: 'Angel With A Shotgun', artistName: 'The Cab', duration: 225 };
    const result = await handleFetchLyrics(
      { ...request, artist: 'The Cab', track: 'Angel With A Shotgun (ทูตสรรค์ที่มาพร้อมลูกซอง) Thai.ver | Covered by Aino Wuwu', durationSec: 225 },
      async () => [original],
    );
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });
});

describe('handleFetchLyrics — cache behavior', () => {
  const storage = (): StorageLike => {
    const store = new Map<string, unknown>();
    return {
      async get(keys) {
        const r: Record<string, unknown> = {};
        for (const k of keys) { if (store.has(k)) r[k] = store.get(k); }
        return r;
      },
      async set(items) { for (const [k, v] of Object.entries(items)) store.set(k, v); },
      async remove(keys) { for (const k of keys) store.delete(k); },
    };
  };

  it('returns lrclibId and offsetSec in the ok response when no storage is provided', async () => {
    const result = await handleFetchLyrics(request, async () => [wonderwall]);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, offsetSec: 0 });
  });

  it('writes the lyrics cache on a fresh fetch but not VideoMeta', async () => {
    const s = storage();
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, offsetSec: 0 });
    // lyrics record written so future cache hits can validate it
    const cached = await readLyricsCache(s, 99);
    expect(cached).toEqual(wonderwall);
    // VideoMeta is written by the content script after its generation check,
    // not by the background — so it must be absent here.
    const meta = await readVideoMeta(s, 'abc123');
    expect(meta).toBeNull();
  });

  it('returns from cache on a repeat visit without calling search', async () => {
    const s = storage();
    let calls = 0;
    const first = await handleFetchLyrics(request, async () => { calls++; return [wonderwall]; }, s);
    // Content script writes VideoMeta after receiving the response (the background no longer does this).
    await writeVideoMeta(s, request.videoId, { lrclibId: first.ok ? first.lrclibId : 0, offsetSec: 0 });
    const result = await handleFetchLyrics(request, async () => { calls++; return [wonderwall]; }, s);
    expect(calls).toBe(1); // second call served from cache
    expect(result).toMatchObject({ ok: true, record: wonderwall });
  });

  it('rejects a cached original record on revisit when the video is a translated cover', async () => {
    const s = storage();
    const original: LrclibRecord = { ...wonderwall, id: 7, trackName: 'Angel With A Shotgun', artistName: 'The Cab', duration: 225 };
    await s.set({ 'lc:7': original });
    await writeVideoMeta(s, 'cover1', { lrclibId: 7, offsetSec: 0 });
    let calls = 0;
    await handleFetchLyrics(
      { ...request, videoId: 'cover1', artist: 'The Cab', track: 'Angel With A Shotgun Thai.ver', durationSec: 225 },
      async () => { calls++; return []; },
      s,
    );
    expect(calls).toBeGreaterThan(0); // cache rejected → searched again
  });

  it('rejects a stale cache entry and re-searches when the cached record no longer matches', async () => {
    const s = storage();
    // Write a VideoMeta pointing at a record that has nothing to do with the
    // current request (Oasis/Wonderwall), simulating a prior wrong match.
    const staleRecord: LrclibRecord = {
      ...wonderwall,
      id: 200,
      trackName: 'Unrelated',
      artistName: 'Nobody',
      duration: 120,
    };
    await s.set({ 'vm:abc123': { lrclibId: 200, offsetSec: 0 } });
    await s.set({ 'lc:200': staleRecord });

    let searchCalled = false;
    const result = await handleFetchLyrics(
      request,
      async () => { searchCalled = true; return [wonderwall]; },
      s,
    );

    expect(searchCalled).toBe(true); // cache rejected, fresh search ran
    expect(result).toMatchObject({ ok: true, record: wonderwall });
  });

  it('preserves a previously stored offsetSec on a cache miss (re-search)', async () => {
    const s = storage();
    // First visit: search, cache, offset stays 0
    await handleFetchLyrics(request, async () => [wonderwall], s);
    // Simulate user having set offset manually after the first visit
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 1.25 });
    // Evict lyrics cache so it falls through to search
    await s.remove(['lc:99']);
    // Second visit: cache miss → re-search → should preserve offsetSec=1.25
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, offsetSec: 1.25 });
  });

  it('returns scrollSpeed=1 by default when no VideoMeta exists', async () => {
    const s = storage();
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1 });
  });

  it('preserves a previously stored scrollSpeed on a cache hit', async () => {
    const s = storage();
    await handleFetchLyrics(request, async () => [wonderwall], s);
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 0, scrollSpeed: 1.6 });
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1.6 });
  });

  it('preserves a previously stored scrollSpeed on a cache miss (re-search)', async () => {
    const s = storage();
    await handleFetchLyrics(request, async () => [wonderwall], s);
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 0, scrollSpeed: 1.6 });
    await s.remove(['lc:99']);
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1.6 });
  });

  it('resets scrollSpeed to 1 when a fresh search finds a different lrclibId', async () => {
    const s = storage();
    await s.set({ 'vm:abc123': { lrclibId: 200, offsetSec: 0, scrollSpeed: 2.0 } });
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, scrollSpeed: 1 });
  });
});
