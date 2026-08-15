import type { LrclibRecord } from '../core/types';

export interface FetchLyricsRequest {
  type: 'FETCH_LYRICS';
  videoId: string;
  artist: string | null;
  track: string;
  durationSec: number | null;
}

export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
