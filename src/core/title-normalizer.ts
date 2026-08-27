export interface ParsedTitle {
  artist: string | null;
  track: string;
}

/**
 * `X 【…】 X` / `X […] X` / `X (…) X` -> `X 【…】` / `X […]` / `X (…)`.
 *
 * YouTube uploaders often append the channel name after a bracketed tag, so the
 * artist ends up twice once the tag is stripped. Requiring a bracketed run
 * BETWEEN the two copies is what keeps this from eating "Bye Bye Bye".
 * Capped at four words, and applied before noise stripping removes the brackets.
 *
 * This drops only the DUPLICATE and hands the bracket back untouched (group 2),
 * leaving it to the strippers below to decide the bracket's fate. Consuming the
 * bracket here as well destroyed variant tags the match scorer needs: with a
 * blanket `\([^)]*\)` the shape `Coldplay - Yellow (Live) Yellow` collapsed to
 * the studio reading `Yellow`, silently losing the (Live) that every other
 * pattern in this module is scoped to preserve. Handing the bracket back keeps
 * each pattern responsible for one thing: `【OFFICIAL MV】` and `[Official MV]`
 * still disappear via the noise strippers, while `(Live)` survives them and so
 * survives this.
 */
// （） is the full-width paren Japanese/Chinese titles use in place of ASCII
// (), e.g. "好きだから。（feat.れん）/『ユイカ』【MV】" — without it, "（feat.れん）"
// survives every stripper below and its lone Latin run ("feat.") becomes the
// ENTIRE lrclib query, since search-query.ts treats any surviving Latin token
// as identifying.
const DUPLICATED_ACROSS_BRACKETS =
  /(\S+(?:\s+\S+){0,3})(\s*(?:【[^】]*】|「[^」]*」|\[[^\]]*\]|\([^)]*\)|（[^）]*）))\s*\1\s*$/i;

// Shared by every bracket-noise pattern below so the promo-word list can't
// drift out of step between the ASCII/full-width and CJK bracket variants.
const PROMO_KEYWORDS_SRC = '(?:official|lyrics?|audio|m\\/?v|visualizer|teaser|hd|4k|\\d{3,4}p)';

// Bracketed promo tags. Note the absence of live/acoustic/cover/remix:
// the match scorer relies on those surviving.
const BRACKETED_NOISE = new RegExp(
  `[([（]\\s*[^)\\]）]*\\b${PROMO_KEYWORDS_SRC}\\b[^)\\]）]*\\s*[)\\]）]`,
  'gi',
);

// 【】 and 「」/『』 are NOT interchangeable with a promo bracket: 【】 sometimes
// wraps the artist name (「Musician's Name」Song Title is a real convention),
// and 「」/『』 are literally Japan's quotation mark (kagi kakko) — routinely
// used to quote the actual song title, e.g. 【MV】「右ポケット」/ 9Lana, where
// 「右ポケット」 IS the track name. Blindly stripping every 【】/「」 span (the
// old behaviour) deleted that title outright and left a query of just the
// artist name, which returns 20 unrelated same-artist tracks on lrclib
// instead of the one requested. Gating on the same promo-keyword check
// BRACKETED_NOISE already uses for ASCII/full-width parens fixes this: a
// promo tag like 【OFFICIAL MV】 still strips (contains a keyword), while a
// quoted title like 「右ポケット」 does not (no keyword) and survives to be
// picked up by search-query.ts.
const CJK_BRACKETED_NOISE = new RegExp(
  `(?:【[^】]*\\b${PROMO_KEYWORDS_SRC}\\b[^】]*】|「[^」]*\\b${PROMO_KEYWORDS_SRC}\\b[^」]*」)`,
  'gi',
);

// Featured-artist credits come in two shapes and must be handled separately.
// A bracketed credit may safely run to its closing bracket. A BARE credit has no
// closing bracket, so it must stop at the artist/track separator or end of
// string — a greedy `[^)\]]*` there swallows the separator and the track with it.
// The `\b` is load-bearing: without it `ft` matches inside "Swift".
// `\s*` (not `\s+`) after the keyword: Japanese titles glue the credited name
// straight on with no space, e.g. "（feat.れん）".
const FEATURED_BRACKETED = /\s*[([（]\s*\b(?:featuring|feat\.?|ft\.?)\s*[^)\]）]*[)\]）]/gi;
const FEATURED_BARE = /\s*\b(?:featuring|feat\.?|ft\.?)\s+.*?(?=\s+[-–—|]\s|$)/gi;

const BARE_NOISE = [
  // Trailing pipe suffixes, restricted to known promo words: a pipe can also
  // appear legitimately in a title, so this must never strip every suffix.
  /\|\s*(?:official|lyrics?|audio|m\/?v|visualizer|teaser)\b[^|]*$/gi,
  /\bofficial\s+(?:music\s+)?video\b/gi,
  /\bofficial\s+(?:audio|mv)\b/gi,
  /(?:\s+\b(?:hd|4k|1080p|720p)\b)+\s*$/gi,
  // Language-version qualifiers after a separator — e.g. "Love To Death - English".
  // A single language word at the tail carries no identifying information and
  // poisons lrclib queries (q=… English → 0 results).
  /\s*[-–—|]\s*(?:english|thai|japanese|korean|chinese|spanish|french|german|portuguese|italian|arabic|hindi)\s*$/gi,
];

// A slash separator is only trusted when whitespace touches at least one
// side ("Track / Artist", "Track/ Artist"). A bare "/" with no adjacent
// space is left alone so it doesn't split an artist name like "AC/DC".
const SEPARATORS = [' - ', ' – ', ' — ', ' | ', ' /', '/ '];

const EDGE_JUNK = /^[-–—|:\s]+|[-–—|:\s]+$/g;

/** Turns a raw YouTube video title into a best-guess artist and track. */
export function normalizeTitle(rawTitle: string): ParsedTitle {
  let text = rawTitle.normalize('NFC');

  // Must run before the bracket strippers: the brackets are the evidence.
  text = text.replace(DUPLICATED_ACROSS_BRACKETS, '$1$2');

  text = text.replace(CJK_BRACKETED_NOISE, ' ');
  text = text.replace(BRACKETED_NOISE, ' ');
  text = text.replace(FEATURED_BRACKETED, ' ');
  text = text.replace(FEATURED_BARE, ' ');
  for (const pattern of BARE_NOISE) text = text.replace(pattern, ' ');

  text = text.replace(/\s+/g, ' ').trim().replace(EDGE_JUNK, '').trim();

  // The separator is chosen by POSITION, not by the order of SEPARATORS: the
  // artist is whatever precedes the first separator in the string, so a later
  // hyphen must never beat an earlier em dash.
  const candidates = SEPARATORS.map((separator) => ({
    separator,
    // index > 0 so a leading separator never yields an empty artist.
    index: text.indexOf(separator),
  }))
    .filter(({ index }) => index > 0)
    .sort((a, b) => a.index - b.index);

  for (const { separator, index } of candidates) {
    const artist = text.slice(0, index).trim();
    const track = text.slice(index + separator.length).trim();
    if (artist && track) return { artist, track };
  }

  return { artist: null, track: text };
}

/**
 * Every plausible reading of a title, best guess first.
 *
 * Thai uploads commonly run `Song - Artist`, the reverse of the Western
 * `Artist - Song`. Which one is right is not decidable from the title alone, so
 * both are offered and the match scorer picks — only one of them will resemble
 * a real record.
 */
export function normalizeTitleCandidates(rawTitle: string): ParsedTitle[] {
  const primary = normalizeTitle(rawTitle);
  if (primary.artist === null) return [primary];
  return [primary, { artist: primary.track, track: primary.artist }];
}
