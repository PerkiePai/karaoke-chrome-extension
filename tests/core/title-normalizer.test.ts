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

  // A bare (unbracketed) featured credit has no closing bracket to stop it, so a
  // greedy pattern ran to end of string and ate the separator and the track.
  it('keeps the track when a bare ft. credit precedes the separator', () => {
    expect(normalizeTitle('Palmy ft. Boy Peacemaker - เพื่อนสนิท')).toEqual({
      artist: 'Palmy',
      track: 'เพื่อนสนิท',
    });
  });

  it('keeps the track when a bare ft. credit precedes an ASCII separator', () => {
    expect(normalizeTitle('Bruno Mars ft. Cardi B - Finesse')).toEqual({
      artist: 'Bruno Mars',
      track: 'Finesse',
    });
  });

  it('handles a bare feat. credit alongside a bracketed promo tag', () => {
    expect(normalizeTitle('YOUNGOHM feat. Bookoo - Bangkok Legacy [Official MV]')).toEqual({
      artist: 'YOUNGOHM',
      track: 'Bangkok Legacy',
    });
  });

  it('drops a bare featured credit that runs to the end of the title', () => {
    expect(normalizeTitle('Oasis - Wonderwall featuring Someone')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });

  it('drops a pipe-delimited lyrics-video suffix, not just an official one', () => {
    expect(normalizeTitle('THE TOYS - ทุกๆ ครั้ง | Lyrics Video')).toEqual({
      artist: 'THE TOYS',
      track: 'ทุกๆ ครั้ง',
    });
  });

  it('keeps a pipe suffix that is not a promo word', () => {
    expect(normalizeTitle('Artist - Song | Live at Wembley')).toEqual({
      artist: 'Artist',
      track: 'Song | Live at Wembley',
    });
  });

  it('splits on the earliest separator, not the first one in the list', () => {
    expect(normalizeTitle('Cocktail — เรา - Live')).toEqual({
      artist: 'Cocktail',
      track: 'เรา - Live',
    });
  });

  it('collapses a channel name repeated across bracketed noise', () => {
    expect(normalizeTitle('คืนจันทร์ - LOSO 【OFFICIAL MV】LOSO')).toEqual({
      artist: 'คืนจันทร์',
      track: 'LOSO',
    });
  });

  it('collapses a repeated multi-word channel name', () => {
    expect(normalizeTitle('เปิดตัวเขา - Three Man Down [Official MV] Three Man Down')).toEqual({
      artist: 'เปิดตัวเขา',
      track: 'Three Man Down',
    });
  });

  it('keeps a legitimately repeated word when no bracket separates the copies', () => {
    expect(normalizeTitle('NSYNC - Bye Bye Bye')).toEqual({
      artist: 'NSYNC',
      track: 'Bye Bye Bye',
    });
  });

  it('keeps a doubled word that is genuinely part of the track name', () => {
    expect(normalizeTitle('John Lee Hooker - Boom Boom')).toEqual({
      artist: 'John Lee Hooker',
      track: 'Boom Boom',
    });
  });
});
