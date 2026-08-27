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

  // Track "ยาพิษ (Acoustic)" is <50% Thai by codepoint, but Thai extraction is
  // now unconditional (not gated on that threshold — see buildSearchQuery's
  // docstring), so its real track name "ยาพิษ" still reaches the query even
  // though the field as a whole isn't "predominantly" Thai. Confirmed live:
  // q=บอดี้สแลม alone returns 20 unrelated Bodyslam tracks (not the one
  // wanted); q=บอดี้สแลม ยาพิษ returns exactly the one record.
  it('includes Thai track text even when the field is not predominantly Thai', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'ยาพิษ (Acoustic)')).toBe('บอดี้สแลม ยาพิษ');
  });

  it('falls back to Thai text when only a Remix marker is present', () => {
    expect(buildSearchQuery('ปาล์มมี่', 'ทิ้งไว้กลางทาง (Remix)')).toBe(
      'ปาล์มมี่ ทิ้งไว้กลางทาง',
    );
  });

  it('falls back to Thai text when only a Session marker is present', () => {
    // "Live Session วสันต์17" — "Live" and "Session" are both non-identifying
    // variant words and "17" is a bare digit, so none of those reach the
    // query, but the Thai run "วสันต์" is real (non-stop-word) text and is
    // now included unconditionally, alongside "ก่อนลา" from the other field.
    //
    // NOTE: unlike the single-Thai-field cases elsewhere in this file, this
    // is NOT ordering-independent — when BOTH fields carry their own Thai
    // text, the query's word order follows argument order (artist's text
    // first), so swapping which string is passed as artist vs track changes
    // the output string, even though both strings still carry the same two
    // real Thai words. This gap predates this test: it already existed for
    // any title where BOTH the artist and track readings are themselves
    // fully Thai script (e.g. "บอดี้สแลม" — Thai spelling of "Bodyslam" — is
    // itself 100% Thai), just never exercised under a literal argument swap
    // before. LRCLIB's search is not sensitive to query word order in
    // practice (see this function's docstring), so it doesn't affect
    // recall — only which exact string among equivalent options is sent.
    expect(buildSearchQuery('ก่อนลา', 'Live Session วสันต์17')).toBe('ก่อนลา วสันต์');
    expect(buildSearchQuery('Live Session วสันต์17', 'ก่อนลา')).toBe('วสันต์ ก่อนลา');
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

  // The variant marker "(Live)" is filtered as before, but the real Thai
  // track name "เรา" is now included unconditionally (see buildSearchQuery's
  // docstring) rather than dropped just because the field isn't
  // "predominantly" Thai. Confirmed live: q=Cocktail alone returns 20 mixed
  // Cocktail tracks; q=เรา Cocktail returns only the 5 records actually
  // named เรา (studio + live cuts).
  it('includes the real Thai track name alongside a filtered variant marker', () => {
    expect(buildSearchQuery('Cocktail', 'เรา (Live)')).toBe('เรา Cocktail');
  });

  it('filters a bare digit alongside an identifying token', () => {
    expect(buildSearchQuery('บอดี้สแลม', 'Yes 2')).toBe('บอดี้สแลม Yes');
  });

  // "Atom ชนกันต์" is a mixed field: a romanized nickname glued to a Thai
  // surname. LRCLIB stores only the all-Thai form ("อะตอม ชนกันต์"), so
  // carrying "Atom" into the query zeroes the result set even though the Thai
  // text alone finds it: q=ชนกันต์ PLEASE Atom -> 0 results, q=ชนกันต์ PLEASE
  // -> the exact match. The field is >50% Thai, so its Latin fragment is
  // dropped in favor of the Thai text.
  it('drops a Latin nickname embedded in a predominantly-Thai artist field', () => {
    expect(buildSearchQuery('Atom ชนกันต์', 'PLEASE')).toBe('ชนกันต์ PLEASE');
    expect(buildSearchQuery('PLEASE', 'Atom ชนกันต์')).toBe('ชนกันต์ PLEASE');
  });

  // A field that is neither Thai nor Latin (Japanese, here) used to
  // contribute NOTHING once the other field had a Latin token: q=9Lana
  // instead of q=9Lana 右ポケット, which returns 20 unrelated tracks by the
  // same artist on lrclib instead of the one requested.
  it('includes Japanese text from a field with no Latin and no Thai content', () => {
    expect(buildSearchQuery('9Lana', '右ポケット')).toBe('右ポケット 9Lana');
    expect(buildSearchQuery('右ポケット', '9Lana')).toBe('右ポケット 9Lana');
  });

  it('falls back to Japanese text alone when neither field has Latin content', () => {
    expect(buildSearchQuery('ユイカ', '好きだから')).toBe('ユイカ 好きだから');
  });

  it('does not double-count Thai text as "other script" text', () => {
    // A predominantly-Thai field is handled entirely by the Thai path; the
    // other-script fallback must never also pick up its Thai runs.
    expect(buildSearchQuery('LOSO', 'คืนจันทร์')).toBe('คืนจันทร์ LOSO');
  });
});
