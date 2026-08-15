import { describe, it, expect } from 'vitest';
import {
  similarity,
  scoreCandidates,
  pickBestMatch,
  MATCH_THRESHOLD,
} from '../../src/core/match-scorer';
import type { LrclibRecord } from '../../src/core/types';

function record(over: Partial<LrclibRecord>): LrclibRecord {
  return {
    id: 1,
    trackName: 'Track',
    artistName: 'Artist',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: 'words',
    syncedLyrics: '[00:01.00]words',
    ...over,
  };
}

describe('similarity', () => {
  it('scores identical strings as 1', () => {
    expect(similarity('Wonderwall', 'Wonderwall')).toBe(1);
  });

  it('ignores case and punctuation', () => {
    expect(similarity('Wonderwall!', 'wonderwall')).toBe(1);
  });

  it('scores unrelated strings low', () => {
    expect(similarity('Wonderwall', 'Blank Space')).toBeLessThan(0.4);
  });

  it('scores near-identical strings high', () => {
    expect(similarity('Wonderwal', 'Wonderwall')).toBeGreaterThan(0.85);
  });

  it('works on Thai text', () => {
    expect(similarity('คนไม่จำเป็น', 'คนไม่จำเป็น')).toBe(1);
    expect(similarity('คนไม่จำเป็น', 'เปิดตัวเขา')).toBeLessThan(0.5);
  });

  it('scores two empty strings as 1 and one empty string as 0', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', '')).toBe(0);
  });
});

describe('scoreCandidates', () => {
  it('ranks the exact title above a different song by the same artist', () => {
    const wanted = record({ id: 10, trackName: 'Wonderwall', artistName: 'Oasis' });
    const other = record({ id: 11, trackName: 'Champagne Supernova', artistName: 'Oasis' });
    const ranked = scoreCandidates(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [other, wanted],
    );
    expect(ranked[0]?.record.id).toBe(10);
  });

  it('uses duration to break a tie between identical titles', () => {
    const close = record({ id: 20, duration: 200 });
    const far = record({ id: 21, duration: 400 });
    const ranked = scoreCandidates(
      { artist: 'Artist', track: 'Track', durationSec: 202 },
      [far, close],
    );
    expect(ranked[0]?.record.id).toBe(20);
  });

  it('prefers a live candidate when the video title says live', () => {
    const studio = record({ id: 30, trackName: 'เรา', artistName: 'Cocktail' });
    const live = record({ id: 31, trackName: 'เรา (Live From COCKTAIL CLASSICS)', artistName: 'Cocktail' });
    const ranked = scoreCandidates(
      { artist: 'Cocktail', track: 'เรา (Live From COCKTAIL CLASSICS)', durationSec: 292 },
      [studio, live],
    );
    expect(ranked[0]?.record.id).toBe(31);
  });

  it('prefers the studio candidate when the video title has no live marker', () => {
    const studio = record({ id: 40, trackName: 'เรา', artistName: 'Cocktail', duration: 292 });
    const live = record({ id: 41, trackName: 'เรา (Live)', artistName: 'Cocktail', duration: 292 });
    const ranked = scoreCandidates(
      { artist: 'Cocktail', track: 'เรา', durationSec: 292 },
      [live, studio],
    );
    expect(ranked[0]?.record.id).toBe(40);
  });

  it('prefers a candidate that has synced lyrics over one that does not', () => {
    const plainOnly = record({ id: 50, syncedLyrics: null });
    const synced = record({ id: 51 });
    const ranked = scoreCandidates(
      { artist: 'Artist', track: 'Track', durationSec: 200 },
      [plainOnly, synced],
    );
    expect(ranked[0]?.record.id).toBe(51);
  });

  it('does not treat "Deliver" as a live marker, so the studio cut still wins', () => {
    const studio = record({ id: 90, trackName: 'Deliver Me', artistName: 'Artist', duration: 180 });
    const live = record({ id: 91, trackName: 'Deliver Me (Live)', artistName: 'Artist', duration: 300 });
    const ranked = scoreCandidates(
      { artist: 'Artist', track: 'Deliver Me', durationSec: 300 },
      [live, studio],
    );
    expect(ranked[0]?.record.id).toBe(90);
  });
});

describe('pickBestMatch', () => {
  it('returns the top candidate when it clears the threshold', () => {
    const match = pickBestMatch(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [record({ id: 70, trackName: 'Wonderwall', artistName: 'Oasis', duration: 258 })],
    );
    expect(match?.id).toBe(70);
  });

  it('returns null when nothing clears the threshold', () => {
    const match = pickBestMatch(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [record({ id: 71, trackName: 'Completely Different', artistName: 'Someone Else', duration: 90 })],
    );
    expect(match).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(pickBestMatch({ artist: 'a', track: 'b', durationSec: null }, [])).toBeNull();
  });

  // A karaoke cut with a closer duration outscores the vocal record beside it,
  // so scoring alone hands the panel a record with no lyrics in it.
  it('prefers the vocal record over a closer-duration instrumental one', () => {
    const vocal = record({ id: 80, duration: 258 });
    const karaoke = record({
      id: 81,
      duration: 275,
      instrumental: true,
      plainLyrics: null,
      syncedLyrics: null,
    });
    const match = pickBestMatch(
      { artist: 'Artist', track: 'Track', durationSec: 278 },
      [vocal, karaoke],
    );
    expect(match?.id).toBe(80);
  });

  it('skips records whose lyric fields are both empty', () => {
    const empty = record({ id: 82, duration: 258, plainLyrics: '', syncedLyrics: '   ' });
    const match = pickBestMatch(
      { artist: 'Artist', track: 'Track', durationSec: 258 },
      [empty],
    );
    expect(match).toBeNull();
  });

  it('exposes a threshold between 0 and 1', () => {
    expect(MATCH_THRESHOLD).toBeGreaterThan(0);
    expect(MATCH_THRESHOLD).toBeLessThan(1);
  });
});
