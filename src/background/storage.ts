import type { LrclibRecord } from '../core/types';

export interface StorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface VideoMeta {
  lrclibId: number;
  offsetSec: number;
}

const VM_PREFIX = 'vm:';
const LC_PREFIX = 'lc:';
const LC_ORDER_KEY = 'lc:order';
export const LYRICS_CACHE_MAX = 50;

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
