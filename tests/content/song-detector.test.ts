// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectSong } from '../../src/content/song-detector';

function pageWith(html: string): Document {
  document.body.innerHTML = html;
  document.head.innerHTML = '';
  return document;
}

describe('detectSong', () => {
  it('reads the title from the watch metadata heading', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>Oasis - Wonderwall</yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('Oasis - Wonderwall');
  });

  it('falls back to the legacy title heading', () => {
    const doc = pageWith(
      '<h1 class="title"><yt-formatted-string>BODYSLAM - ครั้งหนึ่งไม่ถึงตาย</yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('BODYSLAM - ครั้งหนึ่งไม่ถึงตาย');
  });

  it('falls back to the title meta tag', () => {
    const doc = pageWith('');
    document.head.innerHTML = '<meta name="title" content="Scrubb - ลม">';
    expect(detectSong(doc)?.rawTitle).toBe('Scrubb - ลม');
  });

  it('trims surrounding whitespace', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>  Oasis - Wonderwall \n </yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('Oasis - Wonderwall');
  });

  it('returns null when no title is present', () => {
    expect(detectSong(pageWith('<div></div>'))).toBeNull();
  });

  it('returns a null duration when the video has not loaded metadata', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1><video></video>',
    );
    // jsdom leaves HTMLMediaElement.duration as NaN.
    expect(detectSong(doc)?.durationSec).toBeNull();
  });

  it('reports the duration when the video element exposes one', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1><video></video>',
    );
    const video = doc.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 258, configurable: true });
    expect(detectSong(doc)?.durationSec).toBe(258);
  });
});
