import type { LrclibRecord } from './types';

export interface MatchInput {
  artist: string | null;
  track: string;
  durationSec: number | null;
}

export interface ScoredCandidate {
  record: LrclibRecord;
  score: number;
  /** Track-name similarity alone, before weighting. Gates the match. */
  trackSimilarity: number;
  /**
   * Artist-name similarity alone, before weighting, or null when the reading
   * carries no artist (nothing to compare, so nothing to gate on).
   */
  artistSimilarity: number | null;
}

export const MATCH_THRESHOLD = 0.55;

/**
 * A candidate must clear this on track-name similarity alone, independently of
 * its weighted total. Without it, a matching artist plus an unknown duration
 * puts the floor at 0.45, so nearly any track name clears MATCH_THRESHOLD --
 * measured: คืนจันทร์ matched ครึ่งทาง at 0.561.
 */
export const MIN_TRACK_SIMILARITY = 0.35;

/**
 * The artist axis needs its own floor for the same reason the track axis does,
 * and its absence is what let the two gates be walked around together.
 *
 * A title like `คืนจันทร์ - LOSO 【OFFICIAL MV】LOSO` normalises to the reading
 * artist=`คืนจันทร์`, track=`LOSO`. Against any SELF-TITLED record -- artistName
 * equal to trackName, e.g. `Loso` by `Sek Loso`, `Bodyslam` by `Bodyslam` --
 * that reading scores trackSimilarity 1.000 and sails through
 * MIN_TRACK_SIMILARITY, while the artist term contributes essentially nothing.
 * WEIGHT_TRACK * 1.0 plus the duration term alone reaches 0.60-0.70, over
 * MATCH_THRESHOLD, so a song LRCLIB does not have was shown as one it does.
 * Measured live on คืนจันทร์/Loso and, in BOTH orderings, ความเชื่อ/BODYSLAM.
 *
 * Gating on the artist axis too means a candidate has to resemble the wanted
 * song on BOTH names, not just whichever one happens to line up. Skipped when
 * the reading's artist is null: that means "no ordering information", which
 * must stay usable rather than becoming an automatic rejection.
 */
export const MIN_ARTIST_SIMILARITY = 0.3;

const WEIGHT_TRACK = 0.5;
const WEIGHT_ARTIST = 0.3;
const WEIGHT_DURATION = 0.2;
const VARIANT_PENALTY = 0.25;
const SYNCED_BONUS = 0.05;

/** Seconds of difference at which duration similarity reaches zero. */
const DURATION_TOLERANCE_SEC = 20;

/** Score used when a signal is unavailable — neither rewards nor punishes. */
const NEUTRAL = 0.5;

/**
 * Exported so other modules reuse this one list rather than growing a second
 * copy that drifts out of step with it — see `buildSearchQuery`, which must not
 * treat these as identifying search terms.
 */
export const VARIANT_WORDS = ['live', 'acoustic', 'cover', 'remix', 'instrumental', 'session'] as const;

const VARIANT_PATTERNS = VARIANT_WORDS.map(
  (word) => [word, new RegExp(`\\b${word}\\b`, 'i')] as const,
);

// NFC per the Thai rule in the design; no tone-mark folding.
function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Normalized edit-distance similarity from 0 to 1. Script-agnostic. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

function variantTags(text: string): Set<string> {
  return new Set(
    VARIANT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([word]) => word),
  );
}

function sameVariant(a: string, b: string): boolean {
  const left = variantTags(a);
  const right = variantTags(b);
  if (left.size !== right.size) return false;
  for (const tag of left) if (!right.has(tag)) return false;
  return true;
}

function durationScore(wanted: number | null, candidate: number | null): number {
  if (wanted === null || candidate === null) return NEUTRAL;
  const diff = Math.abs(wanted - candidate);
  return 1 - Math.min(diff / DURATION_TOLERANCE_SEC, 1);
}

export function scoreCandidates(
  input: MatchInput,
  candidates: LrclibRecord[],
): ScoredCandidate[] {
  return candidates
    .map((record) => {
      const trackSimilarity = similarity(input.track, record.trackName);
      const artistSimilarity =
        input.artist === null ? null : similarity(input.artist, record.artistName);

      let score =
        WEIGHT_TRACK * trackSimilarity +
        WEIGHT_ARTIST * (artistSimilarity ?? NEUTRAL) +
        WEIGHT_DURATION * durationScore(input.durationSec, record.duration);

      if (!sameVariant(input.track, record.trackName)) score -= VARIANT_PENALTY;
      if (record.syncedLyrics) score += SYNCED_BONUS;

      return { record, score, trackSimilarity, artistSimilarity };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * True when a record can actually put lyrics on screen. Records that cannot are
 * excluded outright rather than penalised: a karaoke/instrumental cut with a
 * closer duration otherwise outscores the vocal record it sits beside, and the
 * weights are verified constants that must not be re-tuned.
 */
export function hasUsableLyrics(record: LrclibRecord): boolean {
  if (record.instrumental) return false;
  return Boolean(record.syncedLyrics?.trim() || record.plainLyrics?.trim());
}

export function pickBestScored(
  input: MatchInput,
  candidates: LrclibRecord[],
): ScoredCandidate | null {
  for (const candidate of scoreCandidates(input, candidates)) {
    // Sorted by score descending, so once one falls short none after it clears.
    if (candidate.score < MATCH_THRESHOLD) return null;
    if (candidate.trackSimilarity < MIN_TRACK_SIMILARITY) continue;
    // Both axes gate independently. One strong axis must not carry a candidate
    // over the line on its own — that is how a self-titled record matched a
    // reading whose track name was really the artist's name.
    if (candidate.artistSimilarity !== null && candidate.artistSimilarity < MIN_ARTIST_SIMILARITY) {
      continue;
    }
    return candidate;
  }
  return null;
}

export function pickBestMatch(
  input: MatchInput,
  candidates: LrclibRecord[],
): LrclibRecord | null {
  return pickBestScored(input, candidates.filter(hasUsableLyrics))?.record ?? null;
}
