import { describe, it, expect } from 'vitest';
import {
  findActiveLineIndex,
  isScrollSuspended,
  createSyncEngineState,
  tick,
  notifyManualScroll,
  SCROLL_SUSPEND_MS,
} from '../../src/content/sync-engine';
import type { LyricLine } from '../../src/core/types';

const LINES: LyricLine[] = [
  { timeMs: 0, text: 'first' },
  { timeMs: 1000, text: 'second' },
  { timeMs: 2500, text: 'third' },
];

describe('findActiveLineIndex', () => {
  it('returns null for an empty line list', () => {
    expect(findActiveLineIndex([], 5000)).toBeNull();
  });

  it('returns null before the first line timestamp', () => {
    expect(findActiveLineIndex(LINES, -1)).toBeNull();
  });

  it('returns the first index exactly at its own timestamp', () => {
    expect(findActiveLineIndex(LINES, 0)).toBe(0);
  });

  it('returns the index whose timestamp is the latest one not exceeding the given time', () => {
    expect(findActiveLineIndex(LINES, 999)).toBe(0);
    expect(findActiveLineIndex(LINES, 1000)).toBe(1);
    expect(findActiveLineIndex(LINES, 2499)).toBe(1);
  });

  it('returns the last index once time reaches or passes it', () => {
    expect(findActiveLineIndex(LINES, 2500)).toBe(2);
    expect(findActiveLineIndex(LINES, 999_999)).toBe(2);
  });
});

describe('isScrollSuspended', () => {
  it('is not suspended when there has been no manual scroll', () => {
    expect(isScrollSuspended(null, 10_000)).toBe(false);
  });

  it('is suspended immediately after a manual scroll', () => {
    expect(isScrollSuspended(1000, 1000)).toBe(true);
  });

  it('is suspended right up to the threshold', () => {
    expect(isScrollSuspended(1000, 1000 + SCROLL_SUSPEND_MS - 1)).toBe(true);
  });

  it('is no longer suspended once the threshold has elapsed', () => {
    expect(isScrollSuspended(1000, 1000 + SCROLL_SUSPEND_MS)).toBe(false);
  });
});

describe('tick', () => {
  it('returns the active index on the first call', () => {
    const state = createSyncEngineState();
    expect(tick(state, LINES, 500, 0)).toEqual({ index: 0, autoScroll: true });
  });

  it('returns null when the active index has not changed', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    expect(tick(state, LINES, 900, 100)).toBeNull();
  });

  it('returns a new tick when the active index changes', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    expect(tick(state, LINES, 1200, 700)).toEqual({ index: 1, autoScroll: true });
  });

  it('reports autoScroll false while a manual scroll is still suspending it', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    notifyManualScroll(state, 600);
    expect(tick(state, LINES, 1200, 1000)).toEqual({ index: 1, autoScroll: false });
  });

  it('reports autoScroll true again once the suspension window has passed', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    notifyManualScroll(state, 600);
    expect(tick(state, LINES, 2600, 600 + SCROLL_SUSPEND_MS)).toEqual({ index: 2, autoScroll: true });
  });

  it('still updates the index on a rewind to an earlier time', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 2600, 0);
    expect(tick(state, LINES, 500, 100)).toEqual({ index: 0, autoScroll: true });
  });
});
