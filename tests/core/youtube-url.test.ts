import { describe, it, expect } from 'vitest';
import { parseVideoId } from '../../src/core/youtube-url';

describe('parseVideoId', () => {
  it('extracts the id from a watch URL', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('ignores extra query parameters', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=abc123&t=42s&list=PL1')).toBe('abc123');
  });

  it('accepts the apex domain', () => {
    expect(parseVideoId('https://youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('returns null on the homepage', () => {
    expect(parseVideoId('https://www.youtube.com/')).toBeNull();
  });

  it('returns null for shorts', () => {
    expect(parseVideoId('https://www.youtube.com/shorts/abc123')).toBeNull();
  });

  it('returns null for a watch URL with no v parameter', () => {
    expect(parseVideoId('https://www.youtube.com/watch?list=PL1')).toBeNull();
  });

  it('returns null for a non-YouTube host', () => {
    expect(parseVideoId('https://evil.example.com/watch?v=abc123')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseVideoId('not a url')).toBeNull();
  });
});
