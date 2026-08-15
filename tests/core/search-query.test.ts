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
});
