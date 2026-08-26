import type { LrclibRecord } from '../core/types';

export interface StorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface VideoMeta {
  lrclibId: number;
  offsetSec: number;
  /** Auto-scroll speed multiplier for unsynced (plain-text) lyrics, e.g.
   *  1.0 = default pace. Absent on VideoMeta written before Sprint 5 or for
   *  a video that has never shown unsynced lyrics. */
  scrollSpeed?: number;
}

const VM_PREFIX = 'vm:';
const LC_PREFIX = 'lc:';
const LC_ORDER_KEY = 'lc:order';
const NF_PREFIX = 'nf:';
const NF_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const UP_PREFIX = 'up:';
export const LYRICS_CACHE_MAX = 50;

/** Returns true when a valid (non-expired) not-found entry exists for this videoId. */
export async function isNotFoundCached(
  storage: StorageLike,
  videoId: string,
): Promise<boolean> {
  const key = `${NF_PREFIX}${videoId}`;
  const result = await storage.get([key]);
  const v = result[key];
  if (v != null && typeof v === 'object' && 'at' in v && typeof (v as { at: unknown }).at === 'number') {
    const age = Date.now() - (v as { at: number }).at;
    if (age < NF_TTL_MS) return true;
    await storage.remove([key]);
  }
  return false;
}

export async function writeNotFoundCache(storage: StorageLike, videoId: string): Promise<void> {
  await storage.set({ [`${NF_PREFIX}${videoId}`]: { at: Date.now() } });
}

export async function clearNotFoundCache(storage: StorageLike, videoId: string): Promise<void> {
  await storage.remove([`${NF_PREFIX}${videoId}`]);
}

/** Returns true when the user has manually picked a song for this video. */
export async function isUserPicked(storage: StorageLike, videoId: string): Promise<boolean> {
  const key = `${UP_PREFIX}${videoId}`;
  const result = await storage.get([key]);
  return !!result[key];
}

export async function writeUserPicked(storage: StorageLike, videoId: string): Promise<void> {
  await storage.set({ [`${UP_PREFIX}${videoId}`]: true });
}

export async function readVideoMeta(
  storage: StorageLike,
  videoId: string,
): Promise<VideoMeta | null> {
  const key = `${VM_PREFIX}${videoId}`;
  const result = await storage.get([key]);
  const v = result[key];
  if (v != null && typeof v === 'object' && 'lrclibId' in v && 'offsetSec' in v) {
    return v as VideoMeta;
  }
  return null;
}

export async function writeVideoMeta(
  storage: StorageLike,
  videoId: string,
  meta: VideoMeta,
): Promise<void> {
  await storage.set({ [`${VM_PREFIX}${videoId}`]: meta });
}

export async function readLyricsCache(
  storage: StorageLike,
  lrclibId: number,
): Promise<LrclibRecord | null> {
  const key = `${LC_PREFIX}${lrclibId}`;
  const result = await storage.get([key]);
  const v = result[key];
  return v != null ? (v as LrclibRecord) : null;
}

export async function writeLyricsCache(
  storage: StorageLike,
  lrclibId: number,
  record: LrclibRecord,
  maxEntries = LYRICS_CACHE_MAX,
): Promise<void> {
  const idStr = String(lrclibId);
  const orderResult = await storage.get([LC_ORDER_KEY]);
  const raw = orderResult[LC_ORDER_KEY];
  const order: string[] = Array.isArray(raw) ? raw : [];

  const updated = [idStr, ...order.filter((k) => k !== idStr)];

  const writes: Record<string, unknown> = {
    [`${LC_PREFIX}${lrclibId}`]: record,
    [LC_ORDER_KEY]: updated.slice(0, maxEntries),
  };
  await storage.set(writes);

  const evicted = updated.slice(maxEntries);
  if (evicted.length > 0) {
    await storage.remove(evicted.map((k) => `${LC_PREFIX}${k}`));
  }
}
