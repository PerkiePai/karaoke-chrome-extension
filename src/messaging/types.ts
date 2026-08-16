import type { LrclibRecord } from '../core/types';

export interface FetchLyricsRequest {
  type: 'FETCH_LYRICS';
  videoId: string;
  artist: string | null;
  track: string;
  durationSec: number | null;
  /**
   * Other readings of the same title to try against the candidate set, e.g. the
   * `Song - Artist` ordering common on Thai uploads. All readings share one
   * search request.
   */
  alternates?: { artist: string | null; track: string }[];
}

export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord; lrclibId: number; offsetSec: number }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
