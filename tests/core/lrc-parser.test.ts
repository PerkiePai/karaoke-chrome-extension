import { describe, it, expect } from 'vitest';
import { parseLrc } from '../../src/core/lrc-parser';

describe('parseLrc', () => {
  it('parses a two-digit fraction timestamp', () => {
    expect(parseLrc('[00:12.34]Today is gonna be the day')).toEqual([
      { timeMs: 12340, text: 'Today is gonna be the day' },
    ]);
  });

  it('treats .5, .50 and .500 as the same half second', () => {
    expect(parseLrc('[00:01.5]a')[0]?.timeMs).toBe(1500);
    expect(parseLrc('[00:01.50]a')[0]?.timeMs).toBe(1500);
    expect(parseLrc('[00:01.500]a')[0]?.timeMs).toBe(1500);
  });

  it('accepts a colon before the fraction', () => {
    expect(parseLrc('[00:12:34]x')[0]?.timeMs).toBe(12340);
  });

  it('handles minutes past 60', () => {
    expect(parseLrc('[75:30.00]x')[0]?.timeMs).toBe(75 * 60_000 + 30_000);
  });

  it('emits one line per timestamp when a line has several', () => {
    expect(parseLrc('[00:10.00][01:20.00]chorus')).toEqual([
      { timeMs: 10_000, text: 'chorus' },
      { timeMs: 80_000, text: 'chorus' },
    ]);
  });

  it('skips metadata tags', () => {
    const lrc = ['[ar:Bodyslam]', '[ti:ครั้งหนึ่ง]', '[offset:+500]', '[00:05.00]ถามใคร'].join('\n');
    expect(parseLrc(lrc)).toEqual([{ timeMs: 5000, text: 'ถามใคร' }]);
  });

  it('sorts out-of-order timestamps', () => {
    const lrc = '[00:30.00]second\n[00:10.00]first';
    expect(parseLrc(lrc).map((l) => l.text)).toEqual(['first', 'second']);
  });

  it('handles CRLF line endings', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]b')).toHaveLength(2);
  });

  it('keeps empty lines as timed gaps', () => {
    expect(parseLrc('[00:20.00]')).toEqual([{ timeMs: 20_000, text: '' }]);
  });

  it('skips lines with no leading timestamp', () => {
    expect(parseLrc('just some text\n[00:01.00]real')).toEqual([
      { timeMs: 1000, text: 'real' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });

  it('preserves Thai text exactly', () => {
    expect(parseLrc('[00:03.00]ฉันคนไม่จำเป็น')[0]?.text).toBe('ฉันคนไม่จำเป็น');
  });
});
