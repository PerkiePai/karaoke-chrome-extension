# Karaoke Extension UX Improvements — Implementation Plan

**Date:** 2026-11-21
**Status:** PLANNED
**Bead(s):** none (bd unavailable)
**Epic:** Karaoke UX (author + one friend; GitHub-unpacked, not Chrome Web Store)
**Chain:** `standalone-49d19554` seq `1`
**Context:** See `HANDOFF_karaoke-ux_2026-11-21.md` for full codebase evidence, exact
file:line references, scorer constants, scroll-loop internals, test harness patterns, and
prior-art rationale. Direction doc: `docs/ideas/ux-improvements-2026-11-21.md`.

---

## Problem Statement

A working YouTube Karaoke Lyrics extension (v1.0.2) needs UX improvement for an audience
of the author + one friend. A `/brainstorm-deep` session narrowed "better UX" to four
YAGNI-scoped decisions: a trust escape-hatch (clarify the existing "Not this one?"
affordance), a "back to current line" pill when the user scrolls away, light visual
polish, and better control discoverability. The codebase is mature and well-structured
(pure engines + rAF drivers + an imperative `PanelHandle`); this work adds ONE new panel
capability (the pill) plus CSS/label refinements. See Evidence & Data in the handoff.

## Key Findings

- The "Not this one?" escape hatch is **already shown on the happy path** (index.ts:519) —
  the brainstorm's "it's hidden" claim was wrong. → Phase 4 is clarity + one missing
  render path, NOT a new feature.
- The **pill is the only genuinely new logic.** → drives Phases 1-3.
- Synced mode already suspends auto-centering 3s after a manual scroll via the pure,
  tested `isScrollSuspended` (sync-engine.ts) — reuse it. → Phase 2.
- Unsynced mode never re-aligns after a hand scroll; "current" = the video-time target
  from `computeAutoScrollTopPx` (auto-scroll-engine.ts). → Phase 3.
- `mockPanel` in `auto-scroll-loop.test.ts` stubs EVERY `PanelHandle` method; adding
  methods there is mandatory or the suite won't type-check. → Phase 1.
- Trust clarity + discoverability + polish all touch `.kx-controls-row`/CSS → do as one
  pass (Phases 4-5), separate from the pill. → Dependencies.

## Anti-Goals (What NOT To Do)

- **Do NOT build a fullscreen/theater overlay mode.** Biggest hole, but out of scope by
  user choice; high cost-of-reversal. (Handoff "What We Tried / Rejected".)
- **Do NOT touch `match-scorer.ts` or the 0.55 threshold.** Root cause of wrong matches,
  but explicitly out of scope — the team hardens matching at the algorithm layer
  separately.
- **Do NOT add confidence-flagging.** User declined; parked.
- **Do NOT add word-level fill** (LRCLIB is line-level only) or any onboarding flow.
- **Do NOT re-implement the "Not this one?" button** — it exists; only clarify/wire it.

## Plan

### Phase 1: Add the "back to current line" pill to the panel

**Goal:** Give `PanelHandle` a reusable pill both scroll loops can show/hide and respond
to, with no loop logic yet.

**Why this approach:** Both loops need the same UI element and callback; the panel owns
all DOM. A single replaceable callback slot matches the existing `onManualScroll` /
`onScrollPauseToggle` pattern (handoff: Panel section).

- In `panel.ts`, add to the `PanelHandle` interface: `setBackToCurrentVisible(visible:
  boolean): void` and `onBackToCurrent(callback: () => void): void`.
- Add a button to the static skeleton inside `.kx-body-inner`, after the `<ol
  class="kx-lines">`: `<button class="kx-back-to-current kx-hidden">↓ Current line</button>`.
- Wire a single replaceable listener (`let backToCurrentListener: (() => void) | null`),
  a click handler firing it, and implement the two methods (toggle `kx-hidden`; set
  listener) — mirror `showRetry`/`onRetry` exactly.
- In `panel-styles.ts` add `.kx-back-to-current`: absolute, `bottom: 8px; left: 50%;
  transform: translateX(-50%); z-index: 5;` pill styling (rounded, `#272727` bg, small
  font, pointer cursor, subtle border) consistent with existing buttons. `.kx-body-inner`
  is already `position: relative`.
- **In `tests/content/auto-scroll-loop.test.ts`, add `setBackToCurrentVisible: vi.fn()`
  and `onBackToCurrent: vi.fn()` to the `mockPanel` PanelHandle stub** (and the same in
  any other full-PanelHandle mock, e.g. sync-loop.test.ts if present) or typecheck fails.

**Files:** `src/content/panel.ts` (interface + skeleton + impl), `src/content/panel-styles.ts`
(CSS), `tests/content/panel.test.ts` (new tests), `tests/content/auto-scroll-loop.test.ts`
+ `tests/content/sync-loop.test.ts` (mock stubs).
**Validates with:** `npm test -- panel` — new tests pass: pill hidden by default;
`setBackToCurrentVisible(true/false)` toggles `kx-hidden`; `onBackToCurrent` fires on
click. Then `npm run typecheck` clean. Full `npm test` green (regression).
**Rollback:** Revert panel.ts/panel-styles.ts/test changes; no runtime behavior changed
yet, so safe.

### Phase 2: Wire the pill into synced lyrics (sync-loop)

**Goal:** Show the pill while synced auto-centering is suspended; clicking it re-centers
the current line and resumes.

**Why this approach:** The suspension window already exists and is tested; the pill is a
visible handle onto it + a way to resume immediately instead of waiting out the 3s.

- In `sync-loop.ts`, import `isScrollSuspended` from `./sync-engine` (alongside the
  existing imports).
- In `handleManualScroll()`, after `notifyManualScroll(...)`, call
  `panel.setBackToCurrentVisible(true)`.
- In `apply()`, after the tick handling, add:
  `if (!isScrollSuspended(state.lastManualScrollAtMs, Date.now()))
  panel.setBackToCurrentVisible(false);` — hides the pill once the 3s window lapses
  (runs per frame while playing + on seeked).
- Register the click handler:
  `panel.onBackToCurrent(() => { if (state.activeIndex !== null) {
  state.lastManualScrollAtMs = null; panel.setActiveLine(state.activeIndex, true); }
  panel.setBackToCurrentVisible(false); });` — mirrors `centerLine` for the already-active
  index (do NOT reassign `state.activeIndex`).
- In `stop()`, clear it: `panel.onBackToCurrent(() => {})` (matches how `onManualScroll`
  is cleared).
- Edge (document, don't fix): while the video is paused `apply()` doesn't run, so the
  pill won't auto-hide until play resumes — clicking still works (centerLine needs no
  playback).

**Files:** `src/content/sync-loop.ts`. Tests: `tests/content/sync-loop.test.ts`
(add: manual-scroll shows pill; a tick after suspension expiry hides it; onBackToCurrent
re-centers `activeIndex`) if the existing harness supports it; otherwise verify via the
panel tests + manual check and note it.
**Validates with:** `npm test -- sync-loop` green; `npm run typecheck` clean. Manual:
load a synced song, scroll away → pill appears → click → snaps back and resumes.
**Rollback:** Revert sync-loop.ts; Phase 1 pill simply never shows for synced lyrics.

### Phase 3: Wire the pill into unsynced lyrics (auto-scroll-loop)

**Goal:** Show the pill when the unsynced sweep has drifted from the video-time position;
clicking snaps back to it.

**Why this approach:** Unsynced has no suspension model — the sweep sticks at the manual
position. "Current" is the video-time target; compare against it.

- In `auto-scroll-engine.ts`, add pure helper:
  `export function isScrolledAwayPx(currentTopPx: number, targetPx: number, thresholdPx:
  number): boolean { return Math.abs(currentTopPx - targetPx) > thresholdPx; }`
- In `auto-scroll-loop.ts`, add `const BACK_TO_CURRENT_THRESHOLD_PX = 24;` (≈ half a
  line; tune if it flickers).
- In `advance()`, after the manual-scroll rebase block and BEFORE `if (paused) return;`,
  compute the target and toggle the pill:
  `const extentPx = panel.getScrollExtentPx();`
  `const targetPx = computeAutoScrollTopPx(effectiveMs(nowMs), effectiveDurationMs,
  extentPx, speed);`
  `panel.setBackToCurrentVisible(isScrolledAwayPx(posPx, targetPx,
  BACK_TO_CURRENT_THRESHOLD_PX));`
  (reuse the extentPx already read below if you prefer — just don't double-read
  needlessly; keep one `getScrollExtentPx()` call per frame).
- Register: `panel.onBackToCurrent(() => { snapToVideoTime();
  panel.setBackToCurrentVisible(false); });`
- In `stop()`, clear it: `panel.onBackToCurrent(() => {})`.

**Files:** `src/content/auto-scroll-engine.ts` (+ helper),
`src/content/auto-scroll-loop.ts` (wiring), `tests/content/auto-scroll-engine.test.ts`
(helper unit test), `tests/content/auto-scroll-loop.test.ts` (pill shows when forced away
from target; click calls setScrollTop to the video-time position and hides pill).
**Validates with:** `npm test -- auto-scroll` green (incl. the existing sub-pixel
regression test). Manual: load a plain-text (unsynced) song, scroll away → pill → click →
snaps to the video position.
**Rollback:** Revert both files; pill never shows for unsynced lyrics.

### Phase 4: Trust clarity + discoverability (one control-row pass)

**Goal:** Make the correction affordance consistently present and legible, and make
click-to-seek discoverable — without clutter.

**Why this approach:** The button already exists (index.ts:519); the real gap is one
missing render path + legibility. Discoverability shares the same DOM, so one pass.

- In `index.ts` `onCandidatePick` (around 317-366), add `panel!.showCorrectBar(true);`
  after the re-render so a corrected match keeps the escape hatch (belt-and-suspenders;
  today it only persists from the prior load).
- In `panel.ts`/`panel-styles.ts`, improve `.kx-not-this` legibility: keep the text
  "Not this one?" but make it a clearly-tappable control (slightly higher contrast,
  consistent with other control-row buttons) rather than faint underlined grey. Keep
  `margin-left:auto`.
- Make click-to-seek legible: on `.kx-line-clickable`, strengthen the hover affordance
  (existing `cursor:pointer` + hover color) — optionally a subtle leading seek cue on
  hover via CSS `::before`. No persistent caption, no onboarding (user declined).
- Keep all changes CSS + the one index.ts line; do not restructure the control row.

**Files:** `src/content/index.ts` (one line), `src/content/panel-styles.ts` (CSS),
`src/content/panel.ts` (only if a class/markup tweak is needed).
**Validates with:** `npm test -- panel` green; add/confirm a test that `onCandidatePick`
path leaves the correct bar visible if testable at the panel level. Manual: correct a
song → "Not this one?" still visible; hovering a line clearly reads as clickable.
**Rollback:** Revert the index.ts line + CSS; prior behavior restored.

### Phase 5: Light visual polish (CSS only)

**Goal:** Raise perceived quality within the YouTube-native dark look. Scope FIXED to
three items — no sprawl.

**Why this approach:** Pure CSS in one file = low risk, fully reversible, no logic.

- Active-line emphasis/easing: refine the `.kx-line-active` transition / scale contrast so
  the active line reads cleanly without jank (current: white 20px vs grey 15px,
  cubic-bezier). Keep it subtle.
- Line rhythm/spacing: tune `.kx-line` padding/line-height and the `.kx-lines` mask fade
  for even vertical rhythm.
- Control-row legibility: consistent sizing/spacing/contrast across offset/speed/correct
  controls (coordinate with Phase 4).
- Do nothing else — no panel resize, no color-scheme change, no new elements.

**Files:** `src/content/panel-styles.ts` only.
**Validates with:** `npm test` fully green (CSS shouldn't break tests); `npm run build`
succeeds. Manual: side-by-side before/after on a real video; confirm no layout shift and
the collapse/expand accordion still animates.
**Rollback:** Revert panel-styles.ts.

## Dependencies & Order

- **Phase 1 first** — Phases 2 and 3 depend on the pill methods existing.
- **Phases 2 and 3 are parallelizable** after Phase 1 (independent files: sync-loop vs
  auto-scroll-loop/engine).
- **Phases 4 and 5 are parallelizable** with each other but both touch `.kx-controls-row`
  CSS — if run concurrently, reconcile the control-row styles in one of them.
- Phases 4-5 are independent of 1-3 (different surface) and can run anytime.

## Risks & Mitigations

- **Adding PanelHandle methods breaks the full-stub mocks' typecheck** (likely). Mitigate:
  Phase 1 explicitly updates `mockPanel` in auto-scroll-loop.test.ts (and sync-loop.test.ts
  if it has one). Run `npm run typecheck` before moving on.
- **Unsynced pill flicker near the threshold** (possible). Mitigate: 24px threshold ≈ half
  a line; tune up if it flickers during normal sweep (the sweep advances <1px/frame, so
  drift only grows via real hand scrolls — low flicker risk).
- **Loop-wiring tests are heavy (rAF + video mocks)** (medium). Mitigate: the mock pattern
  already exists in auto-scroll-loop.test.ts; if sync-loop wiring is awkward to test,
  cover the pure pieces (`isScrollSuspended`, `isScrolledAwayPx`, panel methods) and
  verify wiring manually — note it honestly, don't fake a test.
- **Polish scope creep** (medium). Mitigate: Anti-Goals + the three fixed items; stop
  there.

## Success Criteria

- **Minimum viable:** Pill works in BOTH synced and unsynced modes (appears on scroll-away,
  click snaps back + resumes); "Not this one?" visible on every render path incl. after a
  correction; `npm test` + `npm run typecheck` + `npm run build` all green.
- **Full success:** Controls read as obviously interactive at a glance; active line and
  spacing feel polished with no layout shift; a fresh user (the friend) can find
  click-to-seek and correction without being told.

## Quick Start

```bash
# Restore full context
cat plans/handoffs/HANDOFF_karaoke-ux_2026-11-21.md

# Key source files for Phase 1
# src/content/panel.ts  src/content/panel-styles.ts
# tests/content/panel.test.ts  tests/content/auto-scroll-loop.test.ts

# Verify starting state (should be green before changing anything)
npm test
npm run typecheck

# First concrete action (Phase 1, TDD):
# In tests/content/panel.test.ts add a failing test:
#   it('hides the back-to-current pill by default', ...)  // expect .kx-back-to-current kx-hidden
# then run it to watch it fail, then implement setBackToCurrentVisible/onBackToCurrent + the element.
npm test -- panel
```
