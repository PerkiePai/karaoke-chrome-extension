import { describe, it, expect } from 'vitest';
import { buildReadings } from '../../src/core/readings';
import { normalizeTitleCandidates } from '../../src/core/title-normalizer';

describe('buildReadings', () => {
  it('is just the title readings when there is no other signal', () => {
    const title = 'DECO*27 - ヒバナ feat. 初音ミク';
    expect(buildReadings(title, null, null, null)).toEqual(normalizeTitleCandidates(title));
  });

  it('puts the Music attribution reading first', () => {
    const readings = buildReadings('фрози (Frozy) - supїdo', null, { title: 'supїdo (slowed + reverb)', artist: 'фрози' }, null);
    expect(readings[0]).toEqual({ artist: 'фрози', track: 'supїdo (slowed + reverb)' });
  });

  it('appends a channel-name reading when the title has no artist', () => {
    const title = 'pov: you just woke up in an abandoned church';
    const readings = buildReadings(title, 'Some Channel', null, null);
    expect(readings.at(-1)).toEqual({ artist: 'Some Channel', track: normalizeTitleCandidates(title)[0]!.track });
  });
});
