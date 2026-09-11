import { describe, it, expect, vi } from 'vitest';
import { fetchVideoPageSignals } from '../../src/content/music-attribution';

function pageWith(vm: Record<string, unknown> | null, category: string | undefined): string {
  const ytInitialData = vm
    ? {
        engagementPanels: [
          {
            engagementPanelSectionListRenderer: {
              panelIdentifier: 'engagement-panel-structured-description',
              content: {
                structuredDescriptionContentRenderer: {
                  items: [
                    { horizontalCardListRenderer: { cards: [{ videoAttributeViewModel: vm }] } },
                  ],
                },
              },
            },
          },
        ],
      }
    : {};
  const ytInitialPlayerResponse = {
    microformat: {
      playerMicroformatRenderer: category === undefined ? {} : { category },
    },
  };
  return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};
    var ytInitialPlayerResponse = ${JSON.stringify(ytInitialPlayerResponse)};</script></body></html>`;
}

const rickAstleyVm = {
  title: 'Never Gonna Give You Up (7" Mix)',
  subtitle: 'Rick Astley',
  secondarySubtitle: { content: 'Whenever You Need Somebody' },
};

describe('fetchVideoPageSignals', () => {
  it('fetches the watch page for the given videoId once and parses both signals from it', async () => {
    const html = pageWith(rickAstleyVm, 'Music');
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => html } as Response;
    });
    const result = await fetchVideoPageSignals('dQw4w9WgXcQ', fakeFetch as unknown as typeof fetch);
    expect(calls).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
    expect(result).toEqual({
      attribution: {
        title: 'Never Gonna Give You Up (7" Mix)',
        artist: 'Rick Astley',
        album: 'Whenever You Need Somebody',
      },
      artTrack: null,
      category: 'Music',
      hasCopyrightNotice: false,
      hasMusicKeyword: false,
    });
  });

  it('returns both signals independently — category present without attribution', async () => {
    const html = pageWith(null, 'Gaming');
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => html }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, artTrack: null, category: 'Gaming', hasCopyrightNotice: false, hasMusicKeyword: false });
  });

  it('returns all null when the fetch response is not ok', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, text: async () => '' }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, artTrack: null, category: null, hasCopyrightNotice: false, hasMusicKeyword: false });
  });

  it('returns all null when the fetch throws (network error, abort, etc.)', async () => {
    const fakeFetch = vi.fn(async () => { throw new Error('offline'); });
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, artTrack: null, category: null, hasCopyrightNotice: false, hasMusicKeyword: false });
  });

  it('sets hasCopyrightNotice when ℗ appears in shortDescription', async () => {
    const playerResponse = { videoDetails: { shortDescription: '℗ 2024 GMM Grammy' } };
    const html =
      `<script>var ytInitialData = {};</script>` +
      `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => html }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result.hasCopyrightNotice).toBe(true);
    expect(result.hasMusicKeyword).toBe(false);
  });

  it('sets hasMusicKeyword when keywords contain a music term', async () => {
    const playerResponse = { videoDetails: { keywords: ['เพลงไทย', 'music', 'pop'] } };
    const html =
      `<script>var ytInitialData = {};</script>` +
      `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => html }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result.hasMusicKeyword).toBe(true);
    expect(result.hasCopyrightNotice).toBe(false);
  });

  it('parses an Art Track description block when present', async () => {
    const artTrackDesc = 'Provided to YouTube by DistroKid\n\nSong Title · Artist Name\nAlbum\n℗ 2024 Label\n';
    const playerResponse = { videoDetails: { shortDescription: artTrackDesc } };
    const html =
      `<script>var ytInitialData = {};</script>` +
      `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => html }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result.artTrack).toEqual({ title: 'Song Title', artist: 'Artist Name' });
  });
});
