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

export function detectSong(doc: Document = document): DetectedSong | null {
  const rawTitle = readTitle(doc);
  if (!rawTitle) return null;

  const duration = doc.querySelector('video')?.duration;
  const durationSec =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : null;

  return { rawTitle, durationSec };
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
