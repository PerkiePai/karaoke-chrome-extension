import { describe, it, expect } from 'vitest';
import { computeAutoScrollTopPx, advanceAutoScrollTopPx } from '../../src/content/auto-scroll-engine';

describe('computeAutoScrollTopPx', () => {
  it('is 0 at the start of the video', () => {
    expect(computeAutoScrollTopPx(0, 200_000, 1000, 1)).toBe(0);
  });

  it('is proportional to elapsed time at speed 1', () => {
    expect(computeAutoScrollTopPx(100_000, 200_000, 1000, 1)).toBe(500);
  });

  it('reaches the full extent when currentTime equals duration', () => {
    expect(computeAutoScrollTopPx(200_000, 200_000, 1000, 1)).toBe(1000);
  });

  it('scales with speed: 2x reaches the end at the halfway point', () => {
    expect(computeAutoScrollTopPx(100_000, 200_000, 1000, 2)).toBe(1000);
  });

  it('scales with speed: 0.5x reaches only a quarter by the halfway point', () => {
    expect(computeAutoScrollTopPx(100_000, 200_000, 1000, 0.5)).toBe(250);
  });

  it('clamps to the extent past the end of the video', () => {
    expect(computeAutoScrollTopPx(250_000, 200_000, 1000, 1)).toBe(1000);
  });

  it('clamps to the extent when speed overshoots before the video ends', () => {
    expect(computeAutoScrollTopPx(150_000, 200_000, 1000, 2)).toBe(1000);
  });

  it('never goes negative', () => {
    expect(computeAutoScrollTopPx(-500, 200_000, 1000, 1)).toBe(0);
  });

  it('returns 0 when duration is not known (0 or negative)', () => {
    expect(computeAutoScrollTopPx(50_000, 0, 1000, 1)).toBe(0);
  });

  it('returns 0 when there is nothing to scroll (extent is 0)', () => {
    expect(computeAutoScrollTopPx(50_000, 200_000, 0, 1)).toBe(0);
  });
});

describe('advanceAutoScrollTopPx', () => {
  it('advances proportionally to elapsed time at speed 1', () => {
    // 1s of a 200s video, over a 1000px extent → 5px
    expect(advanceAutoScrollTopPx(0, 1000, 200_000, 1000, 1)).toBe(5);
  });

  it('advances from wherever it currently is, not from 0 — a manual scroll sticks', () => {
    expect(advanceAutoScrollTopPx(700, 1000, 200_000, 1000, 1)).toBe(705);
  });

  it('scales the increment with speed', () => {
    expect(advanceAutoScrollTopPx(0, 1000, 200_000, 1000, 2)).toBe(10);
  });

  it('clamps at the top extent', () => {
    expect(advanceAutoScrollTopPx(998, 1000, 200_000, 1000, 1)).toBe(1000);
  });

  it('never goes negative even if currentTopPx starts below 0', () => {
    expect(advanceAutoScrollTopPx(-10, 1000, 200_000, 1000, 1)).toBe(0);
  });

  it('returns 0 when duration is not known (0 or negative)', () => {
    expect(advanceAutoScrollTopPx(500, 1000, 0, 1000, 1)).toBe(0);
  });

  it('returns 0 when there is nothing to scroll (extent is 0)', () => {
    expect(advanceAutoScrollTopPx(500, 1000, 200_000, 0, 1)).toBe(0);
  });
});
