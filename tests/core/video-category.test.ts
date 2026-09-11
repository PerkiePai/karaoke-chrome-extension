import { describe, it, expect } from 'vitest';
import { parseVideoCategory, isConfidentlyNonMusic, parseMusicSignals } from '../../src/core/video-category';

function pageWithCategory(category: string | undefined): string {
  const playerResponse = {
    microformat: {
      playerMicroformatRenderer: category === undefined ? {} : { category },
    },
  };
  return `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`;
}

describe('parseVideoCategory', () => {
  it('extracts the category from a real-shaped ytInitialPlayerResponse blob', () => {
    // Field name and JSON path confirmed against a live watch page
    // (dQw4w9WgXcQ) during implementation — see SESSION.md.
    expect(parseVideoCategory(pageWithCategory('Music'))).toBe('Music');
  });

  it('extracts a non-music category the same way', () => {
    expect(parseVideoCategory(pageWithCategory('Gaming'))).toBe('Gaming');
  });

  it('returns null when the blob is missing entirely', () => {
    expect(parseVideoCategory('<html><body>no script here</body></html>')).toBeNull();
  });

  it('returns null when the blob has no category field', () => {
    expect(parseVideoCategory(pageWithCategory(undefined))).toBeNull();
  });

  it('returns null when the blob is malformed JSON', () => {
    const html = '<html><body><script>var ytInitialPlayerResponse = {broken;</script></body></html>';
    expect(parseVideoCategory(html)).toBeNull();
  });
});

function pageWithVideoDetails(opts: { keywords?: string[]; shortDescription?: string }): string {
  const playerResponse = { videoDetails: opts };
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
}

describe('parseMusicSignals', () => {
  it('detects ℗ in shortDescription', () => {
    const html = pageWithVideoDetails({ shortDescription: 'Provided to YouTube by Distro\n\n℗ 2024 Label' });
    expect(parseMusicSignals(html).hasCopyrightNotice).toBe(true);
  });

  it('hasCopyrightNotice is false when description has no ℗', () => {
    const html = pageWithVideoDetails({ shortDescription: 'Just a gaming video' });
    expect(parseMusicSignals(html).hasCopyrightNotice).toBe(false);
  });

  it('detects a music keyword in the keywords array', () => {
    const html = pageWithVideoDetails({ keywords: ['Thai music', 'Music', 'เพลงไทย'] });
    expect(parseMusicSignals(html).hasMusicKeyword).toBe(true);
  });

  it('keyword match is case-insensitive', () => {
    const html = pageWithVideoDetails({ keywords: ['LYRICS', 'pop'] });
    expect(parseMusicSignals(html).hasMusicKeyword).toBe(true);
  });

  it('hasMusicKeyword is false when no keyword matches', () => {
    const html = pageWithVideoDetails({ keywords: ['gaming', 'fps', 'reaction'] });
    expect(parseMusicSignals(html).hasMusicKeyword).toBe(false);
  });

  it('returns both false when ytInitialPlayerResponse is absent', () => {
    expect(parseMusicSignals('<html>no script</html>')).toEqual({ hasCopyrightNotice: false, hasMusicKeyword: false });
  });

  it('returns both false when videoDetails is missing', () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({ microformat: {} })};</script>`;
    expect(parseMusicSignals(html)).toEqual({ hasCopyrightNotice: false, hasMusicKeyword: false });
  });

  it('can detect both signals at once', () => {
    const html = pageWithVideoDetails({
      shortDescription: '℗ 2024 GMM Grammy',
      keywords: ['music', 'lyrics'],
    });
    expect(parseMusicSignals(html)).toEqual({ hasCopyrightNotice: true, hasMusicKeyword: true });
  });
});

describe('isConfidentlyNonMusic', () => {
  it('is false for Music', () => {
    expect(isConfidentlyNonMusic('Music')).toBe(false);
  });

  it('is false for null (unknown category)', () => {
    expect(isConfidentlyNonMusic(null)).toBe(false);
  });

  it('is false for categories that commonly carry real music covers', () => {
    expect(isConfidentlyNonMusic('Entertainment')).toBe(false);
    expect(isConfidentlyNonMusic('People & Blogs')).toBe(false);
    expect(isConfidentlyNonMusic('Comedy')).toBe(false);
    expect(isConfidentlyNonMusic('Film & Animation')).toBe(false);
  });

  it('is true for confidently non-music categories', () => {
    expect(isConfidentlyNonMusic('Gaming')).toBe(true);
    expect(isConfidentlyNonMusic('Sports')).toBe(true);
    expect(isConfidentlyNonMusic('News & Politics')).toBe(true);
  });
});
