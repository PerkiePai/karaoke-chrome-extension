/** One record as returned by the LRCLIB search API. */
export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * One timed lyric line. `chords` is reserved for a future sprint and is
 * always absent today — see the design doc's chord hook section.
 */
export interface LyricLine {
  timeMs: number;
  text: string;
  chords?: { charIndex: number; symbol: string }[];
}
