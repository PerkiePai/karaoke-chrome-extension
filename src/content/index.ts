import { mountPanel, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitle } from '../core/title-normalizer';
import { planRender } from './render-plan';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  panel?.destroy();
  panel = null;
}

async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    if (el) return el;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

/**
 * The heading and the video's duration both appear after navigation settles, so
 * poll rather than reading once and giving up.
 *
 * INVARIANT: the navigation poll may fire before the DOM updates — YouTube
 * pushes the new URL while the heading and the reused <video> element still
 * hold the PREVIOUS video's data. So detection must verify the page's own video
 * id, and a title alone is not enough to stop polling: keep going until the
 * duration is readable too, since a missing duration silently costs the scorer
 * its main disambiguator. The timeout is the guard for both.
 */
async function waitForSong(videoId: string): Promise<DetectedSong | null> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  let withoutDuration: DetectedSong | null = null;

  while (Date.now() < deadline) {
    const song = detectSong(document, videoId);
    if (song) {
      if (song.durationSec !== null) return song;
      withoutDuration = song;
    }
    await delay(SECONDARY_POLL_MS);
  }

  return withoutDuration;
}

async function activate(videoId: string): Promise<void> {
  const container = await waitForSecondary();
  if (!container || currentVideoId !== videoId) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  const song = await waitForSong(videoId);
  if (currentVideoId !== videoId || !panel) return;

  if (!song) {
    panel.setStatus('Could not read the video title.');
    return;
  }

  const { artist, track } = normalizeTitle(song.rawTitle);
  panel.setHeader(track, artist ?? 'unknown artist');

  const request: FetchLyricsRequest = {
    type: 'FETCH_LYRICS',
    videoId,
    artist,
    track,
    durationSec: song.durationSec,
  };

  let response: FetchLyricsResponse;
  try {
    response = await chrome.runtime.sendMessage<FetchLyricsRequest, FetchLyricsResponse>(request);
  } catch (error) {
    console.error('[karaoke] message failed', error);
    if (currentVideoId === videoId && panel) {
      panel.setStatus('Extension worker unavailable. Reload the page.');
    }
    return;
  }

  if (currentVideoId !== videoId || !panel) return;

  if (!response.ok) {
    panel.setStatus(response.message);
    panel.setLines([]);
    return;
  }

  const { record } = response;
  panel.setHeader(record.trackName, record.artistName);

  const plan = planRender(record);
  panel.setStatus(plan.status);
  panel.setLines(plan.lines);
}

function onLocationChanged(): void {
  const videoId = parseVideoId(location.href);
  if (videoId === currentVideoId) return;
  currentVideoId = videoId;
  teardown();
  if (videoId) void activate(videoId);
}

document.addEventListener('yt-navigate-finish', onLocationChanged);
setInterval(onLocationChanged, NAVIGATION_POLL_MS);

onLocationChanged();
