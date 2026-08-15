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

// YouTube pushes the new URL before it swaps the DOM, so a poll can read the
// PREVIOUS video's title under the new id. Detection has to check the page's
// own id to tell the two apart.
describe('detectSong video id check', () => {
  const heading = (title: string) =>
    `<h1 class="ytd-watch-metadata"><yt-formatted-string>${title}</yt-formatted-string></h1>`;

  it('accepts the title when ytd-watch-flexy reports the expected id', () => {
    const doc = pageWith(`<ytd-watch-flexy video-id="bbb">${heading('New - Song')}</ytd-watch-flexy>`);
    expect(detectSong(doc, 'bbb')?.rawTitle).toBe('New - Song');
  });

  it('accepts the title when the canonical link reports the expected id', () => {
    const doc = pageWith(heading('New - Song'));
    document.head.innerHTML =
      '<link rel="canonical" href="https://www.youtube.com/watch?v=bbb">';
    expect(detectSong(doc, 'bbb')?.rawTitle).toBe('New - Song');
  });

  it('rejects a stale title while the page still reports the previous id', () => {
    const doc = pageWith(`<ytd-watch-flexy video-id="aaa">${heading('Old - Song')}</ytd-watch-flexy>`);
    document.head.innerHTML =
      '<link rel="canonical" href="https://www.youtube.com/watch?v=aaa">';
    expect(detectSong(doc, 'bbb')).toBeNull();
  });

  it('accepts when either source matches, since the markup shifts', () => {
    const doc = pageWith(`<ytd-watch-flexy video-id="aaa">${heading('New - Song')}</ytd-watch-flexy>`);
    document.head.innerHTML =
      '<link rel="canonical" href="https://www.youtube.com/watch?v=bbb">';
    expect(detectSong(doc, 'bbb')?.rawTitle).toBe('New - Song');
  });

  it('accepts when the page publishes no id at all, leaving the caller timeout as the guard', () => {
    const doc = pageWith(heading('New - Song'));
    expect(detectSong(doc, 'bbb')?.rawTitle).toBe('New - Song');
  });

  it('ignores a canonical link that is not a watch URL', () => {
    const doc = pageWith(heading('New - Song'));
    document.head.innerHTML = '<link rel="canonical" href="https://example.com/watch?v=bbb">';
    expect(detectSong(doc, 'bbb')?.rawTitle).toBe('New - Song');
  });

  it('does not check identity when no expected id is given', () => {
    const doc = pageWith(`<ytd-watch-flexy video-id="aaa">${heading('Old - Song')}</ytd-watch-flexy>`);
    expect(detectSong(doc)?.rawTitle).toBe('Old - Song');
  });
});
