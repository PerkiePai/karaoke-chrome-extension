import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from '../../src/core/search-query';

describe('buildSearchQuery', () => {
  it('keeps a Western query unchanged in substance', () => {
    expect(buildSearchQuery('Oasis', 'Wonderwall')).toBe('Oasis Wonderwall');
  });

  // LRCLIB's search cannot tokenize Thai: q=ใจสั่งมา returns 0 results even
  // though the track is in the database. But prepending Thai text to the Latin
  // artist token narrows the 20-result cap to the specific song:
  // q=คืนจันทร์ LOSO returns 19 hits with คืนจันทร์ present, while q=LOSO
  // returns 20 with คืนจันทร์ absent.
  it('prepends Thai track text to the Latin artist token', () => {
    expect(buildSearchQuery('LOSO', 'คืนจันทร์')).toBe('คืนจันทร์ LOSO');
  });

  it('prepends Thai artist text when the track carries the Latin token', () => {
    expect(buildSearchQuery('คืนจันทร์', 'LOSO')).toBe('คืนจันทร์ LOSO');
  });

  it('produces the same query for both orderings of one title', () => {
    expect(buildSearchQuery('LOSO', 'คืนจันทร์')).toBe(buildSearchQuery('คืนจันทร์', 'LOSO'));
  });

  it('falls back to the full text when there is no Latin at all', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ครั้งหนึ่ง')).toBe('บอดี้สแลม ครั้งหนึ่ง');
  });

  it('drops digits and keeps only identifying Latin tokens', () => {
    expect(buildSearchQuery('AC/DC', "Rock 'n' Roll Train 2")).toBe(
      "AC DC Rock 'n' Roll Train",
    );
  });

  it('handles a null artist', () => {
    expect(buildSearchQuery(null, 'Wonderwall')).toBe('Wonderwall');
  });

  it('collapses whitespace in the fallback path', () => {
    expect(buildSearchQuery(null, '  ครั้งหนึ่ง   ไม่ถึงตาย ')).toBe('ครั้งหนึ่ง ไม่ถึงตาย');
  });

  // A channel named "Phumin อัลบั้ม 2" embeds the album number in its name.
  // That "2" must not make it into the query: q=Phumin 2 returns 0 results,
  // while q=สุดทาง Phumin returns 1. The Thai artist text picks up the real
  // song name from whichever of the two orderings holds it.
  it('drops a channel-suffix digit and includes Thai artist text (Phumin อัลบั้ม 2 case)', () => {
    // Primary reading: YouTube title split gives artist=สุดทาง, track=Phumin อัลบั้ม 2
    expect(buildSearchQuery('สุดทาง', 'Phumin อัลบั้ม 2')).toBe('สุดทาง Phumin');
    // Reversed reading: same query thanks to ordering-independence
    expect(buildSearchQuery('Phumin อัลบั้ม 2', 'สุดทาง')).toBe('สุดทาง Phumin');
  });

  it('strips the เพลง noise prefix from a Thai track name', () => {
    // "เพลง นายหญิง" means "Song: นายหญิง" — the real track name is นายหญิง
    expect(buildSearchQuery('เพลง นายหญิง', 'Phumin อัลบั้ม2')).toBe('นายหญิง Phumin');
    expect(buildSearchQuery('Phumin อัลบั้ม2', 'เพลง นายหญิง')).toBe('นายหญิง Phumin');
  });

  // The normalizer keeps variant markers on purpose so the scorer can compare
  // them. When they are the ONLY Latin content, the non-identifying filter now
  // leaves only the Thai text, which is a better retrieval key than the variant
  // word alone (q=Live returns twenty unrelated tracks by a band called Live).
  it('falls back to Thai artist text when only a Live marker is present', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (Live)')).toBe(
      'บอดี้สแลม ความเชื่อ',
    );
  });

  it('falls back to Thai artist text when only an Acoustic marker is present', () => {
    // Track "ยาพิษ (Acoustic)" is <50% Thai by codepoint so only the artist
    // contributes Thai text; the Acoustic marker is filtered as non-identifying.
    expect(buildSearchQuery('บอดี้สแลม', 'ยาพิษ (Acoustic)')).toBe('บอดี้สแลม');
  });

  it('falls back to Thai text when only a Remix marker is present', () => {
    expect(buildSearchQuery('ปาล์มมี่', 'ทิ้งไว้กลางทาง (Remix)')).toBe(
      'ปาล์มมี่ ทิ้งไว้กลางทาง',
    );
  });

  it('falls back to Thai text when only a Session marker is present', () => {
    // "Live Session วสันต์17" — "Live" and "Session" are both non-identifying
    // variant words; "17" is a bare digit. Thai from the track "ก่อนลา" is the
    // only usable retrieval key.
    expect(buildSearchQuery('ก่อนลา', 'Live Session วสันต์17')).toBe('ก่อนลา');
    expect(buildSearchQuery('Live Session วสันต์17', 'ก่อนลา')).toBe('ก่อนลา');
  });

  it('does not search on a lone bare digit', () => {
    // No identifying Latin; Thai from both fields is used instead.
    expect(buildSearchQuery('บอดี้สแลม', 'ครั้งหนึ่ง 2')).toBe('บอดี้สแลม ครั้งหนึ่ง');
  });

  it('ignores the case of the lone variant marker', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (LIVE)')).toBe(
      'บอดี้สแลม ความเชื่อ',
    );
  });

  it('rejects a query made only of variant markers and digits', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ความเชื่อ (Live) 2')).toBe(
      'บอดี้สแลม ความเชื่อ',
    );
  });

  // When identifying Latin tokens exist, non-identifying tokens are filtered
  // rather than included. The local scorer handles disambiguation by
  // trackSimilarity("Song (Live)", "Song (Live)") = 1.0 vs "Song" = lower.
  it('filters a variant marker alongside an identifying token', () => {
    expect(buildSearchQuery('Cocktail', 'เรา (Live)')).toBe('Cocktail');
  });

  it('filters a bare digit alongside an identifying token', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'Yes 2')).toBe('บอดี้สแลม Yes');
  });
});
