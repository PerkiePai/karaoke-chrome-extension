import { describe, it, expect } from 'vitest';
import {
  readVideoMeta,
  writeVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  type StorageLike,
} from '../../src/background/storage';
import type { LrclibRecord } from '../../src/core/types';

function mockStorage(): StorageLike {
  const store = new Map<string, unknown>();
  return {
    async get(keys) {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store.has(key)) result[key] = store.get(key);
      }
      return result;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    async remove(keys) {
      for (const key of keys) store.delete(key);
    },
  };
}

const baseRecord: LrclibRecord = {
  id: 42,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: '[00:01.00]test line',
};

describe('readVideoMeta / writeVideoMeta', () => {
  it('returns null when nothing is stored for that videoId', async () => {
    const s = mockStorage();
    expect(await readVideoMeta(s, 'abc123')).toBeNull();
  });

  it('round-trips a VideoMeta', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0.75 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0.75 });
  });

  it('does not bleed across different videoIds', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0 });
    expect(await readVideoMeta(s, 'xyz789')).toBeNull();
  });

  it('overwrites an existing entry', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0 });
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0.5 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 1, offsetSec: 0.5 });
  });

  it('round-trips a VideoMeta that includes scrollSpeed', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0, scrollSpeed: 1.4 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0, scrollSpeed: 1.4 });
  });

  it('round-trips a VideoMeta without scrollSpeed (pre-Sprint-5 shape)', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0 });
  });
});

describe('readLyricsCache / writeLyricsCache', () => {
  it('returns null on cache miss', async () => {
    const s = mockStorage();
    expect(await readLyricsCache(s, 42)).toBeNull();
  });

  it('round-trips a record', async () => {
    const s = mockStorage();
    await writeLyricsCache(s, 42, baseRecord);
    expect(await readLyricsCache(s, 42)).toEqual(baseRecord);
  });

  it('evicts the least-recently-used entry when max is exceeded', async () => {
    const s = mockStorage();
    const r = (id: number): LrclibRecord => ({ ...baseRecord, id });
    // Write 3 with max=2: r(1) is LRU, should be evicted when r(3) is written
    await writeLyricsCache(s, 1, r(1), 2);
    await writeLyricsCache(s, 2, r(2), 2);
    await writeLyricsCache(s, 3, r(3), 2);
    expect(await readLyricsCache(s, 1)).toBeNull();
    expect(await readLyricsCache(s, 2)).toEqual(r(2));
    expect(await readLyricsCache(s, 3)).toEqual(r(3));
  });

  it('bumps a re-written entry to the front, protecting it from eviction', async () => {
    const s = mockStorage();
    const r = (id: number): LrclibRecord => ({ ...baseRecord, id });
    await writeLyricsCache(s, 1, r(1), 2);
    await writeLyricsCache(s, 2, r(2), 2);
    await writeLyricsCache(s, 1, r(1), 2); // re-access r(1) → moves to front
    await writeLyricsCache(s, 3, r(3), 2); // r(2) is now LRU → evicted
    expect(await readLyricsCache(s, 2)).toBeNull();
    expect(await readLyricsCache(s, 1)).toEqual(r(1));
    expect(await readLyricsCache(s, 3)).toEqual(r(3));
  });
});
