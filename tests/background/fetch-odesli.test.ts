import { describe, it, expect } from 'vitest';
import { fetchOdesli } from '../../src/background/fetch-odesli';

function mockFetch(status: number, body: unknown): typeof fetch {
  return async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
}

const VALID_BODY = {
  entityUniqueId: 'YOUTUBE_VIDEO::abc123',
  entitiesByUniqueId: {
    'YOUTUBE_VIDEO::abc123': {
      title: 'Never Gonna Give You Up',
      artistName: 'Rick Astley',
    },
  },
};

describe('fetchOdesli', () => {
  it('returns title and artistName on a successful response', async () => {
    const result = await fetchOdesli('abc123', mockFetch(200, VALID_BODY));
    expect(result).toEqual({ title: 'Never Gonna Give You Up', artistName: 'Rick Astley' });
  });

  it('trims whitespace from title and artistName', async () => {
    const body = {
      entityUniqueId: 'YOUTUBE_VIDEO::abc',
      entitiesByUniqueId: {
        'YOUTUBE_VIDEO::abc': { title: '  Song  ', artistName: '  Artist  ' },
      },
    };
    const result = await fetchOdesli('abc', mockFetch(200, body));
    expect(result).toEqual({ title: 'Song', artistName: 'Artist' });
  });

  it('returns null on 404', async () => {
    expect(await fetchOdesli('missing', mockFetch(404, {}))).toBeNull();
  });

  it('returns null on 429 without throwing', async () => {
    expect(await fetchOdesli('xyz', mockFetch(429, {}))).toBeNull();
  });

  it('returns null when entity is missing from entitiesByUniqueId', async () => {
    const body = {
      entityUniqueId: 'YOUTUBE_VIDEO::abc123',
      entitiesByUniqueId: {},
    };
    expect(await fetchOdesli('abc123', mockFetch(200, body))).toBeNull();
  });

  it('returns null when entityUniqueId is absent', async () => {
    const body = { entitiesByUniqueId: { 'YOUTUBE_VIDEO::x': { title: 'T', artistName: 'A' } } };
    expect(await fetchOdesli('x', mockFetch(200, body))).toBeNull();
  });

  it('returns null when title is missing from entity', async () => {
    const body = {
      entityUniqueId: 'YOUTUBE_VIDEO::x',
      entitiesByUniqueId: { 'YOUTUBE_VIDEO::x': { artistName: 'Rick Astley' } },
    };
    expect(await fetchOdesli('x', mockFetch(200, body))).toBeNull();
  });

  it('returns null on network error', async () => {
    const throwing: typeof fetch = async () => { throw new Error('network'); };
    expect(await fetchOdesli('abc123', throwing)).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const badJson: typeof fetch = async () =>
      ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) as Response;
    expect(await fetchOdesli('abc', badJson)).toBeNull();
  });
});
