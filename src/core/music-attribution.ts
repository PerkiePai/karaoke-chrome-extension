export interface MusicAttribution {
  title: string;
  artist: string;
  album: string | null;
}

export interface ArtTrackAttribution {
  title: string;
  artist: string;
}

const YT_INITIAL_DATA_PATTERN = /var ytInitialData\s*=\s*(\{.*?\});/s;
const YT_INITIAL_PLAYER_RESPONSE_PATTERN = /var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s;
// Middle dot · (U+00B7) separates track · artist in Art Track descriptions.
const ART_TRACK_PATTERN = /^Provided to YouTube by .+?\n\n(.+?) · (.+?)\n/m;
const STRUCTURED_DESCRIPTION_PANEL_ID = 'engagement-panel-structured-description';

/**
 * Extracts the "Music in this video" attribution (song/artist/album) from a
 * YouTube watch page's raw HTML, if present. Most videos carry no such data
 * — only ones YouTube's Content ID recognizes as licensed music — so a null
 * return is the common case, not an error.
 *
 * Reads the same `videoAttributeViewModel` JSON YouTube's own player renders
 * the "Music" info panel from — confirmed by fetching a known video's raw
 * HTML and inspecting the embedded `ytInitialData` blob (see SESSION.md,
 * Session 8). No DOM, no expand-panel click needed: the data is already in
 * the page source on load.
 *
 * The regex extraction is a known simplification (also flagged in
 * SESSION.md): a non-greedy match up to the first literal `};` can truncate
 * early if a string value inside the blob happens to contain that exact
 * substring. A truncated blob fails JSON.parse and this function returns
 * null — the same "no attribution data" outcome as a page that never had a
 * Music panel, never a thrown error.
 */
export function parseMusicAttribution(html: string): MusicAttribution | null {
  const match = html.match(YT_INITIAL_DATA_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  const vm = findVideoAttributeViewModel(data);
  if (!vm) return null;

  const title = typeof vm.title === 'string' ? vm.title : null;
  const artist = typeof vm.subtitle === 'string' ? vm.subtitle : null;
  if (!title || !artist) return null;

  const secondary = vm.secondarySubtitle;
  const album =
    typeof secondary === 'object' && secondary !== null && 'content' in secondary &&
    typeof (secondary as { content: unknown }).content === 'string'
      ? (secondary as { content: string }).content
      : null;

  return { title, artist, album };
}

/**
 * Extracts the "Provided to YouTube by" Art Track description block from a
 * YouTube watch page's raw HTML, if present. Only auto-generated label/
 * distributor uploads carry this block — most videos won't, so null is the
 * common case. The block's `Track · Artist` line uses a middle dot (U+00B7)
 * as a stable, machine-readable separator distinct from the ASCII hyphen used
 * in free-form titles.
 *
 * Reads `ytInitialPlayerResponse.videoDetails.shortDescription` — a separate
 * JSON blob from the `ytInitialData` the music-attribution panel uses, but
 * present in the same page HTML fetch, so no extra network call is needed.
 */
export function parseArtTrackDescription(html: string): ArtTrackAttribution | null {
  const match = html.match(YT_INITIAL_PLAYER_RESPONSE_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) return null;
  const videoDetails = (data as Record<string, unknown>)['videoDetails'];
  if (typeof videoDetails !== 'object' || videoDetails === null) return null;
  const desc = (videoDetails as Record<string, unknown>)['shortDescription'];
  if (typeof desc !== 'string') return null;

  const artMatch = desc.match(ART_TRACK_PATTERN);
  if (!artMatch) return null;

  const title = artMatch[1]?.trim();
  const artist = artMatch[2]?.trim();
  if (!title || !artist) return null;

  return { title, artist };
}

/**
 * Walks `ytInitialData.engagementPanels` to find the structured-description
 * panel, then its first card's `videoAttributeViewModel`. Every step is
 * optional-chained: this is untyped third-party JSON whose shape YouTube can
 * change at any time, and a shape mismatch should read as "no attribution
 * data" rather than throw.
 */
function findVideoAttributeViewModel(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null;
  const panels = (data as Record<string, unknown>)['engagementPanels'];
  if (!Array.isArray(panels)) return null;

  for (const panel of panels) {
    const renderer = panel?.engagementPanelSectionListRenderer;
    if (renderer?.panelIdentifier !== STRUCTURED_DESCRIPTION_PANEL_ID) continue;

    const items = renderer?.content?.structuredDescriptionContentRenderer?.items;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const cards = item?.horizontalCardListRenderer?.cards;
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        const vm = card?.videoAttributeViewModel;
        if (vm && typeof vm === 'object') return vm as Record<string, unknown>;
      }
    }
  }
  return null;
}
