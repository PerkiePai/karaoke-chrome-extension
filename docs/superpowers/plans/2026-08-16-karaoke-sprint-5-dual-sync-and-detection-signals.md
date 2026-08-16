# Sprint 5 — Dual Sync Mode & Detection Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two feature clusters SESSION.md parked for "Sprint 5 planning" during Sessions 7–8: (1) a timestamp-less auto-scroll mode for plain-text lyrics plus a tap-to-sync control for synced lyrics, and (2) two additional song-identification signals — channel name as an artist fallback, and YouTube's structured "Music in this video" attribution data.

**Architecture:**
- Tasks 1–5 build the dual-sync-mode feature bottom-up: storage/messaging gain a persisted `scrollSpeed` field (Task 1); a pure `computeAutoScrollTopPx` engine (Task 2, mirrors `sync-engine.ts`); `PanelHandle` gains scroll-position, speed-control, and tap-to-sync methods (Task 3); a `startAutoScrollLoop` DOM loop mirrors `sync-loop.ts`'s play/pause/rAF lifecycle but drives continuous scroll instead of discrete line highlighting (Task 4); Task 5 wires all of it into `content/index.ts`, replacing the whole file since the change touches nearly every function in it.
- Tasks 6–7 build the two detection signals independently on top of Task 5's file: channel-name fallback extends `song-detector.ts` and adds three lines to `load()` (Task 6); the Music attribution signal is a new pure parser in `src/core/` plus a content-script fetch wrapper, wired in as the lead reading in `load()` (Task 7).
- Every reading — whether from title parsing, the channel-name fallback, or the Music attribution panel — still goes through the existing `buildSearchQuery` → LRCLIB search → `scoreCandidates`/`MATCH_THRESHOLD` gate. This is a deliberate departure from the "skip scoring entirely" phrasing in SESSION.md's Session 8 notes: this codebase's own hard-won lesson (SESSION.md, "Hard-won lessons") is that no single heuristic, however confident, gets to bypass verification against the real LRCLIB record. The Music attribution reading gets priority *placement* (tried first, and demotes the title-based readings to alternates) but not an exemption from the gate.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom. No new npm dependencies.

**Spec:** `SESSION.md` — Session 7's "Feature ideas discussed, deliberately NOT implemented — plan for Sprint 5" section (dual sync modes, tap-to-sync; rate adjustment is explicitly out of scope for this sprint) and Session 8's "feature idea discussed: channel name + YouTube 'Music' attribution box" section (including the confirmed `ytInitialData` JSON path). There is no separate design doc for this sprint; SESSION.md is the source of truth the tasks below argue from.

---

## Global Constraints

These apply to every task in this sprint — not repeated per-task, but always in force.

- **`src/core/` is pure.** Files there never import `chrome.*` and never reference `document`, `window`, `location`, or `fetch`. Browser-facing wiring (fetch calls, DOM reads) lives in `src/content/` or `src/background/`.
- **Content script bundle must not contain ES module syntax.** `tests/build.test.ts` enforces this. `npm run build` must stay clean. New files under `src/content/` and `src/core/` are picked up automatically by Vite's existing bundling — no manifest or build-config changes needed.
- **TypeScript `strict: true` with `noUncheckedIndexedAccess: true`.** Every compile must pass `npm run typecheck` without error.
- **Run `npm test` (not `npx vitest`) for all test runs** — the `NODE_OPTIONS=--experimental-require-module` flag in the script is required for jsdom tests on Node 22.11.0.
- **Commit after every task.**
- **Lyrics and third-party metadata (Music attribution title/artist, channel names) are untrusted content.** Render with `textContent` only, never `innerHTML`. `panel.setHeader()` already does this — no new escaping code is needed at call sites that go through it.
- **`PanelHandle` mock objects in test files must implement every method.** Every task below that adds a `PanelHandle` method also updates every `mockPanel()`-style helper in `tests/content/*.test.ts` that constructs a full mock — TypeScript will fail to compile the mock literal otherwise.
- **`chrome.storage.local` is written directly from `src/content/index.ts`** for per-video meta (offset, scroll speed) — this is the Sprint 4/5 design (see SESSION.md Session 5, "`writeVideoMeta` moved to content script") to avoid a race between the background's write and the content script's own nudge writes. Do not add a background write path for these fields.
- **Content-script `fetch()` calls to `https://www.youtube.com/*` are same-origin** (the content script runs on a `youtube.com` page) and need no `host_permissions` entry — that permission is only for cross-origin extension-privileged requests. Verify this holds in the browser acceptance check for Task 7; if it doesn't, the fix is adding `"https://www.youtube.com/*"` to `host_permissions` in `public/manifest.json`.

---

## Task 1: `scrollSpeed` in storage and messaging

**Files:**
- Modify: `src/background/storage.ts`
- Modify: `src/messaging/types.ts`
- Modify: `src/background/handle-fetch-lyrics.ts`
- Modify: `tests/background/storage.test.ts`
- Modify: `tests/background/handle-fetch-lyrics.test.ts`

**Goal:** Extend the per-video persisted state with an optional `scrollSpeed` multiplier, following exactly the same "preserve on same-record cache hit/re-search, reset to default on a different record" rule Sprint 4 established for `offsetSec`. `FetchLyricsResponse`'s ok case always returns a concrete `scrollSpeed` (default `1`), just as it already does for `offsetSec`.

**Interfaces:**
- Produces: `VideoMeta.scrollSpeed?: number` (storage.ts); `FetchLyricsResponse`'s `ok: true` case gains `scrollSpeed: number` (messaging/types.ts). Task 5 consumes both.

---

- [ ] **Step 1: Write the failing storage tests**

Add to `tests/background/storage.test.ts`, inside the `describe('readVideoMeta / writeVideoMeta', ...)` block:

```typescript
  it('round-trips a VideoMeta that includes scrollSpeed', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0, scrollSpeed: 1.4 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0, scrollSpeed: 1.4 });
  });

  it('round-trips a VideoMeta without scrollSpeed (pre-Sprint-5 shape)', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0 });
  });
```

- [ ] **Step 2: Run tests — confirm they fail on the type, not the assertion**

```
npm test
```

Expected: a TypeScript error — `VideoMeta` has no `scrollSpeed` property yet, so the object literal `{ lrclibId: 42, offsetSec: 0, scrollSpeed: 1.4 }` doesn't satisfy it.

- [ ] **Step 3: Add `scrollSpeed` to `VideoMeta` in `src/background/storage.ts`**

Change:

```typescript
export interface VideoMeta {
  lrclibId: number;
  offsetSec: number;
}
```

To:

```typescript
export interface VideoMeta {
  lrclibId: number;
  offsetSec: number;
  /** Auto-scroll speed multiplier for unsynced (plain-text) lyrics, e.g.
   *  1.0 = default pace. Absent on VideoMeta written before Sprint 5 or for
   *  a video that has never shown unsynced lyrics. */
  scrollSpeed?: number;
}
```

No other changes to `storage.ts` are needed — `readVideoMeta`/`writeVideoMeta` pass the object through unchanged.

- [ ] **Step 4: Run tests — storage tests pass**

```
npm test
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Update `src/messaging/types.ts`**

Change:

```typescript
export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord; lrclibId: number; offsetSec: number }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
```

To:

```typescript
export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord; lrclibId: number; offsetSec: number; scrollSpeed: number }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
```

- [ ] **Step 6: Write the failing `handleFetchLyrics` tests**

Add to `tests/background/handle-fetch-lyrics.test.ts`, inside the `describe('handleFetchLyrics — cache behavior', ...)` block (after the existing `'preserves a previously stored offsetSec on a cache miss (re-search)'` test):

```typescript
  it('returns scrollSpeed=1 by default when no VideoMeta exists', async () => {
    const s = storage();
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1 });
  });

  it('preserves a previously stored scrollSpeed on a cache hit', async () => {
    const s = storage();
    await handleFetchLyrics(request, async () => [wonderwall], s);
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 0, scrollSpeed: 1.6 });
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1.6 });
  });

  it('preserves a previously stored scrollSpeed on a cache miss (re-search)', async () => {
    const s = storage();
    await handleFetchLyrics(request, async () => [wonderwall], s);
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 0, scrollSpeed: 1.6 });
    await s.remove(['lc:99']);
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, scrollSpeed: 1.6 });
  });

  it('resets scrollSpeed to 1 when a fresh search finds a different lrclibId', async () => {
    const s = storage();
    await s.set({ 'vm:abc123': { lrclibId: 200, offsetSec: 0, scrollSpeed: 2.0 } });
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, scrollSpeed: 1 });
  });
```

- [ ] **Step 7: Run tests — confirm the four new tests fail**

```
npm test
```

Expected: failures — `handleFetchLyrics`'s ok responses don't yet carry `scrollSpeed`, so `toMatchObject({ ..., scrollSpeed: ... })` fails.

- [ ] **Step 8: Update `src/background/handle-fetch-lyrics.ts`**

Replace the entire file:

```typescript
import { LrclibRateLimitError } from '../lrclib/client';
import {
  hasUsableLyrics,
  pickBestScored,
  scoreCandidates,
  MATCH_THRESHOLD,
  MIN_TRACK_SIMILARITY,
  MIN_ARTIST_SIMILARITY,
  type ScoredCandidate,
} from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import {
  readVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  type StorageLike,
} from './storage';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function and an optional storage injection so it can be
 * tested without a network, a browser, or any chrome.* global.
 *
 * With storage: checks the cache before searching and writes back on success.
 * Without storage: behaves identically to the pre-Sprint-4 version.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
  storage?: StorageLike,
): Promise<FetchLyricsResponse> {
  const existingMeta = storage ? await readVideoMeta(storage, request.videoId) : null;

  if (existingMeta) {
    const cached = await readLyricsCache(storage!, existingMeta.lrclibId);
    if (cached) {
      // Re-score the cached record against the current song readings before
      // serving it. A record stored under a previous wrong match (or an old
      // scorer run) would otherwise be returned forever — the root cause of
      // "change video but lyrics don't change".
      const allReadings = [
        { artist: request.artist, track: request.track },
        ...(request.alternates ?? []),
      ];
      let bestHitScore = 0;
      const cacheValid = allReadings.some(({ artist, track }) => {
        const hit = scoreCandidates(
          { artist, track, durationSec: request.durationSec },
          [cached],
        )[0];
        if (hit !== undefined && hit.score > bestHitScore) bestHitScore = hit.score;
        return (
          hit !== undefined &&
          hit.score >= MATCH_THRESHOLD &&
          hit.trackSimilarity >= MIN_TRACK_SIMILARITY &&
          (hit.artistSimilarity === null || hit.artistSimilarity >= MIN_ARTIST_SIMILARITY)
        );
      });
      if (cacheValid) {
        console.log(
          `[karaoke] cache HIT videoId=${request.videoId} "${request.track}"`,
          `lrclibId=${existingMeta.lrclibId} score=${bestHitScore.toFixed(3)} offsetSec=${existingMeta.offsetSec}`,
        );
        return {
          ok: true,
          record: cached,
          lrclibId: existingMeta.lrclibId,
          offsetSec: existingMeta.offsetSec,
          scrollSpeed: existingMeta.scrollSpeed ?? 1,
        };
      }
      console.warn(
        `[karaoke] cache REJECTED videoId=${request.videoId} "${request.track}"`,
        `— cached="${cached.trackName} / ${cached.artistName}" lrclibId=${existingMeta.lrclibId}`,
        `score=${bestHitScore.toFixed(3)} < threshold=${MATCH_THRESHOLD} → re-searching`,
      );
      // Validation failed — fall through to a fresh search rather than
      // serving stale or mismatched lyrics.
    } else {
      console.log(`[karaoke] cache MISS "${request.track}" (lrclibId=${existingMeta.lrclibId} not in lc: store) → searching`);
    }
  } else {
    console.log(`[karaoke] no VideoMeta for videoId=${request.videoId} → first visit, searching`);
  }

  const readings = [
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  const query = buildSearchQuery(request.artist, request.track);

  let candidates: LrclibRecord[];
  try {
    candidates = await search(query);
  } catch (error) {
    if (error instanceof LrclibRateLimitError) {
      return {
        ok: false,
        reason: 'rate-limited',
        message: `Rate limited by lrclib. Try again in ${error.retryAfterSec}s.`,
      };
    }
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : 'Network request failed.',
    };
  }

  const usable = candidates.filter(hasUsableLyrics);

  let best: ScoredCandidate | null = null;
  for (const reading of readings) {
    const scored = pickBestScored(
      { artist: reading.artist, track: reading.track, durationSec: request.durationSec },
      usable,
    );
    if (scored && (best === null || scored.score > best.score)) best = scored;
  }

  if (!best) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  // Preserve any offset/scroll-speed the user previously set for this video,
  // but only when the fresh search found the SAME lrclibId — if a different
  // record was matched, those values were calibrated for the wrong song and
  // must not carry over.
  const sameRecordAsBefore = existingMeta !== null && existingMeta.lrclibId === best.record.id;
  const offsetSec = sameRecordAsBefore ? existingMeta!.offsetSec : 0;
  const scrollSpeed = sameRecordAsBefore ? (existingMeta!.scrollSpeed ?? 1) : 1;

  if (storage) {
    await writeLyricsCache(storage, best.record.id, best.record);
    // VideoMeta (vm:videoId) is written by the content script after its
    // generation check passes — doing it here would race with concurrent
    // in-flight requests and corrupt the stored lrclibId.
  }

  console.log(
    `[karaoke] search OK "${best.record.trackName} / ${best.record.artistName}"`,
    `lrclibId=${best.record.id} score=${best.score.toFixed(3)} offsetSec=${offsetSec} scrollSpeed=${scrollSpeed}`,
  );

  return { ok: true, record: best.record, lrclibId: best.record.id, offsetSec, scrollSpeed };
}
```

- [ ] **Step 9: Run the full test suite, typecheck, and build**

```
npm test
npm run typecheck
npm run build
```

Expected: all pass. `content/index.ts` still compiles because nothing in it reads `.scrollSpeed` yet (Task 5 adds that) — TypeScript doesn't require every field to be consumed.

- [ ] **Step 10: Commit**

```
git add src/background/storage.ts src/messaging/types.ts src/background/handle-fetch-lyrics.ts tests/background/storage.test.ts tests/background/handle-fetch-lyrics.test.ts
git commit -m "feat: persist scrollSpeed alongside offsetSec in VideoMeta and FetchLyricsResponse"
```

---

## Task 2: Auto-scroll pure engine

**Files:**
- Create: `src/content/auto-scroll-engine.ts`
- Create: `tests/content/auto-scroll-engine.test.ts`

**Goal:** A pure function that maps `(currentTimeMs, durationMs, extentPx, speed)` to a scroll-top pixel offset — the timestamp-less analogue of `findActiveLineIndex` in `sync-engine.ts`. No DOM, no rAF; fully unit-testable.

**Interfaces:**
- Produces: `computeAutoScrollTopPx(currentTimeMs, durationMs, extentPx, speed): number`. Consumed by Task 4's `startAutoScrollLoop`.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/content/auto-scroll-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeAutoScrollTopPx } from '../../src/content/auto-scroll-engine';

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
```

- [ ] **Step 2: Run tests — confirm they fail on the missing import**

```
npm test
```

Expected: `auto-scroll-engine.ts` does not exist yet — import error.

- [ ] **Step 3: Implement `src/content/auto-scroll-engine.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test
```

Expected: all tests pass, including the ten new ones.

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/content/auto-scroll-engine.ts tests/content/auto-scroll-engine.test.ts
git commit -m "feat: pure auto-scroll engine — linear scroll-top from video time, duration, and speed"
```

---

## Task 3: Panel API — scroll position, speed controls, tap-to-sync button

**Files:**
- Modify: `src/content/panel.ts`
- Modify: `src/content/panel-styles.ts`
- Modify: `tests/content/panel.test.ts`
- Modify: `tests/content/sync-loop.test.ts`

**Goal:** Five new `PanelHandle` methods: `setScrollTop`/`getScrollExtentPx` (used by Task 4's auto-scroll loop), `setSpeedControls`/`onSpeedNudge` (the ▼ ▲ speed UI for unsynced lyrics), and `onTapSync` (the "Sync here" button, added into the existing offset bar). No behavior changes to existing methods.

**Interfaces:**
- Produces: the five `PanelHandle` methods above. Consumed by Task 4 (`setScrollTop`, `getScrollExtentPx`) and Task 5 (`setSpeedControls`, `onSpeedNudge`, `onTapSync`).

---

- [ ] **Step 1: Extend the `PanelHandle` interface in `src/content/panel.ts`**

Add these five members (place after `onOffsetNudge`, before `showCorrectBar`):

```typescript
  /** Scrolls the lyrics list to an absolute pixel offset, bypassing the
   *  active-line highlight logic in setActiveLine. Used by the auto-scroll
   *  loop for unsynced (plain-text) lyrics, which has no line index to
   *  highlight. */
  setScrollTop(px: number): void;
  /** Maximum scrollable distance in the lyrics list right now
   *  (scrollHeight − clientHeight, floored at 0). */
  getScrollExtentPx(): number;
  /** Shows or hides the auto-scroll speed controls (▼ ▲) and updates the
   *  displayed multiplier. Used only while unsynced (plain-text) lyrics are
   *  showing — synced lyrics use setOffsetControls instead. */
  setSpeedControls(visible: boolean, speed?: number): void;
  /** Replaces the callback fired when ▼ (delta = -0.1) or ▲ (delta = +0.1) is clicked. */
  onSpeedNudge(callback: (delta: number) => void): void;
  /** Replaces the callback fired when "Sync here" (tap-to-sync) is clicked. */
  onTapSync(callback: () => void): void;
```

- [ ] **Step 2: Update the panel HTML skeleton in `mountPanel`**

Change the `kx-offset` div and add a new `kx-speed` div right after it:

```typescript
    <div class="kx-offset kx-hidden">
      <button class="kx-offset-back" title="Shift lyrics earlier (−0.25 s)">◀</button>
      <span class="kx-offset-value">+0.00s</span>
      <button class="kx-offset-fwd" title="Shift lyrics later (+0.25 s)">▶</button>
      <button class="kx-sync-here" title="Set the offset from this moment">Sync here</button>
    </div>
    <div class="kx-speed kx-hidden">
      <button class="kx-speed-down" title="Scroll slower">▼</button>
      <span class="kx-speed-value">1.0x</span>
      <button class="kx-speed-up" title="Scroll faster">▲</button>
    </div>
```

(This sits between the existing `kx-header` div and `kx-correct-bar` div — same position the `kx-offset` div already occupies, just with the new `kx-speed` div added immediately after it.)

- [ ] **Step 3: Wire the new buttons**

Add these listener registrations directly after the existing `.kx-offset-fwd` listener:

```typescript
  let tapSyncListener: (() => void) | null = null;
  find<HTMLElement>('.kx-sync-here').addEventListener('click', () => {
    tapSyncListener?.();
  });

  let speedNudgeListener: ((delta: number) => void) | null = null;
  find<HTMLElement>('.kx-speed-down').addEventListener('click', () => {
    speedNudgeListener?.(-0.1);
  });
  find<HTMLElement>('.kx-speed-up').addEventListener('click', () => {
    speedNudgeListener?.(0.1);
  });
```

- [ ] **Step 4: Implement the five new methods**

Add to the returned object, after `onOffsetNudge`:

```typescript
    setScrollTop(px) {
      linesEl.scrollTop = px;
    },
    getScrollExtentPx() {
      return Math.max(0, linesEl.scrollHeight - linesEl.clientHeight);
    },
    setSpeedControls(visible, speed) {
      const el = find<HTMLElement>('.kx-speed');
      el.classList.toggle('kx-hidden', !visible);
      if (visible && speed !== undefined) {
        find('.kx-speed-value').textContent = `${speed.toFixed(1)}x`;
      }
    },
    onSpeedNudge(callback) {
      speedNudgeListener = callback;
    },
    onTapSync(callback) {
      tapSyncListener = callback;
    },
```

- [ ] **Step 5: Add CSS to `src/content/panel-styles.ts`**

Append before the closing backtick:

```css
  .kx-sync-here { margin-left: 4px; }
  .kx-speed {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 2px;
    font-size: 12px;
    color: #aaa;
    border-bottom: 1px solid #303030;
  }
  .kx-speed button {
    background: none;
    border: 1px solid #555;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    padding: 1px 6px;
    font-size: 11px;
    line-height: 1.5;
  }
  .kx-speed button:hover { color: #fff; border-color: #aaa; }
  .kx-speed-value { min-width: 32px; text-align: center; font-variant-numeric: tabular-nums; }
```

(`.kx-sync-here` inherits `.kx-offset button`'s existing border/color/cursor styling for free, since it's a `<button>` inside `.kx-offset`.)

- [ ] **Step 6: Write the failing panel tests**

Add to `tests/content/panel.test.ts`, inside the outer `describe('mountPanel', ...)` (after the `onOffsetNudge` describe block):

```typescript
  describe('setScrollTop / getScrollExtentPx', () => {
    it('sets scrollTop on the lyrics container', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'), false);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      panel.setScrollTop(42);
      expect(linesContainer.scrollTop).toBe(42);
    });

    it('reports scrollHeight minus clientHeight as the scrollable extent', () => {
      const panel = mountPanel(host);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      Object.defineProperty(linesContainer, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(linesContainer, 'clientHeight', { value: 200, configurable: true });
      expect(panel.getScrollExtentPx()).toBe(300);
    });

    it('floors the extent at 0 when content is shorter than the container', () => {
      const panel = mountPanel(host);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      Object.defineProperty(linesContainer, 'scrollHeight', { value: 100, configurable: true });
      Object.defineProperty(linesContainer, 'clientHeight', { value: 200, configurable: true });
      expect(panel.getScrollExtentPx()).toBe(0);
    });
  });

  describe('setSpeedControls', () => {
    it('hides the speed bar by default', () => {
      mountPanel(host);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-speed')!;
      expect(el.classList.contains('kx-hidden')).toBe(true);
    });

    it('shows the speed bar with a formatted multiplier when visible=true', () => {
      const panel = mountPanel(host);
      panel.setSpeedControls(true, 1.4);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-speed')!;
      expect(el.classList.contains('kx-hidden')).toBe(false);
      expect(shadowOf(host).querySelector('.kx-speed-value')!.textContent).toBe('1.4x');
    });

    it('hides the bar again when called with visible=false', () => {
      const panel = mountPanel(host);
      panel.setSpeedControls(true, 1.0);
      panel.setSpeedControls(false);
      expect(shadowOf(host).querySelector<HTMLElement>('.kx-speed')!.classList.contains('kx-hidden')).toBe(true);
    });
  });

  describe('onSpeedNudge', () => {
    it('fires the callback with -0.1 when ▼ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onSpeedNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-speed-down')!.click();
      expect(cb).toHaveBeenCalledWith(-0.1);
    });

    it('fires the callback with +0.1 when ▲ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onSpeedNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-speed-up')!.click();
      expect(cb).toHaveBeenCalledWith(0.1);
    });
  });

  describe('onTapSync', () => {
    it('fires the callback when "Sync here" is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onTapSync(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-sync-here')!.click();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 7: Update `mockPanel()` in `tests/content/sync-loop.test.ts`**

Add the five new methods so the mock still satisfies `PanelHandle`:

```typescript
function mockPanel(): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    setScrollTop: vi.fn(),
    getScrollExtentPx: vi.fn(() => 0),
    setSpeedControls: vi.fn(),
    onSpeedNudge: vi.fn(),
    onTapSync: vi.fn(),
    showCorrectBar: vi.fn(),
    enterSearchMode: vi.fn(),
    showCandidates: vi.fn(),
    exitSearchMode: vi.fn(),
    onCorrectRequest: vi.fn(),
    onSearch: vi.fn(),
    onCandidatePick: vi.fn(),
    destroy: vi.fn(),
  };
}
```

- [ ] **Step 8: Run tests — confirm the new panel tests fail, sync-loop tests still pass**

```
npm test
```

Expected: failures in the new `panel.test.ts` describe blocks (methods don't exist yet on the object returned by `mountPanel`); `sync-loop.test.ts` unaffected since its mock now satisfies the extended interface.

- [ ] **Step 9: Run tests — all pass**

```
npm test
```

Expected: all tests pass, including the new panel tests.

- [ ] **Step 10: Typecheck and build**

```
npm run typecheck
npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 11: Commit**

```
git add src/content/panel.ts src/content/panel-styles.ts tests/content/panel.test.ts tests/content/sync-loop.test.ts
git commit -m "feat: panel API for scroll position, speed controls, and tap-to-sync"
```

---

## Task 4: Auto-scroll DOM loop

**Files:**
- Create: `src/content/auto-scroll-loop.ts`
- Create: `tests/content/auto-scroll-loop.test.ts`
- Modify: `tests/content/auto-scroll-loop.test.ts` mock helper (part of Step 1 below, not a separate step)

**Goal:** `startAutoScrollLoop`, the timestamp-less analogue of `sync-loop.ts`'s `startSyncLoop` — same play/pause/rAF/seeked lifecycle, but drives `panel.setScrollTop()` from `computeAutoScrollTopPx` instead of `panel.setActiveLine()` from `findActiveLineIndex`. Manual-scroll suspension reuses `isScrollSuspended` from `sync-engine.ts` directly (no `SyncEngineState` needed — there's no line index here, just a `lastManualScrollAtMs` timestamp).

**Interfaces:**
- Consumes: `computeAutoScrollTopPx` (Task 2), `PanelHandle.setScrollTop`/`getScrollExtentPx`/`onManualScroll` (Task 3), `isScrollSuspended` (existing, `src/content/sync-engine.ts`).
- Produces: `startAutoScrollLoop(video, panel, durationSec, initialSpeed?): AutoScrollLoopHandle` with `{ stop(): void; setSpeed(speed: number): void }`. Consumed by Task 5.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/content/auto-scroll-loop.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startAutoScrollLoop } from '../../src/content/auto-scroll-loop';
import type { PanelHandle } from '../../src/content/panel';

function mockPanel(extentPx = 1000): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    setScrollTop: vi.fn(),
    getScrollExtentPx: vi.fn(() => extentPx),
    setSpeedControls: vi.fn(),
    onSpeedNudge: vi.fn(),
    onTapSync: vi.fn(),
    showCorrectBar: vi.fn(),
    enterSearchMode: vi.fn(),
    showCandidates: vi.fn(),
    exitSearchMode: vi.fn(),
    onCorrectRequest: vi.fn(),
    onSearch: vi.fn(),
    onCandidatePick: vi.fn(),
    destroy: vi.fn(),
  };
}

function fakeRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      pending.delete(id);
    }),
    runFrame(now = 0) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(now);
    },
    pendingCount() {
      return pending.size;
    },
  };
}

function video(): HTMLVideoElement {
  return document.createElement('video');
}

describe('startAutoScrollLoop', () => {
  let raf: ReturnType<typeof fakeRaf>;

  beforeEach(() => {
    raf = fakeRaf();
    vi.stubGlobal('requestAnimationFrame', raf.requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', raf.cancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the initial scroll position immediately for a paused video', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    expect(panel.setScrollTop).toHaveBeenCalledWith(0);
    expect(raf.pendingCount()).toBe(0);
  });

  it('does not schedule a frame for a paused video until it plays', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel(), 200);
    expect(raf.pendingCount()).toBe(0);
  });

  it('schedules a frame immediately for a video already playing', () => {
    const v = video();
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    startAutoScrollLoop(v, mockPanel(), 200);
    expect(raf.pendingCount()).toBe(1);
  });

  it('advances scrollTop as currentTime advances across frames', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200); // 200s duration, 1000px extent
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true }); // halfway
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(500);
  });

  it('stops scheduling frames on pause and resumes on play', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel(), 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
    v.dispatchEvent(new Event('pause'));
    expect(raf.pendingCount()).toBe(0);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
  });

  it('recomputes on seeked even while paused', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    Object.defineProperty(v, 'currentTime', { value: 50, configurable: true }); // quarter
    v.dispatchEvent(new Event('seeked'));
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(250);
  });

  it('suspends auto-scroll for a window after a manual scroll', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    const manualScrollHandler = (panel.onManualScroll as ReturnType<typeof vi.fn>).mock.calls[0]![0] as () => void;

    manualScrollHandler();
    vi.clearAllMocks();

    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true });
    raf.runFrame();
    expect(panel.setScrollTop).not.toHaveBeenCalled();
  });

  it('setSpeed updates the effective rate and triggers an immediate apply', () => {
    const v = video();
    const panel = mockPanel(1000);
    const handle = startAutoScrollLoop(v, panel, 200, 1);
    Object.defineProperty(v, 'currentTime', { value: 50, configurable: true }); // 1/4 of duration
    vi.clearAllMocks();
    handle.setSpeed(2); // 2x speed → 1/2 progress → 500px
    expect(panel.setScrollTop).toHaveBeenCalledWith(500);
  });

  it('stop() cancels any pending frame and removes listeners', () => {
    const v = video();
    const panel = mockPanel();
    const handle = startAutoScrollLoop(v, panel, 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);

    handle.stop();
    expect(raf.pendingCount()).toBe(0);

    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail on the missing import**

```
npm test
```

Expected: `auto-scroll-loop.ts` does not exist yet — import error.

- [ ] **Step 3: Implement `src/content/auto-scroll-loop.ts`**

```typescript
import type { PanelHandle } from './panel';
import { computeAutoScrollTopPx } from './auto-scroll-engine';
import { isScrollSuspended } from './sync-engine';

export interface AutoScrollLoopHandle {
  stop(): void;
  /** Updates the auto-scroll rate and triggers an immediate recompute so the
   *  panel reflects the change without waiting for the next animation frame. */
  setSpeed(speed: number): void;
}

/**
 * Drives the lyrics list's scrollTop from `video`'s playback for unsynced
 * (plain-text) lyrics, which carry no per-line timestamps to key off. Scroll
 * position is a linear function of `video.currentTime` over `durationSec`,
 * scaled by a user-adjustable `speed` multiplier — the same play/pause/rAF
 * lifecycle as `sync-loop.ts`, but continuous instead of stepped.
 */
export function startAutoScrollLoop(
  video: HTMLVideoElement,
  panel: PanelHandle,
  durationSec: number,
  initialSpeed = 1,
): AutoScrollLoopHandle {
  let speed = initialSpeed;
  let lastManualScrollAtMs: number | null = null;
  let rafId: number | null = null;

  function apply(): void {
    if (isScrollSuspended(lastManualScrollAtMs, Date.now())) return;
    const extentPx = panel.getScrollExtentPx();
    const top = computeAutoScrollTopPx(video.currentTime * 1000, durationSec * 1000, extentPx, speed);
    panel.setScrollTop(top);
  }

  function frame(): void {
    apply();
    rafId = requestAnimationFrame(frame);
  }

  function handlePlay(): void {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function handlePause(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function handleManualScroll(): void {
    lastManualScrollAtMs = Date.now();
  }

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeked', apply);
  panel.onManualScroll(handleManualScroll);

  apply();                          // reflect the current position immediately
  if (!video.paused) handlePlay();

  return {
    stop() {
      handlePause();
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', apply);
      panel.onManualScroll(() => {});
    },
    setSpeed(newSpeed) {
      speed = newSpeed;
      apply();
    },
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test
```

Expected: all tests pass, including the nine new ones.

- [ ] **Step 5: Typecheck and build**

```
npm run typecheck
npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 6: Commit**

```
git add src/content/auto-scroll-loop.ts tests/content/auto-scroll-loop.test.ts
git commit -m "feat: auto-scroll DOM loop for unsynced lyrics — play/pause/seeked lifecycle mirroring sync-loop"
```

---

## Task 5: Wire dual sync mode + tap-to-sync into the content script

**Files:**
- Modify: `src/content/index.ts` (full-file replacement — the change touches nearly every function)

**Goal:** Unsynced (plain-text) lyrics now auto-scroll automatically whenever the video's duration is known; synced lyrics gain a "Sync here" tap-to-sync control alongside the existing ◀▶ nudge; both the offset and the scroll-speed persist per-video through the same `chrome.storage.local` write path, deduplicated into one helper so the two new fields can't be forgotten at any of the four call sites that write `VideoMeta`.

**Interfaces:**
- Consumes: `startAutoScrollLoop` (Task 4), `PanelHandle.setSpeedControls`/`onSpeedNudge`/`onTapSync` (Task 3), `FetchLyricsResponse.scrollSpeed` (Task 1).
- Produces: no new exports — `content/index.ts` is the top-level entry point, not imported elsewhere. Task 6 and Task 7 both patch this file's `load()` function afterward.

There is no dedicated test file for `content/index.ts` (consistent with Sprint 1–4 — it's the DOM-integration entry point, verified via typecheck/build plus the browser acceptance check at the end of this sprint, not unit tests).

---

- [ ] **Step 1: Replace the entire file**

Replace `src/content/index.ts` in full:

```typescript
import { mountPanel, PANEL_HOST_ID, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { decideReconcile } from './reconcile';
import { planRender } from './render-plan';
import { startSyncLoop, type SyncLoopHandle } from './sync-loop';
import { startAutoScrollLoop, type AutoScrollLoopHandle } from './auto-scroll-loop';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitleCandidates } from '../core/title-normalizer';
import type { LyricLine } from '../core/types';
import type {
  FetchLyricsRequest,
  FetchLyricsResponse,
  SearchCandidatesRequest,
  SearchCandidatesResponse,
  PickCandidateRequest,
  PickCandidateResponse,
} from '../messaging/types';

// Scoped to ytd-watch-flexy: YouTube's home/browse page (ytd-browse) also has
// an element with id="secondary", and keeps it cached in the DOM (display:
// none) after navigating away rather than removing it. On the very first
// navigation from youtube.com to a watch page, that stale hidden element can
// sit earlier in the document than the real one, so a bare '#secondary'
// query silently mounts the panel into an invisible, orphaned container.
const SECONDARY_SELECTOR = 'ytd-watch-flexy #secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;
const OFFSET_MIN_SEC = -30;
const OFFSET_MAX_SEC = 30;
const SPEED_MIN = 0.3;
const SPEED_MAX = 3.0;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;
/** Raw title the displayed lyrics were fetched for; null while nothing is shown. */
let renderedTitle: string | null = null;
let isLoading = false;
/**
 * Bumped on every teardown and every load so in-flight async work can tell that
 * it has been superseded. Replaces comparing against currentVideoId, which could
 * not distinguish "same video, but we have started a fresh load".
 */
let generation = 0;

/** lrclibId of the record currently displayed; null while no lyrics are shown. */
let currentLrclibId: number | null = null;
/** The LrclibRecord currently shown; null while no lyrics are loaded. */
let currentRecord: import('../core/types').LrclibRecord | null = null;
/** Offset applied to the sync engine for the current video, in seconds. */
let currentOffsetSec = 0;
/** Lines of the currently displayed SYNCED lyrics (empty when nothing synced
 *  is shown); tap-to-sync reads the first line's timeMs from this. */
let currentSyncedLines: LyricLine[] = [];
/** Auto-scroll speed multiplier for unsynced (plain-text) lyrics, restored per-video. */
let currentScrollSpeed = 1;
/** Duration of the video currently loaded, in seconds; null until known. The
 *  auto-scroll loop needs a total duration to scroll across. */
let currentDurationSec: number | null = null;
/** The running sync loop handle (synced lyrics only), so the nudge/tap-to-sync callbacks can update its offset. */
let currentSyncLoop: SyncLoopHandle | null = null;
/** The running auto-scroll loop handle (unsynced lyrics only), so the speed nudge callback can update its rate. */
let currentAutoScrollLoop: AutoScrollLoopHandle | null = null;

/**
 * Cleanup for resources tied to whatever is currently displayed (today, the
 * sync loop or the auto-scroll loop — never both at once). Registered where
 * the resource is created; run wherever that display is about to be replaced
 * — `teardown` (navigation) and `load` (a same-video reload) both qualify, so
 * this is centralized rather than duplicated as an ad-hoc nullable variable
 * at each call site.
 */
let disposers: Array<() => void> = [];

function addDisposer(dispose: () => void): void {
  disposers.push(dispose);
}

function disposeAll(): void {
  for (const dispose of disposers) dispose();
  disposers = [];
}

/**
 * Writes vm:${videoId} with the CURRENT offset/scroll-speed module state.
 * Centralized so the two Sprint 5 fields can't be forgotten at any one of
 * the four sites that need to persist them (offset nudge, tap-to-sync,
 * speed nudge, and a fresh load) — a plain per-site object literal is how
 * scrollSpeed would silently drop out of one of them.
 */
function persistVideoMeta(videoId: string, lrclibId: number, reason: string): void {
  console.log(
    `[karaoke] vm:write (${reason}) videoId=${videoId} lrclibId=${lrclibId}`,
    `offsetSec=${currentOffsetSec} scrollSpeed=${currentScrollSpeed}`,
  );
  void chrome.storage.local.set({
    [`vm:${videoId}`]: { lrclibId, offsetSec: currentOffsetSec, scrollSpeed: currentScrollSpeed },
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  disposeAll();
  panel?.destroy();
  panel = null;
  renderedTitle = null;
  currentLrclibId = null;
  currentRecord = null;
  currentOffsetSec = 0;
  currentSyncedLines = [];
  currentScrollSpeed = 1;
  currentDurationSec = null;
  currentSyncLoop = null;
  currentAutoScrollLoop = null;
  isLoading = false;
  generation += 1;
}

async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    // Belt-and-braces against the same class of bug recurring: a matched
    // element whose ancestor chain is display:none (e.g. a cached, inactive
    // page component) has no offsetParent even though it's connected to the
    // document, so querySelector alone can't tell it apart from a live one.
    if (el && el.offsetParent !== null) return el;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

/**
 * The heading and the video's duration both appear after navigation settles, so
 * poll rather than reading once and giving up.
 *
 * INVARIANT: the navigation poll may fire before the DOM updates — YouTube
 * pushes the new URL while the heading and the reused <video> element still
 * hold the PREVIOUS video's data. So detection must verify the page's own video
 * id, and a title alone is not enough to stop polling: keep going until the
 * duration is readable too, since a missing duration silently costs the scorer
 * its main disambiguator. The timeout is the guard for both.
 */
async function waitForSong(videoId: string): Promise<DetectedSong | null> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  // YouTube updates the <video> element (duration) before it updates the page
  // heading. A single poll can therefore return the new video's duration paired
  // with the previous video's title. Require two consecutive polls with the
  // same rawTitle before committing — adds one SECONDARY_POLL_MS of latency
  // but prevents writing the wrong lrclibId into storage.
  let candidate: DetectedSong | null = null;
  let withoutDuration: DetectedSong | null = null;

  while (Date.now() < deadline) {
    const song = detectSong(document, videoId);
    if (song) {
      if (song.durationSec !== null) {
        if (candidate !== null && candidate.rawTitle === song.rawTitle) {
          return song;
        }
        candidate = song;
      } else {
        withoutDuration = song;
        candidate = null;
      }
    } else {
      candidate = null;
    }
    await delay(SECONDARY_POLL_MS);
  }

  return withoutDuration;
}

/** Mounts the panel for a newly-opened video, then loads its lyrics. */
async function activate(videoId: string): Promise<void> {
  const gen = generation;
  const container = await waitForSecondary();
  if (!container || gen !== generation) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  panel.onOffsetNudge((delta) => {
    currentOffsetSec += delta;
    currentOffsetSec = Math.max(OFFSET_MIN_SEC, Math.min(OFFSET_MAX_SEC, currentOffsetSec));
    currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
    panel?.setOffsetControls(true, currentOffsetSec);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'nudge');
    }
  });

  panel.onTapSync(() => {
    // "Sync here": read video.currentTime at the click and compute the offset
    // that puts the first synced line exactly there. Motivating case: a
    // cold-open intro longer than the ±30s nudge range can reach in a
    // reasonable number of clicks — see SESSION.md Session 7.
    const video = document.querySelector('video');
    if (!video || currentSyncedLines.length === 0) return;
    const firstLineMs = currentSyncedLines[0]!.timeMs;
    currentOffsetSec = (video.currentTime * 1000 - firstLineMs) / 1000;
    currentOffsetSec = Math.max(OFFSET_MIN_SEC, Math.min(OFFSET_MAX_SEC, currentOffsetSec));
    currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
    panel?.setOffsetControls(true, currentOffsetSec);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'tap-sync');
    }
  });

  panel.onSpeedNudge((delta) => {
    currentScrollSpeed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, currentScrollSpeed + delta));
    currentAutoScrollLoop?.setSpeed(currentScrollSpeed);
    panel?.setSpeedControls(true, currentScrollSpeed);
    if (currentVideoId !== null && currentLrclibId !== null) {
      persistVideoMeta(currentVideoId, currentLrclibId, 'speed-nudge');
    }
  });

  panel.onCorrectRequest(() => {
    // Pre-fill with the currently displayed track + artist, if we have them.
    const prefilledQuery =
      currentRecord !== null
        ? [currentRecord.trackName, currentRecord.artistName].filter(Boolean).join(' ')
        : '';
    panel!.enterSearchMode(prefilledQuery);
  });

  let searchInFlight = false;
  panel.onSearch(async (query) => {
    if (searchInFlight) return;
    searchInFlight = true;
    // Snapshot generation before the await so we can detect navigation that
    // happened while the search was in-flight and avoid writing results onto
    // the new video's panel.
    const searchGen = generation;
    panel!.setStatus('Searching…');
    try {
      let resp: SearchCandidatesResponse;
      try {
        resp = await chrome.runtime.sendMessage<SearchCandidatesRequest, SearchCandidatesResponse>({
          type: 'SEARCH_CANDIDATES',
          query,
        });
      } catch {
        if (searchGen !== generation || !panel) return;
        panel.setStatus('Search failed. Is the extension worker running?');
        panel.exitSearchMode();
        return;
      }
      if (searchGen !== generation || !panel) return;
      if (!resp.ok) {
        panel.setStatus(resp.message);
        panel.exitSearchMode();
        return;
      }
      if (resp.candidates.length === 0) {
        panel.setStatus('No results found. Try different keywords.');
        return;
      }
      panel.setStatus('');
      panel.showCandidates(resp.candidates);
    } finally {
      searchInFlight = false;
    }
  });

  panel.onCandidatePick((record) => {
    panel!.exitSearchMode();
    panel!.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);
    disposeAll();
    panel!.setStatus(plan.status);
    panel!.setLines(plan.lines, plan.synced);

    currentLrclibId = record.id;
    currentRecord = record;
    currentOffsetSec = 0; // reset offset when user manually picks a different song
    currentScrollSpeed = 1; // reset scroll speed too — it belonged to the previous pick

    if (currentVideoId !== null) {
      persistVideoMeta(currentVideoId, record.id, 'pick');
    }

    if (plan.synced) {
      currentSyncedLines = plan.lines;
      panel!.setOffsetControls(true, 0);
      panel!.setSpeedControls(false);
      const video = document.querySelector('video');
      if (video) {
        const loop = startSyncLoop(video, panel!, plan.lines, 0);
        currentSyncLoop = loop;
        addDisposer(() => { loop.stop(); currentSyncLoop = null; });
      }
    } else {
      currentSyncedLines = [];
      panel!.setOffsetControls(false);
      const video = document.querySelector('video');
      if (video && plan.lines.length > 0 && currentDurationSec !== null && currentDurationSec > 0) {
        panel!.setSpeedControls(true, currentScrollSpeed);
        const loop = startAutoScrollLoop(video, panel!, currentDurationSec, currentScrollSpeed);
        currentAutoScrollLoop = loop;
        addDisposer(() => { loop.stop(); currentAutoScrollLoop = null; });
      } else {
        panel!.setSpeedControls(false);
      }
    }

    if (currentVideoId !== null) {
      void chrome.runtime.sendMessage<PickCandidateRequest, PickCandidateResponse>({
        type: 'PICK_CANDIDATE',
        videoId: currentVideoId,
        record,
      });
    }
  });

  await load(videoId, gen);
}

/** Fetches and renders lyrics. Safe to call again when the title changes. */
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const song = await waitForSong(videoId);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;
    currentDurationSec = song.durationSec;

    const readings = normalizeTitleCandidates(song.rawTitle);
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');

    const request: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId,
      artist: primary.artist,
      track: primary.track,
      durationSec: song.durationSec,
      alternates: readings.slice(1),
    };

    let response: FetchLyricsResponse;
    try {
      response = await chrome.runtime.sendMessage<FetchLyricsRequest, FetchLyricsResponse>(request);
    } catch (error) {
      console.error('[karaoke] message failed', error);
      if (gen === generation && panel) {
        panel.setStatus('Extension worker unavailable. Reload the page.');
      }
      return;
    }

    if (gen !== generation || !panel) return;

    if (!response.ok) {
      console.warn(`[karaoke] load failed for "${song.rawTitle}": ${response.reason} — ${response.message}`);
      disposeAll();
      panel.setStatus(response.message);
      panel.setLines([]);
      panel.setOffsetControls(false);
      panel.setSpeedControls(false);
      currentSyncedLines = [];
      return;
    }

    console.log(
      `[karaoke] load OK "${response.record.trackName} / ${response.record.artistName}"`,
      `lrclibId=${response.lrclibId} offsetSec=${response.offsetSec} scrollSpeed=${response.scrollSpeed}`,
      `durationSec=${song.durationSec ?? 'null'}`,
    );

    const { record } = response;
    // Preserve any live nudge/tap/speed change already applied this session;
    // only take the stored values on the first load for this video
    // (currentLrclibId was null before).
    if (currentLrclibId === null) {
      currentOffsetSec = response.offsetSec;
      currentScrollSpeed = response.scrollSpeed;
    }
    currentLrclibId = response.lrclibId;

    // Write VideoMeta HERE (not in the background) so that only the authoritative
    // response — the one that passed the generation check — persists to storage.
    persistVideoMeta(videoId, response.lrclibId, 'load');
    currentRecord = response.record;
    panel.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);

    // A previous load's sync loop or auto-scroll loop (if any) is tied to
    // content we are about to replace — stop it exactly when the content it
    // drove stops being shown.
    disposeAll();
    panel.setStatus(plan.status);
    panel.setLines(plan.lines, plan.synced);

    if (plan.synced) {
      currentSyncedLines = plan.lines;
      panel.setSpeedControls(false);
      const video = document.querySelector('video');
      if (video) {
        const syncLoop = startSyncLoop(video, panel, plan.lines, currentOffsetSec * 1000);
        currentSyncLoop = syncLoop;
        addDisposer(() => { syncLoop.stop(); currentSyncLoop = null; });
        panel.setOffsetControls(true, currentOffsetSec);
      } else {
        panel.setOffsetControls(false);
      }
    } else {
      currentSyncedLines = [];
      panel.setOffsetControls(false);
      const video = document.querySelector('video');
      if (video && plan.lines.length > 0 && song.durationSec !== null && song.durationSec > 0) {
        panel.setSpeedControls(true, currentScrollSpeed);
        const loop = startAutoScrollLoop(video, panel, song.durationSec, currentScrollSpeed);
        currentAutoScrollLoop = loop;
        addDisposer(() => { loop.stop(); currentAutoScrollLoop = null; });
      } else {
        panel.setSpeedControls(false);
      }
    }
  } finally {
    if (gen === generation) isLoading = false;
  }
}

function reconcile(): void {
  // YouTube can replace #secondary during its own initial render, silently
  // detaching the panel's host element from the DOM. Detect this and reset so
  // the next iteration triggers a fresh activate into the new #secondary.
  if (panel !== null && document.querySelector(`#${PANEL_HOST_ID}`) === null) {
    teardown();
    currentVideoId = null;
  }

  const urlVideoId = parseVideoId(location.href);
  const detectedTitle = urlVideoId ? (detectSong(document, urlVideoId)?.rawTitle ?? null) : null;

  const action = decideReconcile({
    urlVideoId,
    currentVideoId,
    detectedTitle,
    renderedTitle,
    hasPanel: panel !== null,
    isLoading,
  });

  switch (action.kind) {
    case 'idle':
      return;
    case 'clear':
      currentVideoId = null;
      teardown();
      return;
    case 'activate':
      currentVideoId = action.videoId;
      teardown();
      void activate(action.videoId).catch((error) => {
        console.error('[karaoke] activate failed', error);
      });
      return;
    case 'reload': {
      // A fresh generation invalidates whatever the previous load was awaiting.
      generation += 1;
      const gen = generation;
      void load(action.videoId, gen).catch((error) => {
        console.error('[karaoke] reload failed', error);
      });
      return;
    }
  }
}

// Primary signal; YouTube fires this on its own SPA navigations.
document.addEventListener('yt-navigate-finish', reconcile);
// Backup signal, and the mechanism that self-corrects a stale title read.
setInterval(reconcile, NAVIGATION_POLL_MS);

reconcile();
```

- [ ] **Step 2: Typecheck and build**

```
npm run typecheck
npm run build
```

Expected: both succeed cleanly. (`npm run typecheck` will catch any mismatch with Task 1/3/4's new types immediately — this is the main verification for this task, since `content/index.ts` has no unit tests.)

- [ ] **Step 3: Run the full test suite**

```
npm test
```

Expected: all tests still pass (nothing in this task touches a tested module directly, but this confirms the refactor didn't break anything upstream).

- [ ] **Step 4: Commit**

```
git add src/content/index.ts
git commit -m "feat: wire dual sync mode and tap-to-sync into the content script"
```

*(Browser verification for this task is folded into the Sprint 5 acceptance check at the end of this plan — reload at `opera://extensions` and test on a real video with plain-text-only lyrics, and one with synced lyrics and a long intro.)*

---

## Task 6: Channel-name-as-artist fallback

**Files:**
- Modify: `src/content/song-detector.ts`
- Modify: `src/content/index.ts`
- Modify: `tests/content/song-detector.test.ts`

**Goal:** When title parsing finds no artist/track separator (`normalizeTitle` returns `artist: null`), add the video's channel name as an additional reading — a fallback, tried after every title-based reading, not a replacement for them. Per SESSION.md Session 8: reliable for official artist/VEVO channels, wrong for compilation/karaoke/label channels, so it must stay a low-priority alternate that still has to clear the match-scorer's gates, never an override.

**Interfaces:**
- Consumes: none new.
- Produces: `DetectedSong.channelName: string | null` (song-detector.ts). Consumed by `content/index.ts`'s `load()`.

---

- [ ] **Step 1: Write the failing song-detector tests**

Add to `tests/content/song-detector.test.ts` (after the closing of the `describe('detectSong video id check', ...)` block):

```typescript
describe('detectSong channel name', () => {
  it('reads the channel name when present', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1>' +
      '<ytd-channel-name id="channel-name"><yt-formatted-string id="text">Tattoo Colour</yt-formatted-string></ytd-channel-name>',
    );
    expect(detectSong(doc)?.channelName).toBe('Tattoo Colour');
  });

  it('returns null channelName when no channel element is present', () => {
    const doc = pageWith('<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1>');
    expect(detectSong(doc)?.channelName).toBeNull();
  });

  it('falls back through the channel-name selector list', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1>' +
      '<div id="owner"><ytd-channel-name><yt-formatted-string>LOSO Official</yt-formatted-string></ytd-channel-name></div>',
    );
    expect(detectSong(doc)?.channelName).toBe('LOSO Official');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```
npm test
```

Expected: `detectSong(...)?.channelName` is `undefined`, not `'Tattoo Colour'`/`null` — `DetectedSong` doesn't have the field yet.

- [ ] **Step 3: Update `src/content/song-detector.ts`**

Add the selector list and extend `DetectedSong` — insert after `TITLE_SELECTORS`:

```typescript
// Ordered most specific first, mirroring TITLE_SELECTORS. UNVERIFIED against
// live YouTube markup — confirm in the browser (Sprint 5 acceptance check)
// before trusting this in production. Low risk either way: the fallback only
// kicks in when title parsing already found no artist, so a wrong or missing
// channel name just degrades to today's behavior (search on track name alone).
const CHANNEL_NAME_SELECTORS = [
  'ytd-channel-name#channel-name yt-formatted-string#text',
  '#owner ytd-channel-name yt-formatted-string',
  'ytd-video-owner-renderer ytd-channel-name a',
] as const;
```

Change `DetectedSong`:

```typescript
export interface DetectedSong {
  rawTitle: string;
  durationSec: number | null;
  /** Channel name for the video, or null if unreadable. Used only as a
   *  fallback artist when title-parsing finds no separator — see
   *  content/index.ts's load(). */
  channelName: string | null;
}
```

Add a `readChannelName` helper, next to `readTitle`:

```typescript
function readChannelName(doc: Document): string | null {
  for (const selector of CHANNEL_NAME_SELECTORS) {
    const el = doc.querySelector(selector);
    const text = el?.textContent;
    if (text && text.trim()) return text.trim();
  }
  return null;
}
```

Update `detectSong`'s return:

```typescript
  return { rawTitle, durationSec, channelName: readChannelName(doc) };
```

(Replace the existing `return { rawTitle, durationSec };` line — everything above it in the function is unchanged.)

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test
```

Expected: all tests pass, including the three new ones. (No other `song-detector.test.ts` test breaks — none of them assert the full `DetectedSong` shape with `toEqual`, only individual fields with `?.rawTitle` / `?.durationSec`, so adding a field doesn't break them.)

- [ ] **Step 5: Wire the fallback into `src/content/index.ts`**

In `load()`, change:

```typescript
    const readings = normalizeTitleCandidates(song.rawTitle);
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');
```

To:

```typescript
    const readings = normalizeTitleCandidates(song.rawTitle);
    if (readings[0]!.artist === null && song.channelName) {
      console.log(`[karaoke] using channel-name fallback artist: "${song.channelName}"`);
      readings.push({ artist: song.channelName, track: readings[0]!.track });
    }
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');
```

- [ ] **Step 6: Typecheck and build**

```
npm run typecheck
npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 7: Run the full test suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```
git add src/content/song-detector.ts src/content/index.ts tests/content/song-detector.test.ts
git commit -m "feat: channel-name-as-artist fallback when title parsing finds no separator"
```

---

## Task 7: YouTube Music attribution signal

**Files:**
- Create: `src/core/music-attribution.ts`
- Create: `tests/core/music-attribution.test.ts`
- Create: `src/content/music-attribution.ts`
- Create: `tests/content/music-attribution.test.ts`
- Modify: `src/content/index.ts`

**Goal:** When YouTube's "Music in this video" panel is present (licensed-music metadata, confirmed structure in SESSION.md Session 8), extract its title/artist/album and use them as the *lead* reading — tried first, with every title-based and channel-name reading demoted to an alternate. The parser (`src/core/music-attribution.ts`) is pure and works on a raw HTML string; the fetch wrapper (`src/content/music-attribution.ts`) does the actual same-origin network call from the content script, bounded by a timeout since most videos carry no such panel at all and this must never stall the primary lookup.

**Interfaces:**
- Produces: `parseMusicAttribution(html): MusicAttribution | null` (`src/core/music-attribution.ts`); `fetchMusicAttribution(videoId, fetchImpl?): Promise<MusicAttribution | null>` (`src/content/music-attribution.ts`, re-exports `MusicAttribution`). Consumed by `content/index.ts`'s `load()`.

---

- [ ] **Step 1: Write the failing pure-parser tests**

Create `tests/core/music-attribution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMusicAttribution } from '../../src/core/music-attribution';

function pageWithAttribution(vm: Record<string, unknown> | null): string {
  const ytInitialData = {
    engagementPanels: vm
      ? [
          {
            engagementPanelSectionListRenderer: {
              panelIdentifier: 'engagement-panel-structured-description',
              content: {
                structuredDescriptionContentRenderer: {
                  items: [
                    { horizontalCardListRenderer: { cards: [{ videoAttributeViewModel: vm }] } },
                  ],
                },
              },
            },
          },
        ]
      : [],
  };
  return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></body></html>`;
}

const rickAstleyVm = {
  title: 'Never Gonna Give You Up (7" Mix)',
  subtitle: 'Rick Astley',
  secondarySubtitle: { content: 'Whenever You Need Somebody' },
};

describe('parseMusicAttribution', () => {
  it('extracts title, artist, and album from a real-shaped attribution panel', () => {
    const html = pageWithAttribution(rickAstleyVm);
    expect(parseMusicAttribution(html)).toEqual({
      title: 'Never Gonna Give You Up (7" Mix)',
      artist: 'Rick Astley',
      album: 'Whenever You Need Somebody',
    });
  });

  it('returns album null when secondarySubtitle is absent', () => {
    const html = pageWithAttribution({ title: 'Song', subtitle: 'Artist' });
    expect(parseMusicAttribution(html)).toEqual({ title: 'Song', artist: 'Artist', album: null });
  });

  it('returns null when the page has no engagement panels at all', () => {
    expect(parseMusicAttribution(pageWithAttribution(null))).toBeNull();
  });

  it('returns null when ytInitialData is missing from the page', () => {
    expect(parseMusicAttribution('<html><body>no data here</body></html>')).toBeNull();
  });

  it('returns null when ytInitialData is present but not valid JSON', () => {
    const html = '<script>var ytInitialData = {not: valid};</script>';
    expect(parseMusicAttribution(html)).toBeNull();
  });

  it('returns null when the structured-description panel is absent among other panels', () => {
    const ytInitialData = {
      engagementPanels: [
        { engagementPanelSectionListRenderer: { panelIdentifier: 'some-other-panel' } },
      ],
    };
    const html = `<script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script>`;
    expect(parseMusicAttribution(html)).toBeNull();
  });

  it('returns null when the card has no title or subtitle', () => {
    const html = pageWithAttribution({ secondarySubtitle: { content: 'Album' } });
    expect(parseMusicAttribution(html)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail on the missing import**

```
npm test
```

Expected: `src/core/music-attribution.ts` does not exist yet — import error.

- [ ] **Step 3: Implement `src/core/music-attribution.ts`**

```typescript
export interface MusicAttribution {
  title: string;
  artist: string;
  album: string | null;
}

const YT_INITIAL_DATA_PATTERN = /var ytInitialData\s*=\s*(\{.*?\});/s;
const STRUCTURED_DESCRIPTION_PANEL_ID = 'engagement-panel-structured-description';

/**
 * Extracts the "Music in this video" attribution (song/artist/album) from a
 * YouTube watch page's raw HTML, if present. Most videos carry no such data
 * — only ones YouTube's Content ID recognizes as licensed music — so a null
 * return is the common case, not an error.
 *
 * Reads the same `videoAttributeViewModel` JSON YouTube's own player renders
 * the "Music" info panel from — confirmed by fetching a known video's raw
 * HTML and inspecting the embedded `ytInitialData` blob (see SESSION.md,
 * Session 8). No DOM, no expand-panel click needed: the data is already in
 * the page source on load.
 *
 * The regex extraction is a known simplification (also flagged in
 * SESSION.md): a non-greedy match up to the first literal `};` can truncate
 * early if a string value inside the blob happens to contain that exact
 * substring. A truncated blob fails JSON.parse and this function returns
 * null — the same "no attribution data" outcome as a page that never had a
 * Music panel, never a thrown error.
 */
export function parseMusicAttribution(html: string): MusicAttribution | null {
  const match = html.match(YT_INITIAL_DATA_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  const vm = findVideoAttributeViewModel(data);
  if (!vm) return null;

  const title = typeof vm.title === 'string' ? vm.title : null;
  const artist = typeof vm.subtitle === 'string' ? vm.subtitle : null;
  if (!title || !artist) return null;

  const secondary = vm.secondarySubtitle;
  const album =
    typeof secondary === 'object' && secondary !== null && 'content' in secondary &&
    typeof (secondary as { content: unknown }).content === 'string'
      ? (secondary as { content: string }).content
      : null;

  return { title, artist, album };
}

/**
 * Walks `ytInitialData.engagementPanels` to find the structured-description
 * panel, then its first card's `videoAttributeViewModel`. Every step is
 * optional-chained: this is untyped third-party JSON whose shape YouTube can
 * change at any time, and a shape mismatch should read as "no attribution
 * data" rather than throw.
 */
function findVideoAttributeViewModel(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null;
  const panels = (data as Record<string, unknown>)['engagementPanels'];
  if (!Array.isArray(panels)) return null;

  for (const panel of panels) {
    const renderer = panel?.engagementPanelSectionListRenderer;
    if (renderer?.panelIdentifier !== STRUCTURED_DESCRIPTION_PANEL_ID) continue;

    const items = renderer?.content?.structuredDescriptionContentRenderer?.items;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const cards = item?.horizontalCardListRenderer?.cards;
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        const vm = card?.videoAttributeViewModel;
        if (vm && typeof vm === 'object') return vm as Record<string, unknown>;
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test
```

Expected: all tests pass, including the seven new ones.

- [ ] **Step 5: Write the failing fetch-wrapper tests**

Create `tests/content/music-attribution.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchMusicAttribution } from '../../src/content/music-attribution';

function pageWithAttribution(vm: Record<string, unknown>): string {
  const ytInitialData = {
    engagementPanels: [
      {
        engagementPanelSectionListRenderer: {
          panelIdentifier: 'engagement-panel-structured-description',
          content: {
            structuredDescriptionContentRenderer: {
              items: [
                { horizontalCardListRenderer: { cards: [{ videoAttributeViewModel: vm }] } },
              ],
            },
          },
        },
      },
    ],
  };
  return `<html><body><script>var ytInitialData = ${JSON.stringify(ytInitialData)};</script></body></html>`;
}

const rickAstleyVm = {
  title: 'Never Gonna Give You Up (7" Mix)',
  subtitle: 'Rick Astley',
  secondarySubtitle: { content: 'Whenever You Need Somebody' },
};

describe('fetchMusicAttribution', () => {
  it('fetches the watch page for the given videoId and parses the response', async () => {
    const html = pageWithAttribution(rickAstleyVm);
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => html } as Response;
    });
    const result = await fetchMusicAttribution('dQw4w9WgXcQ', fakeFetch as unknown as typeof fetch);
    expect(calls[0]).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toEqual({
      title: 'Never Gonna Give You Up (7" Mix)',
      artist: 'Rick Astley',
      album: 'Whenever You Need Somebody',
    });
  });

  it('returns null when the fetch response is not ok', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, text: async () => '' }) as Response);
    const result = await fetchMusicAttribution('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the fetch throws (network error, abort, etc.)', async () => {
    const fakeFetch = vi.fn(async () => { throw new Error('offline'); });
    const result = await fetchMusicAttribution('abc', fakeFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests — confirm they fail on the missing import**

```
npm test
```

Expected: `src/content/music-attribution.ts` does not exist yet — import error.

- [ ] **Step 7: Implement `src/content/music-attribution.ts`**

```typescript
import { parseMusicAttribution, type MusicAttribution } from '../core/music-attribution';

export type { MusicAttribution };

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the video's own watch page and extracts its Music attribution, if
 * any. Runs from the content script (same-origin fetch to youtube.com, so no
 * extra host_permissions needed — see this plan's Global Constraints) rather
 * than the background, since it needs no privilege the page itself doesn't
 * already have.
 *
 * Times out after FETCH_TIMEOUT_MS: this is a full page fetch (100KB+) for a
 * bonus signal most videos don't have, and must never stall the primary
 * title-based lookup.
 */
export async function fetchMusicAttribution(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MusicAttribution | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    return parseMusicAttribution(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 8: Run tests — confirm they pass**

```
npm test
```

Expected: all tests pass, including the three new ones.

- [ ] **Step 9: Wire the attribution fetch into `src/content/index.ts`**

Add the import, alongside the other content-module imports:

```typescript
import { fetchMusicAttribution } from './music-attribution';
```

In `load()`, change the opening of the function from:

```typescript
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const song = await waitForSong(videoId);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;
    currentDurationSec = song.durationSec;

    const readings = normalizeTitleCandidates(song.rawTitle);
    if (readings[0]!.artist === null && song.channelName) {
      console.log(`[karaoke] using channel-name fallback artist: "${song.channelName}"`);
      readings.push({ artist: song.channelName, track: readings[0]!.track });
    }
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');
```

To:

```typescript
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const [song, attribution] = await Promise.all([
      waitForSong(videoId),
      fetchMusicAttribution(videoId),
    ]);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;
    currentDurationSec = song.durationSec;

    const titleReadings = normalizeTitleCandidates(song.rawTitle);
    if (titleReadings[0]!.artist === null && song.channelName) {
      console.log(`[karaoke] using channel-name fallback artist: "${song.channelName}"`);
      titleReadings.push({ artist: song.channelName, track: titleReadings[0]!.track });
    }
    // The Music attribution panel, when present, is authoritative label
    // metadata (the same data YouTube's own Content ID system uses) rather
    // than a guess from the raw title — so it leads the reading list. It
    // still goes through the normal search + score gate below rather than
    // bypassing it outright: this codebase's hard-won lesson (SESSION.md,
    // "Hard-won lessons") is that no single heuristic, however confident,
    // gets to skip verification against the actual LRCLIB record.
    if (attribution) {
      console.log(`[karaoke] using Music attribution: "${attribution.title}" / "${attribution.artist}"`);
    }
    const readings = attribution
      ? [{ artist: attribution.artist, track: attribution.title }, ...titleReadings]
      : titleReadings;
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');
```

`fetchMusicAttribution` never throws (it catches internally and resolves `null`), so no extra `.catch()` is needed around it in the `Promise.all`.

- [ ] **Step 10: Typecheck and build**

```
npm run typecheck
npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 11: Run the full test suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

```
git add src/core/music-attribution.ts src/content/music-attribution.ts src/content/index.ts tests/core/music-attribution.test.ts tests/content/music-attribution.test.ts
git commit -m "feat: YouTube Music attribution signal — lead reading when the licensed-music panel is present"
```

---

## Self-Review

**Spec coverage** (against SESSION.md's Sessions 7–8, per the scope confirmed at the start of planning — dual sync mode + tap-to-sync, and channel-name + Music-attribution signals; rate adjustment and the original "category gate, error states, polish" line item were explicitly excluded from this sprint):

- Dual sync modes (auto-scroll for unsynced lyrics) → Tasks 2, 4, 5.
- Tap-to-sync offset, ◀▶ kept for fine-tuning → Tasks 3, 5.
- Channel-name-as-artist fallback → Task 6.
- YouTube Music attribution signal → Task 7.
- Persistence for the new offset/scroll-speed state → Task 1 (storage/messaging), Task 5 (write path).

**Placeholder scan:** no TBD/"add appropriate handling"/"similar to Task N" markers — every step above shows the literal code to write.

**Type consistency:** `AutoScrollLoopHandle.setSpeed` (Task 4) matches its only caller in Task 5 (`currentAutoScrollLoop?.setSpeed(currentScrollSpeed)`). `computeAutoScrollTopPx`'s four-argument signature (Task 2) matches its one call site inside `auto-scroll-loop.ts` (Task 4). `PanelHandle.setSpeedControls(visible, speed?)` (Task 3) matches every call site in Task 5. `MusicAttribution { title, artist, album }` (Task 7's core module) matches the destructuring in Task 7's content-script wiring (`attribution.title`, `attribution.artist`). `DetectedSong.channelName` (Task 6) matches its one read site in Task 7's `load()` rewrite (`song.channelName`).

---

## Sprint 5 acceptance check

*Verify in Opera GX after `npm run build` and reloading the extension at `opera://extensions`:*

1. **Auto-scroll for unsynced lyrics:** Open a video whose LRCLIB record has only plain-text lyrics (no synced timing). The ◀▶ offset bar should stay hidden; a ▼ 1.0x ▲ speed bar should appear instead, and the lyric list should scroll on its own as the video plays, reaching roughly the end of the text near the end of the video. Click ▲ a few times — scrolling should visibly speed up. Navigate away and back — the adjusted speed should be restored.

2. **Tap-to-sync:** Open a video with synced lyrics that has a cold-open intro (or seek partway into any synced video). Click "Sync here" — the highlighted line should immediately reflect that moment (may require a brief pause/seek to see it settle). The ◀▶ buttons should still nudge from that new baseline afterward.

3. **Manual scroll suspension still works in both modes:** scroll the lyric list by hand during either sync mode — auto-scroll/auto-highlight should pause for a few seconds before resuming.

4. **Channel-name fallback:** find or queue a video whose title has no artist/track separator (a bare track name). Check the console for `[karaoke] using channel-name fallback artist: "..."` and confirm lyrics are found where they previously would only have searched on the bare track name.

5. **Music attribution:** open a video known to carry YouTube's "Music in this video" panel (e.g. a major-label official upload). Check the console for `[karaoke] using Music attribution: "..."` and confirm the panel header shows the attributed title/artist. If no such log appears on any tested video, manually verify `https://www.youtube.com/watch?v=<id>`'s raw HTML actually contains `ytInitialData` with an `engagement-panel-structured-description` panel (per SESSION.md Session 8) before treating this as a bug — most videos genuinely have no Music panel.

6. **Content-script fetch works without a manifest change:** confirm step 5 doesn't fail with a permissions/CSP error in the console. If it does, add `"https://www.youtube.com/*"` to `host_permissions` in `public/manifest.json` and rebuild.

7. **No regressions:** offset nudge + persistence, and the cache hit/reject behavior from Sprint 4, still work as before (manual search UI remains intentionally disabled per Session 5).

---

## Execution options

**Plan complete and saved to `docs/superpowers/plans/2026-08-16-karaoke-sprint-5-dual-sync-and-detection-signals.md`.**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Tasks 1–4 are independent of 6–7 and could run in parallel once you pick this option; Task 5 must follow 1–4, and Tasks 6/7 must follow Task 5.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
