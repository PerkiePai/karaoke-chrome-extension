import type { LyricLine } from '../core/types';
import type { PanelHandle } from './panel';
import { createSyncEngineState, tick, notifyManualScroll } from './sync-engine';

export interface SyncLoopHandle {
  stop(): void;
  /** Updates the offset applied to video.currentTime before computing the active line.
   *  Triggers an immediate recompute so the panel reflects the change without waiting
   *  for the next animation frame. */
  setOffsetMs(ms: number): void;
  /** Forces `index` to be highlighted AND scrolled to center, clearing any
   *  active manual-scroll suspension. Bypasses both of tick()'s guards
   *  (the "index unchanged" no-op and the suspension-driven autoScroll=false)
   *  since a clicked line is an explicit jump request, not the passive
   *  playback tracking those guards exist to protect from. */
  centerLine(index: number): void;
}

/**
 * Drives `panel.setActiveLine` from `video`'s playback, via the pure
 * sync-engine. The rAF chain only runs while the video is playing — a spec
 * requirement, and it avoids burning CPU on a paused tab. A `seeked` event
 * (a manual scrub, which can happen while paused) forces one recompute even
 * when no rAF chain is running.
 */
export function startSyncLoop(
  video: HTMLVideoElement,
  panel: PanelHandle,
  lines: LyricLine[],
  initialOffsetMs = 0,
): SyncLoopHandle {
  const state = createSyncEngineState();
  let offsetMs = initialOffsetMs;
  let rafId: number | null = null;

  function apply(): void {
    const result = tick(state, lines, video.currentTime * 1000 + offsetMs, Date.now());
    if (result) panel.setActiveLine(result.index, result.autoScroll);
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
    notifyManualScroll(state, Date.now());
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
    setOffsetMs(ms) {
      offsetMs = ms;
      apply();
    },
    centerLine(index) {
      state.lastManualScrollAtMs = null;
      state.activeIndex = index;
      panel.setActiveLine(index, true);
    },
  };
}
