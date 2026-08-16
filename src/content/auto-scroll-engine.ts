/**
 * Absolute scroll-top (px) for the timestamp-less auto-scroll mode: linear
 * progress through the lyrics block over the video's duration, scaled by
 * `speed`. Clamped to [0, extentPx] since currentTimeMs can exceed
 * durationMs (a trailing outro) and a speed above 1 reaches the end before
 * the video does.
 */
export function computeAutoScrollTopPx(
  currentTimeMs: number,
  durationMs: number,
  extentPx: number,
  speed: number,
): number {
  if (durationMs <= 0 || extentPx <= 0) return 0;
  const progress = (currentTimeMs / durationMs) * speed;
  return Math.max(0, Math.min(1, progress)) * extentPx;
}
