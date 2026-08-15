# Sprint 2.5 — Matching and Staleness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five defects found by real-world acceptance testing that make the extension show stale lyrics after navigation and fail to find Thai songs LRCLIB actually has.

**Architecture:** Five bounded changes to existing modules. No new subsystems. The one structural addition is a pure `decideReconcile` function that makes navigation handling self-correcting and, unlike the current inline logic, unit-testable.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom. Unchanged.

**Spec:** `docs/superpowers/specs/2026-08-15-youtube-karaoke-lyrics-design.md` — see the two **Correction (2026-08-15)** sections, which record the evidence these fixes argue from.

## Global Constraints

Every task's requirements implicitly include this section.

- `src/core/` is PURE: never import `chrome.*`, never reference `document`, `window`, or `location`.
- ALL network access lives in the service worker; the content script never calls `fetch`.
- The content script bundle must contain NO ES module syntax (MV3 content scripts are classic scripts). Enforced by `tests/build.test.ts`.
- Lyrics are UNTRUSTED third-party content: `textContent` only, never `innerHTML`.
- Thai text: Unicode NFC where normalized; NEVER fold tone marks.
- TypeScript `strict: true` with `noUncheckedIndexedAccess: true`.
- **No weight constant in `match-scorer.ts` may change:** `WEIGHT_TRACK` 0.5, `WEIGHT_ARTIST` 0.3, `WEIGHT_DURATION` 0.2, `VARIANT_PENALTY` 0.25, `SYNCED_BONUS` 0.05, `MATCH_THRESHOLD` 0.55, `DURATION_TOLERANCE_SEC` 20, `NEUTRAL` 0.5. Task 2 ADDS a new constant; it changes none of these.
- `npm test` carries `NODE_OPTIONS=--experimental-require-module` deliberately (this machine runs Node v22.11.0; jsdom needs `require(esm)`, unflagged only in 22.12.0+). Do not remove it.
- All 101 existing tests must still pass. Never edit an existing test's expectation to make a change pass.
- Commit after every task.

## Why these five, in this order

Task 2 must land before Task 5. Today a Thai song that LRCLIB genuinely lacks
returns "No lyrics found" — visibly wrong. Task 5 makes Thai queries actually
reach the catalogue, which without Task 2's gate converts that visible failure
into a *silent* one: the measured case scored an unrelated track by the same
artist at 0.561, above the 0.55 threshold. Fixing retrieval before fixing
precision would trade a failure the user can see for one they cannot.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/content/reconcile.ts` (new) | PURE decision: given URL/state/title, what should the content script do? | 1 |
| `src/content/index.ts` | Executes reconcile actions; tracks rendered title | 1, 5 |
| `src/core/match-scorer.ts` | Adds `trackSimilarity` to results and a minimum-similarity gate | 2 |
| `src/core/title-normalizer.ts` | Collapses channel-name duplication; emits both orderings | 3, 4 |
| `src/core/search-query.ts` (new) | PURE: builds an LRCLIB query that survives Thai | 5 |
| `src/messaging/types.ts` | Carries alternate readings to the worker | 5 |
| `src/background/handle-fetch-lyrics.ts` | Tries every reading against one candidate set | 5 |

---

### Task 1: Self-correcting navigation

The user-visible bug: click a suggested video and the previous song's lyrics stay
on screen, permanently, until a full page reload.

Two causes. First, `detectSong` guards on `ytd-watch-flexy[video-id]` but reads
the `<h1>` — different elements with different update timings, so the guard can
pass while the heading is still stale. Second, `onLocationChanged` returns early
when `videoId === currentVideoId`, so the `yt-navigate-finish` that arrives after
the heading updates does nothing. One bad read is final.

The fix stops guessing YouTube's update order: remember the title we acted on,
and re-run the lookup if the title for the current video later changes.

**Files:**
- Create: `src/content/reconcile.ts`
- Modify: `src/content/index.ts`
- Test: `tests/content/reconcile.test.ts`

**Interfaces:**
- Consumes: `parseVideoId` from `src/core/youtube-url.ts`; `detectSong(doc?, expectedVideoId?)` from `src/content/song-detector.ts`; `mountPanel`/`PanelHandle` from `src/content/panel.ts`.
- Produces:
  - `type ReconcileAction = { kind: 'idle' } | { kind: 'clear' } | { kind: 'activate'; videoId: string } | { kind: 'reload'; videoId: string }`
  - `interface ReconcileInput { urlVideoId: string | null; currentVideoId: string | null; detectedTitle: string | null; renderedTitle: string | null; hasPanel: boolean; isLoading: boolean }`
  - `decideReconcile(input: ReconcileInput): ReconcileAction`

- [ ] **Step 1: Write the failing test**

Create `tests/content/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideReconcile, type ReconcileInput } from '../../src/content/reconcile';

function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    urlVideoId: 'aaa',
    currentVideoId: 'aaa',
    detectedTitle: 'Oasis - Wonderwall',
    renderedTitle: 'Oasis - Wonderwall',
    hasPanel: true,
    isLoading: false,
    ...over,
  };
}

describe('decideReconcile', () => {
  it('activates when the url moves to a new video', () => {
    expect(decideReconcile(input({ urlVideoId: 'bbb', currentVideoId: 'aaa' }))).toEqual({
      kind: 'activate',
      videoId: 'bbb',
    });
  });

  it('activates when arriving at a video from a non-watch page', () => {
    expect(decideReconcile(input({ urlVideoId: 'bbb', currentVideoId: null }))).toEqual({
      kind: 'activate',
      videoId: 'bbb',
    });
  });

  it('clears when leaving a video for a non-watch page', () => {
    expect(decideReconcile(input({ urlVideoId: null }))).toEqual({ kind: 'clear' });
  });

  it('is idle while already off a watch page', () => {
    expect(decideReconcile(input({ urlVideoId: null, currentVideoId: null }))).toEqual({
      kind: 'idle',
    });
  });

  it('is idle when nothing has changed', () => {
    expect(decideReconcile(input())).toEqual({ kind: 'idle' });
  });

  // This is the bug. YouTube swapped the heading in after we already rendered
  // the previous video's title, and nothing was re-checking.
  it('reloads when the title changes under the same video', () => {
    expect(
      decideReconcile(
        input({ renderedTitle: 'LOSO - Old Song', detectedTitle: 'LOSO - New Song' }),
      ),
    ).toEqual({ kind: 'reload', videoId: 'aaa' });
  });

  it('does not reload while a load is already in flight', () => {
    expect(
      decideReconcile(
        input({ renderedTitle: null, detectedTitle: 'LOSO - New Song', isLoading: true }),
      ),
    ).toEqual({ kind: 'idle' });
  });

  it('does not reload before a title has been detected', () => {
    expect(decideReconcile(input({ detectedTitle: null }))).toEqual({ kind: 'idle' });
  });

  it('does not reload when there is no panel to update', () => {
    expect(
      decideReconcile(input({ hasPanel: false, detectedTitle: 'x', renderedTitle: 'y' })),
    ).toEqual({ kind: 'idle' });
  });

  it('prefers navigation over reload when both changed', () => {
    expect(
      decideReconcile(
        input({ urlVideoId: 'bbb', currentVideoId: 'aaa', renderedTitle: 'x', detectedTitle: 'y' }),
      ),
    ).toEqual({ kind: 'activate', videoId: 'bbb' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/content/reconcile.test.ts`
Expected: FAIL — cannot resolve `../../src/content/reconcile`.

- [ ] **Step 3: Write `src/content/reconcile.ts`**

```ts
/**
 * What the content script should do next, given the page state.
 *
 * Pure and DOM-free so the navigation rules can be tested. The rules exist
 * because YouTube updates its DOM signals at different moments: the video-id
 * attribute can flip to the new video while the heading still holds the old
 * title. Rather than guess which element lags, we remember the title we acted
 * on and re-run when it changes.
 */
export type ReconcileAction =
  | { kind: 'idle' }
  | { kind: 'clear' }
  | { kind: 'activate'; videoId: string }
  | { kind: 'reload'; videoId: string };

export interface ReconcileInput {
  /** Video id in the address bar right now, or null off a watch page. */
  urlVideoId: string | null;
  /** Video id the content script currently believes it is showing. */
  currentVideoId: string | null;
  /** Title read from the DOM this instant, or null if none is readable. */
  detectedTitle: string | null;
  /** Title the currently displayed lyrics were fetched for. */
  renderedTitle: string | null;
  hasPanel: boolean;
  /** True while a lookup is in flight, so we do not stack requests. */
  isLoading: boolean;
}

export function decideReconcile(input: ReconcileInput): ReconcileAction {
  const { urlVideoId, currentVideoId, detectedTitle, renderedTitle, hasPanel, isLoading } = input;

  // Navigation wins over every other consideration.
  if (urlVideoId !== currentVideoId) {
    return urlVideoId === null ? { kind: 'clear' } : { kind: 'activate', videoId: urlVideoId };
  }

  if (urlVideoId === null) return { kind: 'idle' };
  if (!hasPanel || isLoading) return { kind: 'idle' };
  if (detectedTitle === null) return { kind: 'idle' };
  if (detectedTitle === renderedTitle) return { kind: 'idle' };

  return { kind: 'reload', videoId: urlVideoId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/content/reconcile.test.ts`
Expected: all ten tests PASS.

- [ ] **Step 5: Rewrite `src/content/index.ts` to execute reconcile actions**

**Read the existing file before you start.** This replacement preserves things a
naive rewrite would silently revert — in particular it keeps `planRender` from
`./render-plan` rather than inlining the render branches, and keeps
`waitForSong`'s duration polling and its docblock. Both came from earlier fix
rounds. Do not reintroduce inline render logic.

The change splits the old `activate` into `activate` (mount, once per navigation)
and `load` (fetch and render, repeatable), replaces the videoId-only guard with a
`generation` counter, and swaps `onLocationChanged` for `reconcile`.

```ts
import { mountPanel, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { decideReconcile } from './reconcile';
import { planRender } from './render-plan';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitle } from '../core/title-normalizer';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  panel?.destroy();
  panel = null;
  renderedTitle = null;
  isLoading = false;
  generation += 1;
}

async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    if (el) return el;
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
  let withoutDuration: DetectedSong | null = null;

  while (Date.now() < deadline) {
    const song = detectSong(document, videoId);
    if (song) {
      if (song.durationSec !== null) return song;
      withoutDuration = song;
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

    const { artist, track } = normalizeTitle(song.rawTitle);
    panel.setHeader(track, artist ?? 'unknown artist');

    const request: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId,
      artist,
      track,
      durationSec: song.durationSec,
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
      panel.setStatus(response.message);
      panel.setLines([]);
      return;
    }

    const { record } = response;
    panel.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);
    panel.setStatus(plan.status);
    panel.setLines(plan.lines);
  } finally {
    if (gen === generation) isLoading = false;
  }
}

function reconcile(): void {
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

Two things this also fixes in passing: `activate` and `load` now carry `.catch`
handlers, closing the long-deferred unhandled-rejection minor; and `activate`
reads `generation` rather than incrementing it, because `teardown()` already
bumped it — incrementing in both places would make `activate`'s own `gen` stale
immediately.

- [ ] **Step 6: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 101 prior + 10 new = 111 tests PASS; typecheck clean; build clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: re-detect the song when YouTube swaps the title in late"
```

---

### Task 2: Minimum track-similarity gate

A song genuinely absent from LRCLIB currently matches an unrelated track by the
same artist. Measured: expected `คืนจันทร์`, matched `ครึ่งทาง`, score **0.561**
against a 0.55 threshold. With a matching artist and no duration, the floor is
already `0.3 + 0.1 + 0.05 = 0.45`, so any track similarity above roughly 0.2
clears the bar.

The invariant being violated is simple and worth stating directly: **the song
name has to actually resemble the song name.** That is a separate condition from
the weighted total, so it gets its own gate rather than a threshold tweak.

**Files:**
- Modify: `src/core/match-scorer.ts`
- Test: `tests/core/match-scorer.test.ts`

**Interfaces:**
- Consumes: `LrclibRecord` from `src/core/types.ts`.
- Produces:
  - `ScoredCandidate` gains a `trackSimilarity: number` field
  - `const MIN_TRACK_SIMILARITY = 0.35`
  - `pickBestScored(input: MatchInput, candidates: LrclibRecord[]): ScoredCandidate | null`
  - `pickBestMatch` keeps its existing signature and is reimplemented on top of `pickBestScored`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/match-scorer.test.ts`, inside the existing
`describe('pickBestMatch')` block:

```ts
  it('rejects a same-artist track whose name does not resemble the wanted one', () => {
    // Real case: คืนจันทร์ is absent from LRCLIB, but ครึ่งทาง by the same
    // artist scored 0.561 against a 0.55 threshold and was shown as a match.
    const wrong = record({
      id: 100,
      trackName: 'ครึ่งทาง',
      artistName: 'Loso',
      duration: null,
    });
    expect(
      pickBestMatch({ artist: 'Loso', track: 'คืนจันทร์', durationSec: null }, [wrong]),
    ).toBeNull();
  });

  it('still accepts a real match whose name carries a suffix', () => {
    const remaster = record({
      id: 101,
      trackName: 'Wonderwall - Remastered',
      artistName: 'Oasis',
      duration: null,
    });
    expect(
      pickBestMatch({ artist: 'Oasis', track: 'Wonderwall', durationSec: null }, [remaster])?.id,
    ).toBe(101);
  });

  it('still accepts an exact Thai match found via the artist catalogue', () => {
    const hit = record({ id: 102, trackName: 'ใจสั่งมา', artistName: 'Loso', duration: null });
    expect(
      pickBestMatch({ artist: 'Loso', track: 'ใจสั่งมา', durationSec: null }, [hit])?.id,
    ).toBe(102);
  });
```

And add a new block at the end of the file:

```ts
describe('pickBestScored', () => {
  it('exposes the track similarity that gated the decision', () => {
    const hit = record({ id: 110, trackName: 'Wonderwall', artistName: 'Oasis', duration: 258 });
    const scored = pickBestScored(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [hit],
    );
    expect(scored?.record.id).toBe(110);
    expect(scored?.trackSimilarity).toBe(1);
  });

  it('returns null when the only candidate fails the similarity gate', () => {
    const wrong = record({ id: 111, trackName: 'ครึ่งทาง', artistName: 'Loso', duration: null });
    expect(
      pickBestScored({ artist: 'Loso', track: 'คืนจันทร์', durationSec: null }, [wrong]),
    ).toBeNull();
  });

  it('skips a high-scoring dissimilar candidate in favour of a similar one', () => {
    const dissimilar = record({ id: 112, trackName: 'ครึ่งทาง', artistName: 'Loso', duration: 200 });
    const similar = record({ id: 113, trackName: 'ใจสั่งมา', artistName: 'Loso', duration: null });
    const scored = pickBestScored(
      { artist: 'Loso', track: 'ใจสั่งมา', durationSec: 200 },
      [dissimilar, similar],
    );
    expect(scored?.record.id).toBe(113);
  });

  it('exposes a similarity floor between 0 and 1', () => {
    expect(MIN_TRACK_SIMILARITY).toBeGreaterThan(0);
    expect(MIN_TRACK_SIMILARITY).toBeLessThan(1);
  });
});
```

Update the import at the top of the file to include the new exports:

```ts
import {
  similarity,
  scoreCandidates,
  pickBestMatch,
  pickBestScored,
  MATCH_THRESHOLD,
  MIN_TRACK_SIMILARITY,
} from '../../src/core/match-scorer';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/match-scorer.test.ts`
Expected: FAIL — `pickBestScored` and `MIN_TRACK_SIMILARITY` are not exported, and
the `คืนจันทร์` rejection test fails because the current code returns the wrong
record instead of null.

- [ ] **Step 3: Add the gate to `src/core/match-scorer.ts`**

Add the constant beside the existing weights (do NOT alter any of them):

```ts
/**
 * A candidate must clear this on track-name similarity alone, independently of
 * its weighted total. Without it, a matching artist plus an unknown duration
 * puts the floor at 0.45, so nearly any track name clears MATCH_THRESHOLD --
 * measured: คืนจันทร์ matched ครึ่งทาง at 0.561.
 */
export const MIN_TRACK_SIMILARITY = 0.35;
```

Add `trackSimilarity` to the result interface:

```ts
export interface ScoredCandidate {
  record: LrclibRecord;
  score: number;
  /** Track-name similarity alone, before weighting. Gates the match. */
  trackSimilarity: number;
}
```

In `scoreCandidates`, compute the similarity once, use it for the weighted term,
and include it in the returned object:

```ts
    .map((record) => {
      const trackSimilarity = similarity(input.track, record.trackName);

      let score =
        WEIGHT_TRACK * trackSimilarity +
        WEIGHT_ARTIST *
          (input.artist === null ? NEUTRAL : similarity(input.artist, record.artistName)) +
        WEIGHT_DURATION * durationScore(input.durationSec, record.duration);

      if (!sameVariant(input.track, record.trackName)) score -= VARIANT_PENALTY;
      if (record.syncedLyrics) score += SYNCED_BONUS;

      return { record, score, trackSimilarity };
    })
```

Then replace `pickBestMatch` with:

```ts
export function pickBestScored(
  input: MatchInput,
  candidates: LrclibRecord[],
): ScoredCandidate | null {
  for (const candidate of scoreCandidates(input, candidates)) {
    // Sorted by score descending, so once one falls short none after it clears.
    if (candidate.score < MATCH_THRESHOLD) return null;
    if (candidate.trackSimilarity < MIN_TRACK_SIMILARITY) continue;
    return candidate;
  }
  return null;
}

export function pickBestMatch(
  input: MatchInput,
  candidates: LrclibRecord[],
): LrclibRecord | null {
  return pickBestScored(input, candidates)?.record ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/match-scorer.test.ts`
Expected: all previous match-scorer tests plus the 7 new ones PASS.

If the `Wonderwall - Remastered` case now fails, the gate is too high — report it
with the measured similarity rather than lowering the constant silently.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 118 tests PASS; typecheck clean; build clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: require a minimum track-name similarity to call it a match"
```

---

### Task 3: Collapse channel-name duplication

`คืนจันทร์ - LOSO 【OFFICIAL MV】LOSO` becomes `คืนจันทร์ - LOSO LOSO` once the
bracketed noise is stripped, and the doubled artist then pollutes both the query
and the similarity comparison.

The rule is deliberately narrow: collapse a repeat only when the two copies are
separated by a bracketed run. A blanket "drop a repeated trailing word" rule
would destroy legitimate titles like `Bye Bye Bye` or `Boom Boom`.

**Files:**
- Modify: `src/core/title-normalizer.ts`
- Test: `tests/core/title-normalizer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. `normalizeTitle` behavior changes only for titles matching the pattern.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/title-normalizer.test.ts` inside the existing `describe`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: the two collapse tests FAIL (track comes back as `LOSO LOSO` and
`Three Man Down Three Man Down`). The two preservation tests should already pass —
if either fails, stop and report, because it means the existing code already
mangles them.

- [ ] **Step 3: Add the collapse to `src/core/title-normalizer.ts`**

Add near the other patterns:

```ts
/**
 * `X 【…】 X` / `X […] X` / `X (…) X` -> `X`.
 *
 * YouTube uploaders often append the channel name after a bracketed tag, so the
 * artist ends up twice once the tag is stripped. Requiring a bracketed run
 * BETWEEN the two copies is what keeps this from eating "Bye Bye Bye".
 * Capped at four words, and applied before noise stripping removes the brackets.
 */
const DUPLICATED_ACROSS_BRACKETS =
  /(\S+(?:\s+\S+){0,3})\s*(?:【[^】]*】|\[[^\]]*\]|\([^)]*\))\s*\1\s*$/i;
```

Then, in `normalizeTitle`, apply it as the FIRST transformation — before
`CJK_BRACKETED_NOISE` and `BRACKETED_NOISE`, which would otherwise remove the
brackets this pattern depends on:

```ts
export function normalizeTitle(rawTitle: string): ParsedTitle {
  let text = rawTitle.normalize('NFC');

  // Must run before the bracket strippers: the brackets are the evidence.
  text = text.replace(DUPLICATED_ACROSS_BRACKETS, '$1');

  text = text.replace(CJK_BRACKETED_NOISE, ' ');
  // …rest of the existing pipeline unchanged…
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: all existing normalizer tests plus the 4 new ones PASS.

- [ ] **Step 5: Verify the pattern by execution, not by reading**

This module has produced five defects, every one a pattern matching more than
intended, and every one survived being read carefully. Run:

```bash
node -e "
const P = /(\S+(?:\s+\S+){0,3})\s*(?:【[^】]*】|\[[^\]]*\]|\([^)]*\))\s*\1\s*\$/i;
const cases = [
  'คืนจันทร์ - LOSO 【OFFICIAL MV】LOSO',
  'เปิดตัวเขา - Three Man Down [Official MV] Three Man Down',
  'NSYNC - Bye Bye Bye',
  'John Lee Hooker - Boom Boom',
  'Oasis - Wonderwall (Official Video)',
  'Artist - Song (Live) Artist',
  'Duran Duran - Rio',
];
for (const c of cases) console.log(JSON.stringify(c), '->', JSON.stringify(c.replace(P, '\$1')));
"
```

Expected: the first two collapse; `Bye Bye Bye`, `Boom Boom`, `Wonderwall`, and
`Duran Duran - Rio` are untouched. Paste the actual output into your report. If
any line is wrong, fix the pattern and re-run rather than adjusting a test.

- [ ] **Step 6: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 122 tests PASS; typecheck clean; build clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: collapse a channel name repeated across bracketed noise"
```

---

### Task 4: Emit both artist/track orderings

Thai music videos frequently title themselves `Song - Artist`, the reverse of the
Western convention: `คืนจันทร์ - LOSO` is the song `คืนจันทร์` by `LOSO`, but the
normalizer reads it as an artist called `คืนจันทร์`.

Rather than guess the ordering from script or channel name, emit both readings and
let the scorer decide — it already has the evidence, since only one ordering will
match a real record.

**Files:**
- Modify: `src/core/title-normalizer.ts`
- Test: `tests/core/title-normalizer.test.ts`

**Interfaces:**
- Consumes: `normalizeTitle`, `ParsedTitle` (existing, in the same file).
- Produces: `normalizeTitleCandidates(rawTitle: string): ParsedTitle[]` — the primary reading first, then the swapped one when a separator was found. `normalizeTitle` is unchanged and still returns the primary reading.

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `tests/core/title-normalizer.test.ts`:

```ts
describe('normalizeTitleCandidates', () => {
  it('offers both orderings when a separator was found', () => {
    expect(normalizeTitleCandidates('คืนจันทร์ - LOSO 【OFFICIAL MV】LOSO')).toEqual([
      { artist: 'คืนจันทร์', track: 'LOSO' },
      { artist: 'LOSO', track: 'คืนจันทร์' },
    ]);
  });

  it('offers both orderings for a Western title too', () => {
    expect(normalizeTitleCandidates('Oasis - Wonderwall (Official Video)')).toEqual([
      { artist: 'Oasis', track: 'Wonderwall' },
      { artist: 'Wonderwall', track: 'Oasis' },
    ]);
  });

  it('offers a single reading when there is no separator', () => {
    expect(normalizeTitleCandidates('เพลงไม่มีศิลปิน')).toEqual([
      { artist: null, track: 'เพลงไม่มีศิลปิน' },
    ]);
  });

  it('always leads with the same reading normalizeTitle returns', () => {
    const raw = 'Three Man Down - คนไม่จำเป็น | Official MV';
    expect(normalizeTitleCandidates(raw)[0]).toEqual(normalizeTitle(raw));
  });
});
```

Update the import at the top of the file:

```ts
import { normalizeTitle, normalizeTitleCandidates } from '../../src/core/title-normalizer';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: FAIL — `normalizeTitleCandidates` is not exported.

- [ ] **Step 3: Add the function to `src/core/title-normalizer.ts`**

```ts
/**
 * Every plausible reading of a title, best guess first.
 *
 * Thai uploads commonly run `Song - Artist`, the reverse of the Western
 * `Artist - Song`. Which one is right is not decidable from the title alone, so
 * both are offered and the match scorer picks — only one of them will resemble
 * a real record.
 */
export function normalizeTitleCandidates(rawTitle: string): ParsedTitle[] {
  const primary = normalizeTitle(rawTitle);
  if (primary.artist === null) return [primary];
  return [primary, { artist: primary.track, track: primary.artist }];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: all normalizer tests plus the 4 new ones PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 126 tests PASS; typecheck clean; build clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: offer both artist/track orderings for reversed titles"
```

---

### Task 5: Query LRCLIB with Latin tokens and try every reading

The retrieval fix. **LRCLIB's `/api/search` cannot tokenize Thai** — verified
against the live API, `q=ใจสั่งมา` returns 0 results while that exact track sits
in the database with synced lyrics. Sending Thai text in the query wastes it.

Querying the Latin tokens alone (`Loso`) returns the artist's catalogue with Thai
track names intact, and the existing scorer then identifies them at 0.950. That
query is also ordering-independent, so one request serves every reading from
Task 4.

**Files:**
- Create: `src/core/search-query.ts`
- Modify: `src/messaging/types.ts`, `src/background/handle-fetch-lyrics.ts`, `src/content/index.ts`
- Test: `tests/core/search-query.test.ts`, `tests/background/handle-fetch-lyrics.test.ts`

**Interfaces:**
- Consumes: `pickBestScored`, `ScoredCandidate`, `MatchInput` (Task 2); `normalizeTitleCandidates` (Task 4); `LrclibRecord`, `searchLyrics`, `LrclibRateLimitError` (existing).
- Produces:
  - `buildSearchQuery(artist: string | null, track: string): string`
  - `FetchLyricsRequest` gains `alternates?: { artist: string | null; track: string }[]`

- [ ] **Step 1: Write the failing test for the query builder**

Create `tests/core/search-query.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/search-query.test.ts`
Expected: FAIL — cannot resolve `../../src/core/search-query`.

- [ ] **Step 3: Write `src/core/search-query.ts`**

```ts
/**
 * A run of Latin letters or digits, plus punctuation that appears inside names.
 */
const LATIN_RUN = /[A-Za-z0-9][A-Za-z0-9'&.\-]*/g;

/**
 * Builds the query string sent to LRCLIB's search endpoint.
 *
 * That endpoint cannot tokenize Thai: `q=ใจสั่งมา` returns zero results while
 * the track is present in the database with synced lyrics. So when any Latin
 * token exists we query with those alone -- typically the artist name -- which
 * returns the artist's catalogue with Thai track names intact, and the caller
 * matches the Thai locally. With no Latin at all there is nothing better to try
 * than the raw text.
 *
 * Note the result does not depend on which field held the Latin, so both
 * orderings of a title produce the same query and need only one request.
 */
export function buildSearchQuery(artist: string | null, track: string): string {
  const source = `${artist ?? ''} ${track}`;
  const latin = source.match(LATIN_RUN);
  if (latin && latin.length > 0) return latin.join(' ');
  return source.trim().replace(/\s+/g, ' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/search-query.test.ts`
Expected: all eight tests PASS.

- [ ] **Step 5: Add `alternates` to `src/messaging/types.ts`**

Add the field to the existing interface, leaving everything else unchanged:

```ts
export interface FetchLyricsRequest {
  type: 'FETCH_LYRICS';
  videoId: string;
  artist: string | null;
  track: string;
  durationSec: number | null;
  /**
   * Other readings of the same title to try against the candidate set, e.g. the
   * `Song - Artist` ordering common on Thai uploads. All readings share one
   * search request.
   */
  alternates?: { artist: string | null; track: string }[];
}
```

- [ ] **Step 6: Write the failing tests for the handler**

Append to `tests/background/handle-fetch-lyrics.test.ts`:

```ts
describe('handleFetchLyrics with alternate readings', () => {
  const thai: LrclibRecord = {
    id: 500,
    trackName: 'คืนจันทร์',
    artistName: 'Loso',
    albumName: null,
    duration: 240,
    instrumental: false,
    plainLyrics: 'x',
    syncedLyrics: '[00:01.00]x',
  };

  it('searches with the Latin token only, not the Thai text', async () => {
    const queries: string[] = [];
    await handleFetchLyrics(
      { type: 'FETCH_LYRICS', videoId: 'v', artist: 'คืนจันทร์', track: 'LOSO', durationSec: 240 },
      async (q) => {
        queries.push(q);
        return [thai];
      },
    );
    expect(queries).toEqual(['LOSO']);
  });

  it('matches via the swapped reading when the primary one is backwards', async () => {
    const result = await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: 240,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => [thai],
    );
    expect(result).toEqual({ ok: true, record: thai });
  });

  it('issues exactly one search no matter how many readings are offered', async () => {
    let calls = 0;
    await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: 240,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => {
        calls += 1;
        return [thai];
      },
    );
    expect(calls).toBe(1);
  });

  it('reports not-found when no reading clears the gates', async () => {
    const unrelated: LrclibRecord = { ...thai, id: 501, trackName: 'ครึ่งทาง' };
    const result = await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: 'v',
        artist: 'คืนจันทร์',
        track: 'LOSO',
        durationSec: null,
        alternates: [{ artist: 'LOSO', track: 'คืนจันทร์' }],
      },
      async () => [unrelated],
    );
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run tests/background/handle-fetch-lyrics.test.ts`
Expected: FAIL — the query is still built as `artist + track` so the first test
sees `'คืนจันทร์ LOSO'`, and alternates are ignored so the swapped-reading test
returns not-found.

- [ ] **Step 8: Rewrite `src/background/handle-fetch-lyrics.ts`**

```ts
import { LrclibRateLimitError } from '../lrclib/client';
import { pickBestScored, type ScoredCandidate } from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function as an argument so it can be tested without a
 * network, a browser, or any chrome.* global.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
): Promise<FetchLyricsResponse> {
  const readings = [
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  // buildSearchQuery is ordering-independent, so every reading shares one
  // request -- readings differ only in how the results are scored locally.
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

  let best: ScoredCandidate | null = null;
  for (const reading of readings) {
    const scored = pickBestScored(
      { artist: reading.artist, track: reading.track, durationSec: request.durationSec },
      candidates,
    );
    if (scored && (best === null || scored.score > best.score)) best = scored;
  }

  if (!best) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  return { ok: true, record: best.record };
}
```

- [ ] **Step 9: Run the handler tests to verify they pass**

Run: `npx vitest run tests/background/handle-fetch-lyrics.test.ts`
Expected: the 7 original tests plus the 4 new ones PASS.

- [ ] **Step 10: Send the alternate readings from the content script**

In `src/content/index.ts`, change the import:

```ts
import { normalizeTitleCandidates } from '../core/title-normalizer';
```

and replace the request-building block inside `load` with:

```ts
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
```

`normalizeTitleCandidates` always returns at least one reading, so the non-null
assertion on `readings[0]` is safe under `noUncheckedIndexedAccess`.

- [ ] **Step 11: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 138 tests PASS; typecheck clean; build clean.

- [ ] **Step 12: Verify against the live API**

This is the task whose whole purpose is real-world retrieval, so confirm it
against the real service rather than only against fakes:

```bash
curl -s -G "https://lrclib.net/api/search" --data-urlencode "q=Loso" \
  -H "Lrclib-Client: verify/0.1" -o /tmp/loso.json
node --experimental-strip-types -e "
import('./src/core/match-scorer.ts').then(({pickBestScored}) => {
  const c = JSON.parse(require('fs').readFileSync(process.env.TMPDIR ? process.env.TMPDIR + '/loso.json' : '/tmp/loso.json','utf8'));
  for (const want of ['ใจสั่งมา','จักรยานสีแดง','เจ็บใจ','คืนจันทร์']) {
    const s = pickBestScored({artist:'Loso', track:want, durationSec:null}, c);
    console.log(want, '->', s ? s.record.trackName + ' @ ' + s.score.toFixed(3) : 'NO MATCH');
  }
});
"
```

Expected: `ใจสั่งมา`, `จักรยานสีแดง` and `เจ็บใจ` each match themselves at roughly
0.95. **`คืนจันทร์` must report `NO MATCH`** — it is genuinely absent from LRCLIB,
and before Task 2 it wrongly matched `ครึ่งทาง` at 0.561. Paste the actual output
into your report. If `คืนจันทร์` matches anything, Task 2's gate is too low and
that is a finding, not something to adjust away.

If the path handling in that snippet fails on Windows, write the JSON somewhere
explicit and read it from there — the check matters, the plumbing does not.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "fix: query lrclib with latin tokens so thai songs are reachable"
```

---

## Exit criteria

- `npm test` passes (138 tests), `npm run typecheck` clean, `npm run build` clean.
- Clicking through to a new video replaces the lyrics; the previous song's text
  never persists, and no reload is needed to recover.
- Thai songs present in LRCLIB are found — verified live for `ใจสั่งมา`,
  `จักรยานสีแดง`, `เจ็บใจ`.
- Thai songs absent from LRCLIB report "No lyrics found" rather than showing a
  different song's lyrics — verified live for `คืนจันทร์`.
- A re-run of the ten-song manual check, five Thai and five English, recording
  the exact titles of any that still fail.

## Deliberately not in this plan

- **dochord.com as a second lyrics source.** Parked until the hit rate after
  these fixes is known. It is a design change — a source interface, precedence
  rules, per-source capabilities — and its `robots.txt` disallows the search path
  a lookup would need, so it needs its own spec rather than a task here.
- **The panel seam** (`setLines(string[])` discarding `LyricLine` timings) and
  **`teardown()` as a disposer registry.** Both belong to Sprint 3's opening,
  which has to touch that seam regardless.
- **Standalone "Feat"/"Ft." still being consumed** (`The Feat - Anthem`). Known,
  pre-existing, low frequency; recorded in the Sprint 1-2 ledger.
- **Stale or pre-roll-ad duration.** Task 1 improves it by polling until a finite
  duration appears, but closing it fully needs a `loadedmetadata` check, which is
  new scope.
