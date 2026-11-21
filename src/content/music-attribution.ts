import {
  parseMusicAttribution,
  parseArtTrackDescription,
  type MusicAttribution,
  type ArtTrackAttribution,
} from '../core/music-attribution';

export type { MusicAttribution, ArtTrackAttribution };

export interface VideoPageSignals {
  attribution: MusicAttribution | null;
  artTrack: ArtTrackAttribution | null;
}

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the video's own watch page once and extracts the Music attribution
 * panel and the Art Track description from it (see
 * `core/music-attribution.ts`). Runs from the
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
    if (!response.ok) return { attribution: null, artTrack: null };
    const html = await response.text();
    return {
      attribution: parseMusicAttribution(html),
      artTrack: parseArtTrackDescription(html),
    };
  } catch {
    return { attribution: null, artTrack: null };
  } finally {
    clearTimeout(timeout);
  }
}
