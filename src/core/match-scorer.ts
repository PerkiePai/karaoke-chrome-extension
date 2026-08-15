import type { LrclibRecord } from './types';

export interface MatchInput {
  artist: string | null;
  track: string;
  durationSec: number | null;
}

export interface ScoredCandidate {
  record: LrclibRecord;
  score: number;
}

export const MATCH_THRESHOLD = 0.55;

const WEIGHT_TRACK = 0.5;
const WEIGHT_ARTIST = 0.3;
const WEIGHT_DURATION = 0.2;
const VARIANT_PENALTY = 0.25;
const SYNCED_BONUS = 0.05;

/** Seconds of difference at which duration similarity reaches zero. */
const DURATION_TOLERANCE_SEC = 20;

/** Score used when a signal is unavailable — neither rewards nor punishes. */
const NEUTRAL = 0.5;

const VARIANT_WORDS = ['live', 'acoustic', 'cover', 'remix', 'instrumental'] as const;

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
      let score =
        WEIGHT_TRACK * similarity(input.track, record.trackName) +
        WEIGHT_ARTIST *
          (input.artist === null ? NEUTRAL : similarity(input.artist, record.artistName)) +
        WEIGHT_DURATION * durationScore(input.durationSec, record.duration);

      if (!sameVariant(input.track, record.trackName)) score -= VARIANT_PENALTY;
      if (record.syncedLyrics) score += SYNCED_BONUS;

      return { record, score };
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

export function pickBestMatch(
  input: MatchInput,
  candidates: LrclibRecord[],
): LrclibRecord | null {
  const best = scoreCandidates(input, candidates.filter(hasUsableLyrics))[0];
  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best.record;
}
