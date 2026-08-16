import { VARIANT_WORDS } from './match-scorer';

/**
 * A run of Latin letters or digits, plus punctuation that appears inside names.
 * The leading character class includes the apostrophe too, so a token like
 * "'n'" keeps its opening quote instead of losing it to the run boundary.
 */
const LATIN_RUN = /[A-Za-z0-9'][A-Za-z0-9'&.\-]*/g;

const ALL_DIGITS = /^[0-9]+$/;

const THAI_RUN = /[฀-๿]+/g;

/**
 * Thai words that appear as title noise in YouTube music videos but carry no
 * identifying information. "เพลง" (phleng) means "song" and frequently
 * prefixes the actual track name ("เพลง นายหญิง" → real name "นายหญิง").
 */
const THAI_STOP_WORDS = new Set([
  'เพลง', // "song" — e.g. "เพลง นายหญิง" → real track name is "นายหญิง"
]);

/**
 * True for a Latin token that names nothing.
 *
 * `title-normalizer.ts` deliberately keeps variant markers ("the match scorer
 * relies on those surviving"), and a title can carry a bare take number. Either
 * is fine as one term among several, but neither identifies a song on its own:
 * `q=Live` returns twenty unrelated tracks by a band literally called Live.
 */
function isNonIdentifying(token: string): boolean {
  if (ALL_DIGITS.test(token)) return true;
  const lower = token.toLowerCase();
  return VARIANT_WORDS.some((word) => word === lower);
}

/**
 * Extracts Thai-script runs from `text`, drops known noise words, and returns
 * them space-joined. Empty string when no meaningful Thai text remains.
 */
function extractThaiText(text: string): string {
  const runs = text.match(THAI_RUN) ?? [];
  return runs.filter((run) => !THAI_STOP_WORDS.has(run)).join(' ');
}

/**
 * True when the non-whitespace content of `text` is more than half Thai
 * codepoints — the field is a real Thai title, not a Latin name with a stray
 * Thai word. "Phumin อัลบั้ม 2" is exactly 50 % Thai and correctly returns
 * false; "สุดทาง" is 100 % and returns true.
 */
function isPredominantlyThai(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  if (!stripped) return false;
  const thaiLen = (text.match(THAI_RUN) ?? []).join('').length;
  return thaiLen / stripped.length > 0.5;
}

/**
 * Builds the query string sent to LRCLIB's search endpoint.
 *
 * LRCLIB's search cannot tokenise Thai on its own: `q=ใจสั่งมา` returns zero
 * results even though the track is present in the database with synced lyrics.
 * Latin tokens (typically the artist name) are therefore the primary retrieval
 * key. Thai text from a predominantly-Thai field is prepended when available
 * because it narrows a prolific artist's 20-result cap to the specific song:
 * `q=สุดทาง Phumin` returns 1 result; `q=Phumin` returns 20, none of which is
 * สุดทาง. Note that "appending Thai changes nothing" was a false assumption
 * made in Sprint 2.5 — measured on LOSO: `q=คืนจันทร์ LOSO` returns 19 hits
 * with คืนจันทร์ present, while `q=LOSO` returns 20 with คืนจันทร์ absent.
 *
 * Non-identifying Latin tokens (bare digits, variant markers) are excluded.
 * A bare `2` from a channel name like "Phumin อัลบั้ม 2" would otherwise
 * produce `q=Phumin 2` → 0 results. Where the token adds discrimination the
 * local scorer handles it: `trackSim("Yes 2", "Yes 2") = 1.0`.
 *
 * Thai text is collected from any field whose non-whitespace content is more
 * than 50 % Thai codepoints. This threshold admits "สุดทาง" (100 %) and
 * "ความเชื่อ (Live)" (60 %) while excluding "Phumin อัลบั้ม 2" (50 %) and
 * "Live Session วสันต์17" (28 %).
 *
 * The result is ordering-independent: `buildSearchQuery('LOSO', 'คืนจันทร์')`
 * and `buildSearchQuery('คืนจันทร์', 'LOSO')` both return `'คืนจันทร์ LOSO'`,
 * so both orderings of a title share one request.
 */
export function buildSearchQuery(artist: string | null, track: string): string {
  const source = `${artist ?? ''} ${track}`;
  const latin = source.match(LATIN_RUN);
  const identifyingLatin = latin?.filter((t) => !isNonIdentifying(t));

  // Collect meaningful Thai text from any predominantly-Thai field.
  const thaiParts: string[] = [];
  for (const field of [artist ?? '', track]) {
    if (!isPredominantlyThai(field)) continue;
    const t = extractThaiText(field);
    if (t) thaiParts.push(t);
  }
  const thaiText = thaiParts.join(' ');

  if (identifyingLatin?.length) {
    return thaiText
      ? `${thaiText} ${identifyingLatin.join(' ')}`
      : identifyingLatin.join(' ');
  }

  // No identifying Latin — Thai text alone is the best retrieval key available.
  if (thaiText) return thaiText;

  return source.trim().replace(/\s+/g, ' ');
}
