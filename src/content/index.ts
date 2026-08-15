import { mountPanel, type PanelHandle } from './panel';
import { parseVideoId } from '../core/youtube-url';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;

function teardown(): void {
  panel?.destroy();
  panel = null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * YouTube builds #secondary after the initial document, and rebuilds it on
 * every SPA navigation, so it has to be waited for rather than queried once.
 */
async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    if (el) return el;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

async function activate(videoId: string): Promise<void> {
  const container = await waitForSecondary();
  if (!container) {
    console.warn('[karaoke] #secondary never appeared');
    return;
  }
  // The user may have navigated again while we were waiting.
  if (currentVideoId !== videoId) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', `video ${videoId}`);
  panel.setStatus('Panel mounted. Lyrics arrive in sprint 2.');
}

function onLocationChanged(): void {
  const videoId = parseVideoId(location.href);
  if (videoId === currentVideoId) return;
  currentVideoId = videoId;
  teardown();
  if (videoId) void activate(videoId);
}

// Primary signal. YouTube fires this on its own SPA navigations.
document.addEventListener('yt-navigate-finish', onLocationChanged);
// Backup: yt-navigate-finish is undocumented and does get missed.
setInterval(onLocationChanged, NAVIGATION_POLL_MS);

onLocationChanged();
