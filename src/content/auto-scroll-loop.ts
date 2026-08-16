import type { PanelHandle } from './panel';
import { computeAutoScrollTopPx, advanceAutoScrollTopPx } from './auto-scroll-engine';

export interface AutoScrollLoopHandle {
  stop(): void;
  /** Updates the auto-scroll rate. Takes effect on the next frame — no
   *  immediate repositioning, since (per the relative model below) there is
   *  no absolute position to jump to that wouldn't fight a manual scroll. */
  setSpeed(speed: number): void;
}

// A manual scroll (wheel/touch) moves the list by many pixels at once, so
// any DOM/internal-tracker mismatch bigger than this is a real scroll, not
// rounding noise from the browser storing scrollTop as an integer.
const MANUAL_SCROLL_EPSILON_PX = 1;

// The sweep holds at the top for the first EDGE_PAD_SEC of playback and
// reaches the bottom EDGE_PAD_SEC before the video ends, instead of mapping
// the full [0, duration] span onto the list — most tracks have a few
// seconds of instrumental intro/outro with no lyrics on screen yet.
const EDGE_PAD_SEC = 5;

/**
 * Drives the lyrics list's scrollTop from `video`'s playback for unsynced
 * (plain-text) lyrics, which carry no per-line timestamps to key off. The
 * same play/pause/rAF lifecycle as `sync-loop.ts`, but continuous instead of
 * stepped.
 *
 * Position is tracked internally as a float (`posPx`), independent of what
 * the DOM reports back — a real browser rounds `scrollTop` to a whole
 * pixel, and at speed 1 a single frame's advance is well under 1px (a 4
 * minute song over a typical panel height is a fraction of a px per 16ms
 * frame). Deriving next frame's base from the rounded-off DOM value would
 * throw that sub-pixel progress away every single frame — the list would
 * never move at normal speed, only becoming visible once per-frame deltas
 * got large enough (e.g. cranking video playback rate) to survive rounding.
 * `posPx` sidesteps that by accumulating in full precision and only writing
 * (lossy) pixel values out.
 *
 * A manual scroll still has to "stick" (the whole point of the relative
 * model over the old absolute-from-currentTime one) — so each frame compares
 * the DOM's actual scrollTop against what was last written. A gap bigger
 * than rounding noise means the user scrolled by hand; `posPx` rebases to
 * that DOM value and continues advancing from there. The one deliberate
 * exception is `seeked`: a scrub is a legitimate absolute jump, so it
 * resyncs to the video position outright via `computeAutoScrollTopPx`.
 *
 * A manual scroll never suspends the sweep — there is no per-line target to
 * lose track of, just a continuous advance, so fighting the user's scroll
 * would only be annoying. The only way to stop it is the explicit pause
 * button, and resuming continues from wherever the list was left (no
 * catch-up jump) since `lastVideoMs` keeps tracking elapsed video time even
 * while paused.
 */
export function startAutoScrollLoop(
  video: HTMLVideoElement,
  panel: PanelHandle,
  durationSec: number,
  initialSpeed = 1,
): AutoScrollLoopHandle {
  let speed = initialSpeed;
  let paused = false;
  let rafId: number | null = null;
  let lastVideoMs = video.currentTime * 1000;
  const durationMs = durationSec * 1000;
  // Cap the padding so it can never eat the whole track (a song under 10s
  // would otherwise never move at all).
  const edgePadMs = Math.min(EDGE_PAD_SEC * 1000, durationMs / 4);
  const effectiveDurationMs = durationMs - edgePadMs * 2;

  // Maps raw video ms onto the padded [0, effectiveDurationMs] window,
  // clamped flat before the lead-in and after the lead-out — this is what
  // makes the sweep hold at the top/bottom during those windows instead of
  // just moving proportionally slower across the whole track.
  function effectiveMs(rawMs: number): number {
    return Math.max(0, Math.min(effectiveDurationMs, rawMs - edgePadMs));
  }

  let posPx = 0;
  let lastWrittenPx = 0;

  function writeScrollTop(px: number): void {
    posPx = px;
    lastWrittenPx = px;
    panel.setScrollTop(px);
  }

  function snapToVideoTime(): void {
    const extentPx = panel.getScrollExtentPx();
    writeScrollTop(computeAutoScrollTopPx(effectiveMs(video.currentTime * 1000), effectiveDurationMs, extentPx, speed));
    lastVideoMs = video.currentTime * 1000;
  }

  function advance(): void {
    const domTop = panel.getScrollTop();
    if (Math.abs(domTop - lastWrittenPx) > MANUAL_SCROLL_EPSILON_PX) {
      // A hand scroll happened since our last write — adopt it as the new
      // base instead of overwriting it on the next line below.
      posPx = domTop;
      lastWrittenPx = domTop;
    }

    const nowMs = video.currentTime * 1000;
    const deltaEffMs = effectiveMs(nowMs) - effectiveMs(lastVideoMs);
    lastVideoMs = nowMs;
    if (paused) return;

    const extentPx = panel.getScrollExtentPx();
    writeScrollTop(advanceAutoScrollTopPx(posPx, deltaEffMs, effectiveDurationMs, extentPx, speed));
  }

  function frame(): void {
    advance();
    rafId = requestAnimationFrame(frame);
  }

  function handlePlay(): void {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function handlePause(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function handlePauseToggle(newPaused: boolean): void {
    paused = newPaused;
  }

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeked', snapToVideoTime);
  panel.onScrollPauseToggle(handlePauseToggle);

  snapToVideoTime();                // reflect the current position immediately
  if (!video.paused) handlePlay();

  return {
    stop() {
      handlePause();
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', snapToVideoTime);
      panel.onScrollPauseToggle(() => {});
    },
    setSpeed(newSpeed) {
      speed = newSpeed;
    },
  };
}
