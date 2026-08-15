import { parseVideoId } from '../core/youtube-url';

export interface DetectedSong {
  rawTitle: string;
  durationSec: number | null;
}

// Ordered most specific first. YouTube changes its markup often, so each
// selector is a fallback for the one before it.
const TITLE_SELECTORS = [
  'h1.ytd-watch-metadata yt-formatted-string',
  'h1.title yt-formatted-string',
  'meta[name="title"]',
] as const;

const WATCH_FLEXY_SELECTOR = 'ytd-watch-flexy[video-id]';
const CANONICAL_SELECTOR = 'link[rel="canonical"]';

/**
 * Reads the song for `expectedVideoId` from the page.
 *
 * INVARIANT: the caller's poll may fire before YouTube has swapped the DOM —
 * `pushState` updates the URL while the heading, and the reused `<video>`
 * element, still belong to the PREVIOUS video. So detection must verify the
 * page's own video id rather than trusting whatever the DOM holds right now.
 * When the page publishes no id at all (markup change), detection accepts what
 * it reads and leaves the caller's timeout as the only guard — degrading to the
 * old behaviour rather than failing shut.
 */
export function detectSong(
  doc: Document = document,
  expectedVideoId?: string | null,
): DetectedSong | null {
  if (!pageIdentityMatches(doc, expectedVideoId)) return null;

  const rawTitle = readTitle(doc);
  if (!rawTitle) return null;

  // The <video> element survives SPA navigation with a new src, so its duration
  // may still be NaN, the previous video's, or a pre-roll ad's. Only a finite
  // positive value is a real duration; the caller polls on null.
  const duration = doc.querySelector('video')?.duration;
  const durationSec =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : null;

  return { rawTitle, durationSec };
}

/**
 * Returns the video ids the page publishes about itself. Both sources are read
 * because YouTube's markup shifts; either one matching is enough.
 */
export function readPageVideoIds(doc: Document): string[] {
  const ids: string[] = [];

  const flexyId = doc.querySelector(WATCH_FLEXY_SELECTOR)?.getAttribute('video-id');
  if (flexyId) ids.push(flexyId);

  const canonical = doc.querySelector<HTMLLinkElement>(CANONICAL_SELECTOR)?.getAttribute('href');
  const canonicalId = canonical ? parseVideoId(canonical) : null;
  if (canonicalId) ids.push(canonicalId);

  return ids;
}

function pageIdentityMatches(doc: Document, expectedVideoId?: string | null): boolean {
  if (!expectedVideoId) return true;
  const ids = readPageVideoIds(doc);
  if (ids.length === 0) return true;
  return ids.includes(expectedVideoId);
}

function readTitle(doc: Document): string | null {
  for (const selector of TITLE_SELECTORS) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    const text = el instanceof HTMLMetaElement ? el.content : el.textContent;
    if (text && text.trim()) return text.trim();
  }
  return null;
}
