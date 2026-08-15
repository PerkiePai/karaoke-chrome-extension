import type { LyricLine } from '../core/types';

/** How long, in ms, auto-scroll stays suspended after a manual scroll. */
export const SCROLL_SUSPEND_MS = 4000;

export interface SyncEngineState {
  activeIndex: number | null;
  lastManualScrollAtMs: number | null;
}

export function createSyncEngineState(): SyncEngineState {
  return { activeIndex: null, lastManualScrollAtMs: null };
}

/**
 * Index of the line active at `currentTimeMs`, or null before the first
 * line's timestamp (or if there are no lines).
 *
 * Binary search over `lines`, which parseLrc guarantees are sorted ascending
 * by timeMs. Finds the last line whose timeMs does not exceed currentTimeMs.
 */
export function findActiveLineIndex(lines: LyricLine[], currentTimeMs: number): number | null {
  if (lines.length === 0 || currentTimeMs < lines[0]!.timeMs) return null;

  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lines[mid]!.timeMs <= currentTimeMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** True while auto-scroll should stay suspended after a manual scroll. */
export function isScrollSuspended(lastManualScrollAtMs: number | null, nowMs: number): boolean {
  return lastManualScrollAtMs !== null && nowMs - lastManualScrollAtMs < SCROLL_SUSPEND_MS;
}

export interface SyncTick {
  index: number | null;
  autoScroll: boolean;
}

/**
 * Recomputes the active index for `currentTimeMs` and returns the tick the
 * panel should apply, or null if the index has not changed since the last
 * call — the caller must not touch the panel in that case, since the DOM
 * should update only when the active line actually moves.
 *
 * Mutates `state` in place: `state.activeIndex` tracks what the panel was
 * last told, and `state.lastManualScrollAtMs` is set by `notifyManualScroll`.
 * Deliberately takes no opinion on play/pause — a caller wants a tick from a
 * scrub (`seeked`) even while paused, so that decision belongs to the caller,
 * not this function.
 */
export function tick(
  state: SyncEngineState,
  lines: LyricLine[],
  currentTimeMs: number,
  nowMs: number,
): SyncTick | null {
  const index = findActiveLineIndex(lines, currentTimeMs);
  if (index === state.activeIndex) return null;
  state.activeIndex = index;
  return { index, autoScroll: !isScrollSuspended(state.lastManualScrollAtMs, nowMs) };
}

/** Records that the user just scrolled the lyric list by hand. */
export function notifyManualScroll(state: SyncEngineState, nowMs: number): void {
  state.lastManualScrollAtMs = nowMs;
}
