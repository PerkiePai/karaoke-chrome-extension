import { describe, it, expect } from 'vitest';
import { parseVideoCategory, isConfidentlyNonMusic } from '../../src/core/video-category';

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
