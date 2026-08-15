import { mountPanel, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitle } from '../core/title-normalizer';
import { parseLrc } from '../core/lrc-parser';
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
 * The heading and the video's duration both appear after navigation settles,
 * so poll until a title exists rather than reading once and giving up.
 */
async function waitForSong(): Promise<DetectedSong | null> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const song = detectSong();
    if (song) return song;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

async function activate(videoId: string): Promise<void> {
  const container = await waitForSecondary();
  if (!container || currentVideoId !== videoId) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  const song = await waitForSong();
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

  if (record.syncedLyrics) {
    panel.setStatus('');
    panel.setLines(parseLrc(record.syncedLyrics).map((line) => line.text));
  } else if (record.plainLyrics) {
    panel.setStatus('No timings available for this track.');
    panel.setLines(record.plainLyrics.split(/\r?\n/));
  } else {
    panel.setStatus('This track is marked instrumental.');
    panel.setLines([]);
  }
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
