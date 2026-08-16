import type { PanelHandle } from './panel';
import { computeAutoScrollTopPx } from './auto-scroll-engine';
import { isScrollSuspended } from './sync-engine';

export interface AutoScrollLoopHandle {
  stop(): void;
  /** Updates the auto-scroll rate and triggers an immediate recompute so the
   *  panel reflects the change without waiting for the next animation frame. */
  setSpeed(speed: number): void;
}

/**
 * Drives the lyrics list's scrollTop from `video`'s playback for unsynced
 * (plain-text) lyrics, which carry no per-line timestamps to key off. Scroll
 * position is a linear function of `video.currentTime` over `durationSec`,
 * scaled by a user-adjustable `speed` multiplier — the same play/pause/rAF
 * lifecycle as `sync-loop.ts`, but continuous instead of stepped.
 */
export function startAutoScrollLoop(
  video: HTMLVideoElement,
  panel: PanelHandle,
  durationSec: number,
  initialSpeed = 1,
): AutoScrollLoopHandle {
  let speed = initialSpeed;
  let lastManualScrollAtMs: number | null = null;
  let rafId: number | null = null;

  function apply(): void {
    if (isScrollSuspended(lastManualScrollAtMs, Date.now())) return;
    const extentPx = panel.getScrollExtentPx();
    const top = computeAutoScrollTopPx(video.currentTime * 1000, durationSec * 1000, extentPx, speed);
    panel.setScrollTop(top);
  }

  function frame(): void {
    apply();
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

  function handleManualScroll(): void {
    lastManualScrollAtMs = Date.now();
  }

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeked', apply);
  panel.onManualScroll(handleManualScroll);

  apply();                          // reflect the current position immediately
  if (!video.paused) handlePlay();

  return {
    stop() {
      handlePause();
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', apply);
      panel.onManualScroll(() => {});
    },
    setSpeed(newSpeed) {
      speed = newSpeed;
      apply();
    },
  };
}
