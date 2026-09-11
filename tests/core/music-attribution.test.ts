import { describe, it, expect } from 'vitest';
import { parseMusicAttribution, parseArtTrackDescription } from '../../src/core/music-attribution';

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

// Helper: embed a description string inside a minimal ytInitialPlayerResponse blob
function pageWithPlayerResponse(description: string): string {
  const json = JSON.stringify({ videoDetails: { shortDescription: description } });
  return `<html><body><script>var ytInitialPlayerResponse = ${json};</script></body></html>`;
}

describe('parseArtTrackDescription', () => {
  it('extracts title and artist from a standard Art Track description', () => {
    const desc = 'Provided to YouTube by DistroKid\n\nSong Title · Artist Name\nAlbum\n℗ 2024 Label\n';
    expect(parseArtTrackDescription(pageWithPlayerResponse(desc))).toEqual({
      title: 'Song Title',
      artist: 'Artist Name',
    });
  });

  it('extracts a Thai title paired with a Latin artist', () => {
    const desc = 'Provided to YouTube by The Orchard\n\nใจสั่งมา · Bodyslam\nรักนะเว้ย\n℗ 2008 GMM Grammy\n';
    expect(parseArtTrackDescription(pageWithPlayerResponse(desc))).toEqual({
      title: 'ใจสั่งมา',
      artist: 'Bodyslam',
    });
  });

  it('trims whitespace from title and artist', () => {
    const desc = 'Provided to YouTube by Distro\n\n  My Song  ·  My Artist  \nAlbum\n';
    expect(parseArtTrackDescription(pageWithPlayerResponse(desc))).toEqual({
      title: 'My Song',
      artist: 'My Artist',
    });
  });

  it('returns null when the description has no Art Track block', () => {
    const html = pageWithPlayerResponse('A normal video description with no special format.');
    expect(parseArtTrackDescription(html)).toBeNull();
  });

  it('returns null when ytInitialPlayerResponse is absent', () => {
    expect(parseArtTrackDescription('<html><body>no json here</body></html>')).toBeNull();
  });

  it('returns null when the JSON is malformed', () => {
    const html = `<html><body><script>var ytInitialPlayerResponse = {bad json</script></body></html>`;
    expect(parseArtTrackDescription(html)).toBeNull();
  });

  it('returns null when videoDetails is missing', () => {
    const json = JSON.stringify({ other: {} });
    const html = `<script>var ytInitialPlayerResponse = ${json};</script>`;
    expect(parseArtTrackDescription(html)).toBeNull();
  });

  it('returns null when shortDescription is missing', () => {
    const json = JSON.stringify({ videoDetails: { title: 'Video Title' } });
    const html = `<script>var ytInitialPlayerResponse = ${json};</script>`;
    expect(parseArtTrackDescription(html)).toBeNull();
  });
});
