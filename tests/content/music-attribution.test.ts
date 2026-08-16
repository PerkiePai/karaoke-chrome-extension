import { describe, it, expect, vi } from 'vitest';
import { fetchMusicAttribution } from '../../src/content/music-attribution';

function pageWithAttribution(vm: Record<string, unknown>): string {
  const ytInitialData = {
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
  };
  return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></body></html>`;
}

const rickAstleyVm = {
  title: 'Never Gonna Give You Up (7" Mix)',
  subtitle: 'Rick Astley',
  secondarySubtitle: { content: 'Whenever You Need Somebody' },
};

describe('fetchMusicAttribution', () => {
  it('fetches the watch page for the given videoId and parses the response', async () => {
    const html = pageWithAttribution(rickAstleyVm);
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => html } as Response;
    });
    const result = await fetchMusicAttribution('dQw4w9WgXcQ', fakeFetch as unknown as typeof fetch);
    expect(calls[0]).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toEqual({
      title: 'Never Gonna Give You Up (7" Mix)',
      artist: 'Rick Astley',
      album: 'Whenever You Need Somebody',
    });
  });

  it('returns null when the fetch response is not ok', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, text: async () => '' }) as Response);
    const result = await fetchMusicAttribution('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the fetch throws (network error, abort, etc.)', async () => {
    const fakeFetch = vi.fn(async () => { throw new Error('offline'); });
    const result = await fetchMusicAttribution('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});
