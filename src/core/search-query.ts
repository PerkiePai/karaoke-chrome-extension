import { VARIANT_WORDS } from './match-scorer';

/**
 * A run of Latin letters or digits, plus punctuation that appears inside names.
 * The leading character class includes the apostrophe too, so a token like
 * "'n'" keeps its opening quote instead of losing it to the run boundary.
 */
const LATIN_RUN = /[A-Za-z0-9'][A-Za-z0-9'&.\-]*/g;

const ALL_DIGITS = /^[0-9]+$/;

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
 * Builds the query string sent to LRCLIB's search endpoint.
 *
 * That endpoint cannot tokenize Thai: `q=ใจสั่งมา` returns zero results while
 * the track is present in the database with synced lyrics. So when any Latin
 * token exists we query with those alone -- typically the artist name -- which
 * returns the artist's catalogue with Thai track names intact, and the caller
 * matches the Thai locally. With no Latin at all there is nothing better to try
 * than the raw text.
 *
 * The Latin-only narrowing is taken only when at least one extracted token
 * actually identifies something. A Thai title whose sole Latin content is a
 * variant marker or a take number -- `ความเชื่อ (Live)`, `ครั้งหนึ่ง 2` -- would
 * otherwise be retrieved as `q=Live` or `q=2`, which is strictly worse than the
 * full-text fallback: it swaps "no results" for "twenty wrong ones". The check
 * gates the whole decision rather than pruning the token list, so a query that
 * has real terms keeps every one of them -- the `2` in `Rock 'n' Roll Train 2`
 * is a genuine discriminator once `Rock`/`Roll`/`Train` are alongside it.
 *
 * Note the result does not depend on which field held the Latin, so both
 * orderings of a title produce the same query and need only one request.
 *
 * Known limitation: narrowing to Latin discards the track name, so for a
 * prolific artist the wanted record can fall outside LRCLIB's 20-result cap.
 * Measured against the live API, appending the Thai text back changes nothing
 * (`q=LOSO ใจสั่งมา` returns exactly `q=LOSO`), so there is no cheap fix here --
 * it is a limit of the retrieval strategy, not of this function.
 */
export function buildSearchQuery(artist: string | null, track: string): string {
  const source = `${artist ?? ''} ${track}`;
  const latin = source.match(LATIN_RUN);
  if (latin && latin.some((token) => !isNonIdentifying(token))) return latin.join(' ');
  return source.trim().replace(/\s+/g, ' ');
}
