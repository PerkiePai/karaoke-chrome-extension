export interface MusicAttribution {
  title: string;
  artist: string;
  album: string | null;
}

const YT_INITIAL_DATA_PATTERN = /var ytInitialData\s*=\s*(\{.*?\});/s;
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
