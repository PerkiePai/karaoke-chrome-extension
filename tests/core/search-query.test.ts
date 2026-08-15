import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from '../../src/core/search-query';

describe('buildSearchQuery', () => {
  it('keeps a Western query unchanged in substance', () => {
    expect(buildSearchQuery('Oasis', 'Wonderwall')).toBe('Oasis Wonderwall');
  });

  // LRCLIB's search cannot tokenize Thai: q=ใจสั่งมา returns 0 results even
  // though the track is in the database. Only the Latin part can retrieve.
  it('drops Thai text when a Latin token is available', () => {
    expect(buildSearchQuery('LOSO', 'คืนจันทร์')).toBe('LOSO');
  });

  it('drops Thai text regardless of which field carries the Latin token', () => {
    expect(buildSearchQuery('คืนจันทร์', 'LOSO')).toBe('LOSO');
  });

  it('produces the same query for both orderings of one title', () => {
    expect(buildSearchQuery('LOSO', 'คืนจันทร์')).toBe(buildSearchQuery('คืนจันทร์', 'LOSO'));
  });

  it('falls back to the full text when there is no Latin at all', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ครั้งหนึ่ง')).toBe('บอดี้สแลม ครั้งหนึ่ง');
  });

  it('keeps digits and intra-word punctuation', () => {
    expect(buildSearchQuery('AC/DC', "Rock 'n' Roll Train 2")).toBe(
      "AC DC Rock 'n' Roll Train 2",
    );
  });

  it('handles a null artist', () => {
    expect(buildSearchQuery(null, 'Wonderwall')).toBe('Wonderwall');
  });

  it('collapses whitespace in the fallback path', () => {
    expect(buildSearchQuery(null, '  ครั้งหนึ่ง   ไม่ถึงตาย ')).toBe('ครั้งหนึ่ง ไม่ถึงตาย');
  });

  // The normalizer keeps variant markers on purpose so the scorer can compare
  // them. When one is the ONLY Latin content, the Latin-only narrowing turned
  // that generic word into the whole query: q=Live returns twenty unrelated
  // tracks by a band called Live. Falling back to the full text is strictly
  // better -- it retrieves nothing rather than retrieving the wrong thing.
  it('does not search on a lone Live marker', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (Live)')).toBe('บอดี้สแลม ความเชื่อ (Live)');
  });

  it('does not search on a lone Acoustic marker', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ยาพิษ (Acoustic)')).toBe('บอดี้สแลม ยาพิษ (Acoustic)');
  });

  it('does not search on a lone Remix marker', () => {
    expect(buildSearchQuery('ปาล์มมี่', 'ทิ้งไว้กลางทาง (Remix)')).toBe(
      'ปาล์มมี่ ทิ้งไว้กลางทาง (Remix)',
    );
  });

  it('does not search on a lone bare digit', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ครั้งหนึ่ง 2')).toBe('บอดี้สแลม ครั้งหนึ่ง 2');
  });

  it('ignores the case of the lone variant marker', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (LIVE)')).toBe('บอดี้สแลม ความเชื่อ (LIVE)');
  });

  it('rejects a query made only of variant markers and digits', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (Live) 2')).toBe(
      'บอดี้สแลม ความเชื่อ (Live) 2',
    );
  });

  // The gate decides whether to narrow at all; it must not prune tokens from a
  // query that already has real ones, or "Train 2" loses its discriminator.
  it('keeps a variant marker that sits alongside an identifying token', () => {
    expect(buildSearchQuery('Cocktail', 'เรา (Live)')).toBe('Cocktail Live');
  });

  it('keeps a bare digit that sits alongside an identifying token', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'Yes 2')).toBe('Yes 2');
  });
});
