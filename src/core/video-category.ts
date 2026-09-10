const YT_INITIAL_PLAYER_RESPONSE_PATTERN = /var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s;

/**
 * YouTube's own category taxonomy, restricted to the categories where a
 * karaoke lyrics panel is implausible enough to skip auto-search by default.
 * Deliberately a denylist, not an allowlist: "Entertainment", "People &
 * Blogs", "Comedy", and "Film & Animation" all carry real music covers and
 * fan uploads in practice, so gating on anything short of "Music" itself
 * would silently break the common case this extension exists for. See
 * SESSION.md's "category gate" discussion — the panel must still mount and
 * offer manual search even when this returns true, never a hard block.
 */
const NON_MUSIC_CATEGORIES = new Set([
  'Gaming',
  'Sports',
  'News & Politics',
  'Howto & Style',
  'Science & Technology',
  'Autos & Vehicles',
  'Travel & Events',
  'Pets & Animals',
  'Education',
  'Nonprofits & Activism',
]);

/**
 * Extracts YouTube's own video category (e.g. "Music", "Gaming") from a watch
 * page's raw HTML. Verified against a real watch page's `ytInitialPlayerResponse`
 * blob (`microformat.playerMicroformatRenderer.category`) — same extraction
 * technique as `core/music-attribution.ts`'s `ytInitialData` parse, including
 * the same known truncation caveat: a non-greedy match up to the first `};`
 * can end early if a string value contains that exact substring, in which
 * case JSON.parse fails and this returns null (same as "no category found").
 */
export function parseVideoCategory(html: string): string | null {
  const match = html.match(YT_INITIAL_PLAYER_RESPONSE_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) return null;
  const microformat = (data as Record<string, unknown>)['microformat'];
  if (typeof microformat !== 'object' || microformat === null) return null;
  const renderer = (microformat as Record<string, unknown>)['playerMicroformatRenderer'];
  if (typeof renderer !== 'object' || renderer === null) return null;
  const category = (renderer as Record<string, unknown>)['category'];
  return typeof category === 'string' ? category : null;
}

/**
 * True only when the category confidently rules out a music video. Null/
 * unknown/"Music"/anything not in the denylist returns false, by design —
 * the extension never treats an ambiguous signal as a reason to go quiet.
 */
export function isConfidentlyNonMusic(category: string | null): boolean {
  return category !== null && NON_MUSIC_CATEGORIES.has(category);
}
