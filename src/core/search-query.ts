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
  // "album" — e.g. a channel name "Phumin อัลบั้ม 2". Only surfaced once Thai
  // extraction became unconditional (below) instead of gated on a field
  // being >50% Thai — "Phumin อัลบั้ม 2" is exactly 50%, so this word never
  // reached extractThaiText before.
  'อัลบั้ม',
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
 * A run of letters/marks in any script — used only as the FALLBACK below, on
 * a field that has neither Thai nor Latin content (Japanese kana/kanji,
 * Chinese hanzi, Korean hangul, …). Scoped to `\p{L}`/`\p{M}` so it never
 * picks up bracket/quote punctuation left behind by `title-normalizer.ts`
 * (e.g. the corner brackets around a quoted Japanese title are not `\p{L}`).
 *
 * Without this, a field like `「右ポケット」` (title-normalizer correctly keeps
 * this — see its CJK_BRACKETED_NOISE comment) contributed NOTHING here once
 * the reading's other field had identifying Latin content: the whole query
 * collapsed to just the Latin field, e.g. `q=9Lana` instead of
 * `q=9Lana 右ポケット` — 20 unrelated same-artist results instead of the one
 * real match.
 */
const OTHER_SCRIPT_RUN = /[\p{L}\p{M}]+/gu;

// Anchored, non-global: THAI_RUN itself is `g`-flagged and stateful (its
// lastIndex persists across `.test()` calls), which would silently corrupt
// every other call to it in this module — use a fresh, non-global regex here.
const ALL_THAI = /^[฀-๿]+$/;

function extractOtherScriptText(text: string): string {
  const runs = text.match(OTHER_SCRIPT_RUN) ?? [];
  return runs.filter((run) => !ALL_THAI.test(run)).join(' ');
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
 * Thai text is collected from EVERY field, unconditionally — not just one
 * that's predominantly Thai. A field can pair a short/moderate Thai title
 * with a much longer English parenthetical (a remaster/version/cover tag, or
 * a "From ..." source-work attribution) and fall under 50 % Thai by
 * codepoint count even though the Thai text is the only identifying part:
 * `"ลม (Remaster)"` is 17 % Thai, and dropping its Thai text left the query as
 * just `q=Remaster` (20 unrelated results); extracting it unconditionally
 * gives `q=ลม Remaster`, which finds the exact record.
 *
 * The 50 % threshold still exists (`isPredominantlyThai`), but now gates only
 * whether a field's OWN Latin tokens are also kept — see the "Atom ชนกันต์"
 * case below. It admits "สุดทาง" (100 %) and "ความเชื่อ (Live)" (60 %) while
 * excluding "Phumin อัลบั้ม 2" (50 %) and "Live Session วสันต์17" (28 %).
 *
 * Latin tokens are extracted PER FIELD, and a field's own tokens are skipped
 * once that field is classified as predominantly Thai. Thai celebrities are
 * routinely credited with a mixed field like "Atom ชนกันต์" — a romanized
 * nickname glued to a Thai surname — where LRCLIB's record only stores the
 * all-Thai form ("อะตอม ชนกันต์"). Carrying "Atom" into the query as a
 * mandatory token used to zero out the result set even though the Thai text
 * alone finds the song: `q=ชนกันต์ PLEASE Atom` returns 0 results, `q=ชนกันต์
 * PLEASE` returns the exact match. A field that is NOT predominantly Thai
 * (e.g. "LOSO") still contributes its Latin tokens as before, since there the
 * Latin form is the artist's actual stage name, not a duplicate of the Thai.
 *
 * The result is ordering-independent: `buildSearchQuery('LOSO', 'คืนจันทร์')`
 * and `buildSearchQuery('คืนจันทร์', 'LOSO')` both return `'คืนจันทร์ LOSO'`,
 * so both orderings of a title share one request.
 */
export function buildSearchQuery(artist: string | null, track: string): string {
  const thaiParts: string[] = [];
  const otherScriptParts: string[] = [];
  const identifyingLatin: string[] = [];

  for (const field of [artist ?? '', track]) {
    const t = extractThaiText(field);
    if (t) thaiParts.push(t);

    if (isPredominantlyThai(field)) continue;

    const latin = field.match(LATIN_RUN) ?? [];
    for (const token of latin) {
      if (!isNonIdentifying(token)) identifyingLatin.push(token);
    }
    // A field with no Latin AND no Thai (Japanese/Chinese/Korean/etc.) would
    // otherwise contribute nothing at all once the OTHER field has Latin
    // content — see OTHER_SCRIPT_RUN's comment above for the concrete case.
    if (latin.length === 0) {
      const other = extractOtherScriptText(field);
      if (other) otherScriptParts.push(other);
    }
  }
  const foreignText = [...thaiParts, ...otherScriptParts].join(' ');

  if (identifyingLatin.length) {
    return foreignText
      ? `${foreignText} ${identifyingLatin.join(' ')}`
      : identifyingLatin.join(' ');
  }

  // No identifying Latin — foreign-script text alone is the best retrieval
  // key available.
  if (foreignText) return foreignText;

  const source = `${artist ?? ''} ${track}`;
  return source.trim().replace(/\s+/g, ' ');
}
