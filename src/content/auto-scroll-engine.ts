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

/**
 * Advances `currentTopPx` by however far `deltaMs` of video time should move
 * the list, at `speed`. Relative rather than absolute-from-currentTime by
 * design: a manual scroll changes `currentTopPx` outside this function (the
 * caller reads the list's real scrollTop each frame), and advancing from
 * that value — rather than recomputing a fresh absolute position — is what
 * lets a manual scroll "stick" instead of being fought or snapped away from
 * on the very next frame.
 */
export function advanceAutoScrollTopPx(
  currentTopPx: number,
  deltaMs: number,
  durationMs: number,
  extentPx: number,
  speed: number,
): number {
  if (durationMs <= 0 || extentPx <= 0) return 0;
  const deltaPx = (deltaMs / durationMs) * speed * extentPx;
  return Math.max(0, Math.min(extentPx, currentTopPx + deltaPx));
}
