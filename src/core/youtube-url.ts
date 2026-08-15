const WATCH_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

/** Returns the video id for a YouTube watch URL, or null for anything else. */
export function parseVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!WATCH_HOSTS.has(parsed.hostname)) return null;
  if (parsed.pathname !== '/watch') return null;
  return parsed.searchParams.get('v');
}
