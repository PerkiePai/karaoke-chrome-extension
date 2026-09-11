import {
  parseMusicAttribution,
  parseArtTrackDescription,
  type MusicAttribution,
  type ArtTrackAttribution,
} from '../core/music-attribution';
import { parseVideoCategory, parseMusicSignals } from '../core/video-category';

export type { MusicAttribution, ArtTrackAttribution };

export interface VideoPageSignals {
  attribution: MusicAttribution | null;
  artTrack: ArtTrackAttribution | null;
  category: string | null;
  hasCopyrightNotice: boolean;
  hasMusicKeyword: boolean;
}

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the video's own watch page once and extracts both the Music
 * attribution panel and YouTube's own video category from it — one network
 * round-trip serving two independent detection signals (see
 * `core/music-attribution.ts` and `core/video-category.ts`). Runs from the
 * content script (same-origin fetch to youtube.com, so no extra
 * host_permissions needed) rather than the background, since it needs no
 * privilege the page itself doesn't already have.
 *
 * Times out after FETCH_TIMEOUT_MS: this is a full page fetch (100KB+) for
 * bonus signals most videos don't need, and must never stall the primary
 * title-based lookup.
 */
export async function fetchVideoPageSignals(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoPageSignals> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
    });
    if (!response.ok) return { attribution: null, artTrack: null, category: null, hasCopyrightNotice: false, hasMusicKeyword: false };
    const html = await response.text();
    const { hasCopyrightNotice, hasMusicKeyword } = parseMusicSignals(html);
    return {
      attribution: parseMusicAttribution(html),
      artTrack: parseArtTrackDescription(html),
      category: parseVideoCategory(html),
      hasCopyrightNotice,
      hasMusicKeyword,
    };
  } catch {
    return { attribution: null, artTrack: null, category: null, hasCopyrightNotice: false, hasMusicKeyword: false };
  } finally {
    clearTimeout(timeout);
  }
}
