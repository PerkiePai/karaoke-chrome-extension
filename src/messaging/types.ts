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
  /**
   * Set when the content script's soft category gate fired: YouTube's own
   * category confidently rules out music and no Music attribution panel
   * overrode it. Only skips the search when there is no prior VideoMeta for
   * this video — a previously cached or user-picked match always wins,
   * regardless of category. See `core/video-category.ts`.
   */
  skipSearchIfNonMusic?: boolean;
}

export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord; lrclibId: number; offsetSec: number; scrollSpeed: number }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network' | 'category-gated'; message: string };

export interface SearchCandidatesRequest {
  type: 'SEARCH_CANDIDATES';
  /** Raw user-typed query, passed verbatim to lrclib /search?q= */
  query: string;
}

export type SearchCandidatesResponse =
  | { ok: true; candidates: LrclibRecord[] }
  | { ok: false; reason: 'rate-limited' | 'network'; message: string };

export interface PickCandidateRequest {
  type: 'PICK_CANDIDATE';
  videoId: string;
  record: LrclibRecord;
}

export type PickCandidateResponse = { ok: true };

/** Forgets the user's manual correction for a video, reverting it to auto-detection. */
export interface ResetMatchRequest {
  type: 'RESET_MATCH';
  videoId: string;
}

export type ResetMatchResponse = { ok: true };
