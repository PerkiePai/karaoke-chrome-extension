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
 *
 * A blank-text entry (the LRC convention for marking an instrumental gap, or
 * — most commonly — the song's end) never becomes the active line itself:
 * once currentTimeMs reaches one, this walks back to the nearest preceding
 * non-blank line instead, so that line stays highlighted through the gap
 * rather than the highlight silently going blank. For a trailing marker
 * (the common case), that non-blank line is the last real lyric, which then
 * stays active for the rest of the video since nothing later takes over.
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
  while (lo >= 0 && lines[lo]!.text === '') lo -= 1;
  return lo < 0 ? null : lo;
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
