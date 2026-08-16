import { mountPanel, PANEL_HOST_ID, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { decideReconcile } from './reconcile';
import { planRender } from './render-plan';
import { startSyncLoop, type SyncLoopHandle } from './sync-loop';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitleCandidates } from '../core/title-normalizer';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;
/** Raw title the displayed lyrics were fetched for; null while nothing is shown. */
let renderedTitle: string | null = null;
let isLoading = false;
/**
 * Bumped on every teardown and every load so in-flight async work can tell that
 * it has been superseded. Replaces comparing against currentVideoId, which could
 * not distinguish "same video, but we have started a fresh load".
 */
let generation = 0;

/** lrclibId of the record currently displayed; null while no lyrics are shown. */
let currentLrclibId: number | null = null;
/** Offset applied to the sync engine for the current video, in seconds. */
let currentOffsetSec = 0;
/** The running sync loop handle, so the nudge callback can update its offset. */
let currentSyncLoop: SyncLoopHandle | null = null;

/**
 * Cleanup for resources tied to whatever is currently displayed (today, just
 * the sync loop). Registered where the resource is created; run wherever that
 * display is about to be replaced — `teardown` (navigation) and `load` (a
 * same-video reload) both qualify, so this is centralized rather than
 * duplicated as an ad-hoc nullable variable at each call site.
 */
let disposers: Array<() => void> = [];

function addDisposer(dispose: () => void): void {
  disposers.push(dispose);
}

function disposeAll(): void {
  for (const dispose of disposers) dispose();
  disposers = [];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  disposeAll();
  panel?.destroy();
  panel = null;
  renderedTitle = null;
  currentLrclibId = null;
  currentOffsetSec = 0;
  currentSyncLoop = null;
  isLoading = false;
  generation += 1;
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

/** Mounts the panel for a newly-opened video, then loads its lyrics. */
async function activate(videoId: string): Promise<void> {
  const gen = generation;
  const container = await waitForSecondary();
  if (!container || gen !== generation) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  panel.onOffsetNudge((delta) => {
    currentOffsetSec += delta;
    // Clamp to a reasonable range to prevent runaway offsets.
    currentOffsetSec = Math.max(-30, Math.min(30, currentOffsetSec));
    currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
    panel!.setOffsetControls(true, currentOffsetSec);
    if (currentVideoId !== null && currentLrclibId !== null) {
      void chrome.storage.local.set({
        [`vm:${currentVideoId}`]: { lrclibId: currentLrclibId, offsetSec: currentOffsetSec },
      });
    }
  });

  await load(videoId, gen);
}

/** Fetches and renders lyrics. Safe to call again when the title changes. */
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const song = await waitForSong(videoId);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;

    const readings = normalizeTitleCandidates(song.rawTitle);
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');

    const request: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId,
      artist: primary.artist,
      track: primary.track,
      durationSec: song.durationSec,
      alternates: readings.slice(1),
    };

    let response: FetchLyricsResponse;
    try {
      response = await chrome.runtime.sendMessage<FetchLyricsRequest, FetchLyricsResponse>(request);
    } catch (error) {
      console.error('[karaoke] message failed', error);
      if (gen === generation && panel) {
        panel.setStatus('Extension worker unavailable. Reload the page.');
      }
      return;
    }

    if (gen !== generation || !panel) return;

    if (!response.ok) {
      disposeAll();
      panel.setStatus(response.message);
      panel.setLines([]);
      panel.setOffsetControls(false);
      return;
    }

    const { record } = response;
    currentLrclibId = response.lrclibId;
    currentOffsetSec = response.offsetSec;
    panel.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);

    // A previous load's sync loop (if any) is tied to lyrics we are about to
    // replace — stop it exactly when the content it drove stops being shown.
    disposeAll();
    panel.setStatus(plan.status);
    panel.setLines(plan.lines);

    if (plan.synced) {
      const video = document.querySelector('video');
      if (video) {
        const syncLoop = startSyncLoop(video, panel, plan.lines, currentOffsetSec * 1000);
        currentSyncLoop = syncLoop;
        addDisposer(() => { syncLoop.stop(); currentSyncLoop = null; });
        panel.setOffsetControls(true, currentOffsetSec);
      }
    } else {
      panel.setOffsetControls(false);
    }
  } finally {
    if (gen === generation) isLoading = false;
  }
}

function reconcile(): void {
  // YouTube can replace #secondary during its own initial render, silently
  // detaching the panel's host element from the DOM. Detect this and reset so
  // the next iteration triggers a fresh activate into the new #secondary.
  if (panel !== null && document.querySelector(`#${PANEL_HOST_ID}`) === null) {
    teardown();
    currentVideoId = null;
  }

  const urlVideoId = parseVideoId(location.href);
  const detectedTitle = urlVideoId ? (detectSong(document, urlVideoId)?.rawTitle ?? null) : null;

  const action = decideReconcile({
    urlVideoId,
    currentVideoId,
    detectedTitle,
    renderedTitle,
    hasPanel: panel !== null,
    isLoading,
  });

  switch (action.kind) {
    case 'idle':
      return;
    case 'clear':
      currentVideoId = null;
      teardown();
      return;
    case 'activate':
      currentVideoId = action.videoId;
      teardown();
      void activate(action.videoId).catch((error) => {
        console.error('[karaoke] activate failed', error);
      });
      return;
    case 'reload': {
      // A fresh generation invalidates whatever the previous load was awaiting.
      generation += 1;
      const gen = generation;
      void load(action.videoId, gen).catch((error) => {
        console.error('[karaoke] reload failed', error);
      });
      return;
    }
  }
}

// Primary signal; YouTube fires this on its own SPA navigations.
document.addEventListener('yt-navigate-finish', reconcile);
// Backup signal, and the mechanism that self-corrects a stale title read.
setInterval(reconcile, NAVIGATION_POLL_MS);

reconcile();
