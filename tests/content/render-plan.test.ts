import { describe, it, expect } from 'vitest';
import { planRender } from '../../src/content/render-plan';
import type { LrclibRecord } from '../../src/core/types';

function record(over: Partial<LrclibRecord>): LrclibRecord {
  return {
    id: 1,
    trackName: 'Track',
    artistName: 'Artist',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...over,
  };
}

describe('planRender', () => {
  it('renders synced lyrics with the status hidden and real timestamps', () => {
    const plan = planRender(
      record({ syncedLyrics: '[00:01.00]first\n[00:02.00]second', plainLyrics: 'first\nsecond' }),
    );
    expect(plan.status).toBe('');
    expect(plan.synced).toBe(true);
    expect(plan.lines).toEqual([
      { timeMs: 1000, text: 'first' },
      { timeMs: 2000, text: 'second' },
    ]);
  });

  // A non-empty LRC body that parses to nothing used to render a hidden status
  // over an empty list: no lyrics, no fallback, and no way to tell why.
  it('falls back to plain lyrics when synced lyrics parse to no timed lines', () => {
    const plan = planRender(
      record({
        syncedLyrics: '[ar:Someone]\n[ti:Track]\n[by:uploader]',
        plainLyrics: 'first\nsecond',
      }),
    );
    expect(plan.status).toBe('No timings available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines.map((l) => l.text)).toEqual(['first', 'second']);
  });

  it('reports no lyrics when synced lyrics parse to nothing and there is no plain text', () => {
    const plan = planRender(record({ syncedLyrics: '[ar:Someone]' }));
    expect(plan.status).not.toBe('');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it('renders plain lyrics when there are no synced ones', () => {
    const plan = planRender(record({ plainLyrics: 'one\r\ntwo' }));
    expect(plan.status).toBe('No timings available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines.map((l) => l.text)).toEqual(['one', 'two']);
  });

  it('says instrumental only when the record is marked instrumental', () => {
    const plan = planRender(record({ instrumental: true }));
    expect(plan.status).toBe('This track is marked instrumental.');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it('does not claim a record is instrumental when its lyrics are merely missing', () => {
    const plan = planRender(record({ instrumental: false }));
    expect(plan.status).toBe('No lyrics available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });
});
