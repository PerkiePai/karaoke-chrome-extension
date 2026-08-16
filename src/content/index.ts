import { mountPanel, PANEL_HOST_ID, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { decideReconcile } from './reconcile';
import { planRender } from './render-plan';
import { startSyncLoop, type SyncLoopHandle } from './sync-loop';
import { startAutoScrollLoop, type AutoScrollLoopHandle } from './auto-scroll-loop';
import { fetchMusicAttribution } from './music-attribution';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitleCandidates } from '../core/title-normalizer';
import type { LyricLine } from '../core/types';
import type {
  FetchLyricsRequest,
  FetchLyricsResponse,
  SearchCandidatesRequest,
  SearchCandidatesResponse,
  PickCandidateRequest,
  PickCandidateResponse,
} from '../messaging/types';

// Scoped to ytd-watch-flexy: YouTube's home/browse page (ytd-browse) also has
// an element with id="secondary", and keeps it cached in the DOM (display:
// none) after navigating away rather than removing it. On the very first
// navigation from youtube.com to a watch page, that stale hidden element can
// sit earlier in the document than the real one, so a bare '#secondary'
// query silently mounts the panel into an invisible, orphaned container.
const SECONDARY_SELECTOR = 'ytd-watch-flexy #secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;
const OFFSET_MIN_SEC = -30;
const OFFSET_MAX_SEC = 30;
const SPEED_MIN = 0.3;
const SPEED_MAX = 3.0;

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
/** The LrclibRecord currently shown; null while no lyrics are loaded. */
let currentRecord: import('../core/types').LrclibRecord | null = null;
/** Offset applied to the sync engine for the current video, in seconds. */
let currentOffsetSec = 0;
/** Lines of the currently displayed SYNCED lyrics (empty when nothing synced
 *  is shown); tap-to-sync reads the first line's timeMs from this. */
let currentSyncedLines: LyricLine[] = [];
/** Auto-scroll speed multiplier for unsynced (plain-text) lyrics, restored per-video. */
let currentScrollSpeed = 1;
/** Duration of the video currently loaded, in seconds; null until known. The
 *  auto-scroll loop needs a total duration to scroll across. */
let currentDurationSec: number | null = null;
/** The running sync loop handle (synced lyrics only), so the nudge/tap-to-sync callbacks can update its offset. */
let currentSyncLoop: SyncLoopHandle | null = null;
/** The running auto-scroll loop handle (unsynced lyrics only), so the speed nudge callback can update its rate. */
let currentAutoScrollLoop: AutoScrollLoopHandle | null = null;

/**
 * Cleanup for resources tied to whatever is currently displayed (today, the
 * sync loop or the auto-scroll loop — never both at once). Registered where
 * the resource is created; run wherever that display is about to be replaced
 * — `teardown` (navigation) and `load` (a same-video reload) both qualify, so
 * this is centralized rather than duplicated as an ad-hoc nullable variable
 * at each call site.
 */
let disposers: Array<() => void> = [];

function addDisposer(dispose: () => void): void {
  disposers.push(dispose);
}

function disposeAll(): void {
  for (const dispose of disposers) dispose();
  disposers = [];
}

/**
 * Writes vm:${videoId} with the CURRENT offset/scroll-speed module state.
 * Centralized so the two Sprint 5 fields can't be forgotten at any one of
 * the four sites that need to persist them (offset nudge, tap-to-sync,
 * speed nudge, and a fresh load) — a plain per-site object literal is how
 * scrollSpeed would silently drop out of one of them.
 */
function persistVideoMeta(videoId: string, lrclibId: number, reason: string): void {
  console.log(
    `[karaoke] vm:write (${reason}) videoId=${videoId} lrclibId=${lrclibId}`,
    `offsetSec=${currentOffsetSec} scrollSpeed=${currentScrollSpeed}`,
  );
  void chrome.storage.local.set({
    [`vm:${videoId}`]: { lrclibId, offsetSec: currentOffsetSec, scrollSpeed: currentScrollSpeed },
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  disposeAll();
  panel?.destroy();
  panel = null;
  renderedTitle = null;
  currentLrclibId = null;
  currentRecord = null;
  currentOffsetSec = 0;
  currentSyncedLines = [];
  currentScrollSpeed = 1;
  currentDurationSec = null;
  currentSyncLoop = null;
  currentAutoScrollLoop = null;
  isLoading = false;
  generation += 1;
}

async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    // Belt-and-braces against the same class of bug recurring: a matched
    // element whose ancestor chain is display:none (e.g. a cached, inactive
    // page component) has no offsetParent even though it's connected to the
    // document, so querySelector alone can't tell it apart from a live one.
    if (el && el.offsetParent !== null) return el;
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
  // YouTube updates the <video> element (duration) before it updates the page
  // heading. A single poll can therefore return the new video's duration paired
  // with the previous video's title. Require two consecutive polls with the
  // same rawTitle before committing — adds one SECONDARY_POLL_MS of latency
  // but prevents writing the wrong lrclibId into storage.
  let candidate: DetectedSong | null = null;
  let withoutDuration: DetectedSong | null = null;

  while (Date.now() < deadline) {
    const song = detectSong(document, videoId);
    if (song) {
      if (song.durationSec !== null) {
        if (candidate !== null && candidate.rawTitle === song.rawTitle) {
          return song;
        }
        candidate = song;
      } else {
        withoutDuration = song;
        candidate = null;
      }
    } else {
      candidate = null;
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
    currentOffsetSec = Math.max(OFFSET_MIN_SEC, Math.min(OFFSET_MAX_SEC, currentOffsetSec));
    currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
    panel?.setOffsetControls(true, currentOffsetSec);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'nudge');
    }
  });

  panel.onTapSync(() => {
    // "Sync here": read video.currentTime at the click and compute the offset
    // that puts the first synced line exactly there. Motivating case: a
    // cold-open intro longer than the ±30s nudge range can reach in a
    // reasonable number of clicks — see SESSION.md Session 7.
    const video = document.querySelector('video');
    if (!video || currentSyncedLines.length === 0) return;
    const firstLineMs = currentSyncedLines[0]!.timeMs;
    currentOffsetSec = (firstLineMs - video.currentTime * 1000) / 1000;
    currentOffsetSec = Math.max(OFFSET_MIN_SEC, Math.min(OFFSET_MAX_SEC, currentOffsetSec));
    currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
    panel?.setOffsetControls(true, currentOffsetSec);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'tap-sync');
    }
  });

  panel.onSpeedNudge((delta) => {
    currentScrollSpeed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, currentScrollSpeed + delta));
    currentAutoScrollLoop?.setSpeed(currentScrollSpeed);
    panel?.setSpeedControls(true, currentScrollSpeed);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'speed-nudge');
    }
  });

  panel.onCorrectRequest(() => {
    // Pre-fill with the currently displayed track + artist, if we have them.
    const prefilledQuery =
      currentRecord !== null
        ? [currentRecord.trackName, currentRecord.artistName].filter(Boolean).join(' ')
        : '';
    panel!.enterSearchMode(prefilledQuery);
  });

  let searchInFlight = false;
  panel.onSearch(async (query) => {
    if (searchInFlight) return;
    searchInFlight = true;
    // Snapshot generation before the await so we can detect navigation that
    // happened while the search was in-flight and avoid writing results onto
    // the new video's panel.
    const searchGen = generation;
    panel!.setStatus('Searching…');
    try {
      let resp: SearchCandidatesResponse;
      try {
        resp = await chrome.runtime.sendMessage<SearchCandidatesRequest, SearchCandidatesResponse>({
          type: 'SEARCH_CANDIDATES',
          query,
        });
      } catch {
        if (searchGen !== generation || !panel) return;
        panel.setStatus('Search failed. Is the extension worker running?');
        panel.exitSearchMode();
        return;
      }
      if (searchGen !== generation || !panel) return;
      if (!resp.ok) {
        panel.setStatus(resp.message);
        panel.exitSearchMode();
        return;
      }
      if (resp.candidates.length === 0) {
        panel.setStatus('No results found. Try different keywords.');
        return;
      }
      panel.setStatus('');
      panel.showCandidates(resp.candidates);
    } finally {
      searchInFlight = false;
    }
  });

  panel.onCandidatePick((record) => {
    panel!.exitSearchMode();
    panel!.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);
    disposeAll();
    panel!.setStatus(plan.status);
    panel!.setLines(plan.lines, plan.synced);

    currentLrclibId = record.id;
    currentRecord = record;
    currentOffsetSec = 0; // reset offset when user manually picks a different song
    currentScrollSpeed = 1; // reset scroll speed too — it belonged to the previous pick

    if (currentVideoId !== null) {
      persistVideoMeta(currentVideoId, record.id, 'pick');
    }

    if (plan.synced) {
      currentSyncedLines = plan.lines;
      panel!.setOffsetControls(true, 0);
      panel!.setSpeedControls(false);
      const video = document.querySelector('video');
      if (video) {
        const loop = startSyncLoop(video, panel!, plan.lines, 0);
        currentSyncLoop = loop;
        addDisposer(() => { loop.stop(); currentSyncLoop = null; });
      }
    } else {
      currentSyncedLines = [];
      panel!.setOffsetControls(false);
      const video = document.querySelector('video');
      if (video && plan.lines.length > 0 && currentDurationSec !== null && currentDurationSec > 0) {
        panel!.setSpeedControls(true, currentScrollSpeed);
        const loop = startAutoScrollLoop(video, panel!, currentDurationSec, currentScrollSpeed);
        currentAutoScrollLoop = loop;
        addDisposer(() => { loop.stop(); currentAutoScrollLoop = null; });
      } else {
        panel!.setSpeedControls(false);
      }
    }

    if (currentVideoId !== null) {
      void chrome.runtime.sendMessage<PickCandidateRequest, PickCandidateResponse>({
        type: 'PICK_CANDIDATE',
        videoId: currentVideoId,
        record,
      });
    }
  });

  await load(videoId, gen);
}

/** Fetches and renders lyrics. Safe to call again when the title changes. */
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const [song, attribution] = await Promise.all([
      waitForSong(videoId),
      fetchMusicAttribution(videoId),
    ]);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;
    currentDurationSec = song.durationSec;

    const titleReadings = normalizeTitleCandidates(song.rawTitle);
    if (titleReadings[0]!.artist === null && song.channelName) {
      console.log(`[karaoke] using channel-name fallback artist: "${song.channelName}"`);
      titleReadings.push({ artist: song.channelName, track: titleReadings[0]!.track });
    }
    // The Music attribution panel, when present, is authoritative label
    // metadata (the same data YouTube's own Content ID system uses) rather
    // than a guess from the raw title — so it leads the reading list. It
    // still goes through the normal search + score gate below rather than
    // bypassing it outright: this codebase's hard-won lesson (SESSION.md,
    // "Hard-won lessons") is that no single heuristic, however confident,
    // gets to skip verification against the actual LRCLIB record.
    if (attribution) {
      console.log(`[karaoke] using Music attribution: "${attribution.title}" / "${attribution.artist}"`);
    }
    const readings = attribution
      ? [{ artist: attribution.artist, track: attribution.title }, ...titleReadings]
      : titleReadings;
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
      console.warn(`[karaoke] load failed for "${song.rawTitle}": ${response.reason} — ${response.message}`);
      disposeAll();
      panel.setStatus(response.message);
      panel.setLines([]);
      panel.setOffsetControls(false);
      panel.setSpeedControls(false);
      currentSyncedLines = [];
      return;
    }

    console.log(
      `[karaoke] load OK "${response.record.trackName} / ${response.record.artistName}"`,
      `lrclibId=${response.lrclibId} offsetSec=${response.offsetSec} scrollSpeed=${response.scrollSpeed}`,
      `durationSec=${song.durationSec ?? 'null'}`,
    );

    const { record } = response;
    // Preserve any live nudge/tap/speed change already applied this session;
    // only take the stored values on the first load for this video
    // (currentLrclibId was null before).
    if (currentLrclibId === null) {
      currentOffsetSec = response.offsetSec;
      currentScrollSpeed = response.scrollSpeed;
    }
    currentLrclibId = response.lrclibId;

    // Write VideoMeta HERE (not in the background) so that only the authoritative
    // response — the one that passed the generation check — persists to storage.
    persistVideoMeta(videoId, response.lrclibId, 'load');
    currentRecord = response.record;
    panel.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);

    // A previous load's sync loop or auto-scroll loop (if any) is tied to
    // content we are about to replace — stop it exactly when the content it
    // drove stops being shown.
    disposeAll();
    panel.setStatus(plan.status);
    panel.setLines(plan.lines, plan.synced);

    if (plan.synced) {
      currentSyncedLines = plan.lines;
      panel.setSpeedControls(false);
      const video = document.querySelector('video');
      if (video) {
        const syncLoop = startSyncLoop(video, panel, plan.lines, currentOffsetSec * 1000);
        currentSyncLoop = syncLoop;
        addDisposer(() => { syncLoop.stop(); currentSyncLoop = null; });
        panel.setOffsetControls(true, currentOffsetSec);
      } else {
        panel.setOffsetControls(false);
      }
    } else {
      currentSyncedLines = [];
      panel.setOffsetControls(false);
      const video = document.querySelector('video');
      if (video && plan.lines.length > 0 && song.durationSec !== null && song.durationSec > 0) {
        panel.setSpeedControls(true, currentScrollSpeed);
        const loop = startAutoScrollLoop(video, panel, song.durationSec, currentScrollSpeed);
        currentAutoScrollLoop = loop;
        addDisposer(() => { loop.stop(); currentAutoScrollLoop = null; });
      } else {
        panel.setSpeedControls(false);
      }
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
