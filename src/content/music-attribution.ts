import { parseMusicAttribution, type MusicAttribution } from '../core/music-attribution';

export type { MusicAttribution };

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the video's own watch page and extracts its Music attribution, if
 * any. Runs from the content script (same-origin fetch to youtube.com, so no
 * extra host_permissions needed — see this plan's Global Constraints) rather
 * than the background, since it needs no privilege the page itself doesn't
 * already have.
 *
 * Times out after FETCH_TIMEOUT_MS: this is a full page fetch (100KB+) for a
 * bonus signal most videos don't have, and must never stall the primary
 * title-based lookup.
 */
export async function fetchMusicAttribution(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MusicAttribution | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    return parseMusicAttribution(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
