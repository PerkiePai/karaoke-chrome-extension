import { describe, it, expect } from 'vitest';
import { parseMusicAttribution } from '../../src/core/music-attribution';

function pageWithAttribution(vm: Record<string, unknown> | null): string {
  const ytInitialData = {
    engagementPanels: vm
      ? [
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
        ]
      : [],
  };
  return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></body></html>`;
}

const rickAstleyVm = {
  title: 'Never Gonna Give You Up (7" Mix)',
  subtitle: 'Rick Astley',
  secondarySubtitle: { content: 'Whenever You Need Somebody' },
};

describe('parseMusicAttribution', () => {
  it('extracts title, artist, and album from a real-shaped attribution panel', () => {
    const html = pageWithAttribution(rickAstleyVm);
    expect(parseMusicAttribution(html)).toEqual({
      title: 'Never Gonna Give You Up (7" Mix)',
      artist: 'Rick Astley',
      album: 'Whenever You Need Somebody',
    });
  });

  it('returns album null when secondarySubtitle is absent', () => {
    const html = pageWithAttribution({ title: 'Song', subtitle: 'Artist' });
    expect(parseMusicAttribution(html)).toEqual({ title: 'Song', artist: 'Artist', album: null });
  });

  it('returns null when the page has no engagement panels at all', () => {
    expect(parseMusicAttribution(pageWithAttribution(null))).toBeNull();
  });

  it('returns null when ytInitialData is missing from the page', () => {
    expect(parseMusicAttribution('<html><body>no data here</body></html>')).toBeNull();
  });

  it('returns null when ytInitialData is present but not valid JSON', () => {
    const html = '<script>var ytInitialData = {not: valid};</script>';
    expect(parseMusicAttribution(html)).toBeNull();
  });

  it('returns null when the structured-description panel is absent among other panels', () => {
    const ytInitialData = {
      engagementPanels: [
        { engagementPanelSectionListRenderer: { panelIdentifier: 'some-other-panel' } },
      ],
    };
    const html = `<script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script>`;
    expect(parseMusicAttribution(html)).toBeNull();
  });

  it('returns null when the card has no title or subtitle', () => {
    const html = pageWithAttribution({ secondarySubtitle: { content: 'Album' } });
    expect(parseMusicAttribution(html)).toBeNull();
  });
});
