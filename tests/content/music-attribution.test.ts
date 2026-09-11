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
      category: 'Music',
    });
  });

  it('returns both signals independently — category present without attribution', async () => {
    const html = pageWith(null, 'Gaming');
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => html }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, category: 'Gaming' });
  });

  it('returns both null when the fetch response is not ok', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, text: async () => '' }) as Response);
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, category: null });
  });

  it('returns both null when the fetch throws (network error, abort, etc.)', async () => {
    const fakeFetch = vi.fn(async () => { throw new Error('offline'); });
    const result = await fetchVideoPageSignals('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toEqual({ attribution: null, category: null });
  });
});
