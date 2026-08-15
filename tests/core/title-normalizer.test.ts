import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '../../src/core/title-normalizer';

describe('normalizeTitle', () => {
  it('splits artist and track on a hyphen and drops [Official MV]', () => {
    expect(normalizeTitle('BODYSLAM - ครั้งหนึ่งไม่ถึงตาย [Official MV]')).toEqual({
      artist: 'BODYSLAM',
      track: 'ครั้งหนึ่งไม่ถึงตาย',
    });
  });

  it('drops (Official Video)', () => {
    expect(normalizeTitle('Oasis - Wonderwall (Official Video)')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });

  it('handles an en dash separator and a trailing resolution tag', () => {
    expect(normalizeTitle('Taylor Swift – Blank Space (Official Music Video) 4K')).toEqual({
      artist: 'Taylor Swift',
      track: 'Blank Space',
    });
  });

  it('drops a pipe-delimited official suffix', () => {
    expect(normalizeTitle('Three Man Down - คนไม่จำเป็น | Official MV')).toEqual({
      artist: 'Three Man Down',
      track: 'คนไม่จำเป็น',
    });
  });

  it('drops a featured-artist clause', () => {
    expect(normalizeTitle('Scrubb - ทุกอย่าง (feat. Someone)')).toEqual({
      artist: 'Scrubb',
      track: 'ทุกอย่าง',
    });
  });

  it('keeps live markers so the scorer can use them', () => {
    expect(normalizeTitle('Cocktail - เรา (Live From COCKTAIL CLASSICS)')).toEqual({
      artist: 'Cocktail',
      track: 'เรา (Live From COCKTAIL CLASSICS)',
    });
  });

  it('returns a null artist when there is no separator', () => {
    expect(normalizeTitle('เพลงไม่มีศิลปิน')).toEqual({
      artist: null,
      track: 'เพลงไม่มีศิลปิน',
    });
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeTitle('Oasis  -   Wonderwall')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });

  it('does not split on a hyphen at position zero', () => {
    expect(normalizeTitle('- Wonderwall').artist).toBeNull();
  });

  it('returns an empty track for empty input', () => {
    expect(normalizeTitle('')).toEqual({ artist: null, track: '' });
  });

  it('keeps a leading HD that is part of the artist name', () => {
    expect(normalizeTitle('HD Radio - Something')).toEqual({
      artist: 'HD Radio',
      track: 'Something',
    });
  });

  it('strips stacked trailing resolution tags', () => {
    expect(normalizeTitle('Oasis - Wonderwall 1080p HD')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });
});
