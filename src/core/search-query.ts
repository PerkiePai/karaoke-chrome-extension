/**
 * A run of Latin letters or digits, plus punctuation that appears inside names.
 * The leading character class includes the apostrophe too, so a token like
 * "'n'" keeps its opening quote instead of losing it to the run boundary.
 */
const LATIN_RUN = /[A-Za-z0-9'][A-Za-z0-9'&.\-]*/g;

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
 * Note the result does not depend on which field held the Latin, so both
 * orderings of a title produce the same query and need only one request.
 */
export function buildSearchQuery(artist: string | null, track: string): string {
  const source = `${artist ?? ''} ${track}`;
  const latin = source.match(LATIN_RUN);
  if (latin && latin.length > 0) return latin.join(' ');
  return source.trim().replace(/\s+/g, ' ');
}
