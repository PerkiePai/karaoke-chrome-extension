# Handoff: Karaoke Extension UX Improvements

**Date:** 2026-11-21
**Status:** PLANNED (brainstorm + plan-research complete; no code written yet)
**Chain:** `standalone-49d19554` seq `1` (parent: none)
**Bead(s):** none (bd unavailable in this environment)
**Branch:** `master`
**Auto:** false

---

## Goal

Improve the user experience of a working YouTube Karaoke Lyrics Chrome extension
(v1.0.2). The user's request was deliberately broad ("make this better user
experience"); a `/brainstorm-deep` session narrowed it to four concrete, YAGNI-scoped
decisions for an audience of **just the author + one friend** (informal GitHub-unpacked
distribution — NOT Chrome Web Store, so no store assets / onboarding / scale-hardening).

The direction is captured in `docs/ideas/ux-improvements-2026-11-21.md`. This handoff
adds the full codebase evidence gathered while preparing the implementation plan, plus a
material correction to one brainstorm claim (see "Gotchas").

The paired plan is `PLAN_karaoke-ux_2026-11-21.md` (same directory).

---

## Where We Are

- Brainstorm complete; four decisions locked (below).
- Codebase fully read for the affected surface (panel, mount/wiring, both scroll loops,
  sync engine, scorer, existing tests).
- `docs/ideas/ux-improvements-2026-11-21.md` written (the only uncommitted change).
- **No implementation started.** Next session executes the plan from Phase 1.

## The Extension (architecture orientation)

Manifest V3. `public/manifest.json`: v1.0.2, `permissions: ["storage"]`,
`host_permissions: ["https://lrclib.net/*"]`, one content script on
`https://www.youtube.com/*` at `document_idle`, a background service worker. **No
`action`/popup, no `options` page** — the panel is the entire UI surface.

Pipeline: content script detects the song from the video title → background queries
LRCLIB → a match-scorer gates candidates → lyrics render in a shadow-DOM panel injected
into YouTube's right sidebar, karaoke-highlighting the active line.

Source layout (all under `src/`):
- `content/index.ts` (613 lines) — orchestration: mount, reconcile on navigation,
  load/render, all panel callback wiring, per-video persistence.
- `content/panel.ts` (533 lines) — `mountPanel()` builds the shadow-DOM panel and
  returns a `PanelHandle` (the full imperative API: setHeader, setLines, setActiveLine,
  offset/speed controls, search/correction UI, collapse, etc.).
- `content/panel-styles.ts` (269 lines) — all CSS as a template string.
- `content/sync-engine.ts` — PURE state machine for synced lyrics (binary-search active
  line + manual-scroll suspension). Fully unit-tested.
- `content/sync-loop.ts` — rAF driver that runs the sync-engine against `<video>`.
- `content/auto-scroll-loop.ts` — rAF driver for UNSYNCED (plain-text) lyrics: a
  continuous time-proportional sweep.
- `content/auto-scroll-engine.ts` — PURE helpers for the sweep math.
- `core/match-scorer.ts`, `core/title-normalizer.ts`, `core/search-query.ts` — the
  matching pipeline documented in `CONTEXT.md`.

Tests: vitest 4.1.10 + jsdom 27. `npm test` = `vitest run`. `npm run typecheck` =
`tsc --noEmit` (TypeScript 7.0.2). Build via vite (`npm run build`). Test files mirror
src under `tests/content/`, `tests/core/`, etc.

---

## Locked Decisions (from the brainstorm)

The user chose these via structured questions. Audience = **author + one friend**, which
sets a low bar: no store polish, no onboarding flows, no scale-robustness.

1. **TRUST — "Always-visible fix button only."**
   Make the "Not this one?" correction affordance consistently present whenever lyrics
   show, and clearer. User explicitly **declined** confidence-flagging (score-based "is
   this right?" warning). See the Gotcha below — this is already ~90% done in code, so
   the real deliverable is clarity + one missing render path, not a new feature.

2. **FEEL (scroll) — "Back to current line" pill.** When the user scrolls the lyric list
   away from the active line, show a small clickable pill to snap back + resume
   auto-centering. Must cover BOTH modes: synced (during the manual-scroll suspension
   window) and unsynced (when the sweep position has diverged from video time). **This is
   the only genuinely new logic in the whole effort.**

3. **FEEL (visuals) — "Light polish, keep YouTube-native look."** Scope FIXED to three
   things to prevent sprawl: active-line emphasis/easing, line rhythm/spacing, control-row
   legibility. No panel resize, no redesign, no word-level fill.

4. **DISCOVERABILITY — "Minimal: clearer labels + always-visible affordances."** Make
   click-line-to-seek, sync-here, and correction legible at a glance. No first-run hint,
   no "?" panel.

## What We Tried / Rejected (anti-goals)

- **Fullscreen/theater overlay mode — REJECTED (out of scope).** The single biggest
  latent hole: the panel mounts only into `ytd-watch-flexy #secondary` (index.ts:29),
  which YouTube hides in theater (`t`) and fullscreen (`f`) — the exact modes you'd sing
  in. Confirmed zero fullscreen/theater handling anywhere in `src/` (only a comment
  mentions the `f` shortcut). User did NOT pick this; defensible for 2 users who watch in
  default view. High cost-of-reversal (needs a whole video-overlay render mode). **Do not
  build it without being asked.**
- **Match-scorer rework — REJECTED (out of scope).** `MATCH_THRESHOLD = 0.55` is the root
  cause of wrong-song matches, but reworking scoring is deeper than a UX ask. Addressed at
  the UX layer (escape hatch) instead.
- **Confidence-flagging — DEFERRED (user declined).** Cheap (the score already exists per
  accepted candidate) and recommended by prior art as the *proactive* trust signal, but
  the user chose the button-only path. Parked as the obvious next step if wrong matches
  still annoy after this work.
- **Word-level karaoke — REJECTED (no data).** LRCLIB is line-level only; no per-word
  timing exists, so progressive line-fill is impossible without a different data source.
- **Onboarding / first-run tooltip — REJECTED (YAGNI for 2 users).**

---

## Evidence & Data (codebase deep-dive)

### Trust / correction affordance — CORRECTED UNDERSTANDING

All `showCorrectBar` call sites (grep-verified):
- `src/content/panel.ts:81` — interface decl.
- `src/content/panel.ts:462` — impl: toggles `.kx-not-this` `kx-hidden`.
- `src/content/index.ts:490` — `showCorrectBar(true)` on `not-found` / `category-gated`.
- `src/content/index.ts:519` — `showCorrectBar(true)` on the **successful load path**
  (right after `setHeader`, after the `if (!response.ok)` early-return at 495).

**Correction to the brainstorm:** my brainstorm "smoking gun" claimed the escape hatch is
hidden on a successful match. **That is wrong** — line 519 already shows it on the happy
path. The button reads "Not this one?" (`.kx-not-this`), tiny grey underlined text in the
control row.

Genuine remaining gaps for the TRUST deliverable:
- `onCandidatePick` (index.ts:317-366) re-renders lines but never calls
  `showCorrectBar(true)` — it only stays visible because the prior load set it. Add a
  belt-and-suspenders call there.
- `network` / `rate-limited` errors (index.ts:494) show Retry but not the correct bar —
  arguably fine (nothing loaded to correct).
- The affordance is visually an afterthought → the real win is legibility (overlaps with
  Discoverability).

### Match scorer constants (`src/core/match-scorer.ts`)
- `MATCH_THRESHOLD = 0.55` — comments admit "nearly any track name clears" it; measured:
  `คืนจันทร์` matched `ครึ่งทาง` at 0.561.
- `MIN_TRACK_SIMILARITY = 0.35`, `MIN_ARTIST_SIMILARITY = 0.3`.
- Weights: `WEIGHT_TRACK = 0.5`, `WEIGHT_ARTIST = 0.3`, `WEIGHT_DURATION = 0.2`.
- `VARIANT_PENALTY = 0.25`, `SYNCED_BONUS = 0.05`, `NEUTRAL = 0.5`.
- `CONTEXT.md` documents a real silent-wrong-song case: query `Nice Meet U` accepted
  `Nice 2 Meet U / Jon Connor` (unrelated Western rapper) at score 0.625.

### Sync engine (`src/content/sync-engine.ts`) — PURE, tested
- `export const SCROLL_SUSPEND_MS = 3000;` — how long auto-scroll stays suspended after a
  manual scroll.
- `SyncEngineState { activeIndex: number | null; lastManualScrollAtMs: number | null }`.
- `findActiveLineIndex(lines, currentTimeMs)` — binary search; blank-text entries never
  become active (walks back to nearest non-blank).
- `isScrollSuspended(lastManualScrollAtMs, nowMs): boolean` — true while
  `nowMs - lastManualScrollAtMs < SCROLL_SUSPEND_MS`. **Reuse this for the synced pill.**
- `tick(state, lines, currentTimeMs, nowMs): SyncTick | null` — returns `{index,
  autoScroll}` or null when index unchanged (caller must not touch panel on null).
- `notifyManualScroll(state, nowMs)` — sets `lastManualScrollAtMs`.

### Sync loop (`src/content/sync-loop.ts`) — synced driver
- `startSyncLoop(video, panel, lines, initialOffsetMs=0): SyncLoopHandle`.
- `apply()` runs each frame while playing AND on `seeked`; calls `tick`, and only
  `panel.setActiveLine(result.index, result.autoScroll)` when tick returns non-null.
- `handleManualScroll()` → `notifyManualScroll(state, Date.now())`. **Pill hook: also show
  the pill here.**
- `handle` returns `{ stop(), setOffsetMs(ms), centerLine(index) }`.
- `centerLine(index)` does: `state.lastManualScrollAtMs = null; state.activeIndex = index;
  panel.setActiveLine(index, true)`. **Pill click should mirror this for the current
  `state.activeIndex` (clear suspension, re-center, hide pill).**
- Imports from sync-engine: `createSyncEngineState, tick, notifyManualScroll` — add
  `isScrollSuspended` for the pill-hide check in `apply()`.

### Auto-scroll loop (`src/content/auto-scroll-loop.ts`) — unsynced driver
- `startAutoScrollLoop(video, panel, durationSec, initialSpeed=1): AutoScrollLoopHandle`.
- Tracks position as a float `posPx` (NOT the rounded DOM scrollTop) — critical: at speed
  1 a frame advances <1px, so reading the rounded DOM back would discard sub-pixel
  progress (there's a regression test for exactly this).
- `EDGE_PAD_SEC = 5` (holds at top/bottom during intro/outro); `MANUAL_SCROLL_EPSILON_PX
  = 1` (threshold to detect a hand scroll vs rounding noise).
- `snapToVideoTime()` resyncs posPx to the video-time position via
  `computeAutoScrollTopPx`. **Pill click (unsynced) should call this + hide pill.**
- `advance()` each frame: rebases posPx to DOM scrollTop if a manual scroll happened, then
  (if not paused) advances. **No suspension model** — the sweep continues from the manual
  position. "Scrolled away" for unsynced = posPx diverged from the video-time target.
- Handle returns `{ stop(), setSpeed(n) }`.

### Auto-scroll engine (`src/content/auto-scroll-engine.ts`) — PURE, tested
- `computeAutoScrollTopPx(currentTimeMs, durationMs, extentPx, speed)` — absolute target
  position for a given video time. **Use this to compute the "where we should be" target
  for the unsynced pill's scrolled-away check.**
- `advanceAutoScrollTopPx(currentTopPx, deltaMs, durationMs, extentPx, speed)`.
- **New helper to add here:** `isScrolledAwayPx(currentTopPx, targetPx, thresholdPx)` —
  one-line `Math.abs(...) > threshold`; gets a unit test.

### Panel (`src/content/panel.ts`, `panel-styles.ts`)
- `mountPanel(container)` builds a shadow root (`:host { all: initial }`), a static
  innerHTML skeleton, and returns the `PanelHandle`. Lyrics set via `textContent`
  (untrusted third-party input — never innerHTML; XSS test exists).
- Control row (`.kx-controls-row`) holds: `.kx-offset` (◀ value ▶ + "Sync here"),
  `.kx-speed` (▼ value ▲ + pause), and `.kx-not-this` ("Not this one?",
  `margin-left:auto`). Offset shows for synced, speed for unsynced.
- Search overlay (`.kx-search-overlay`, absolute, z-index 10) holds the correction search
  form + candidate list.
- `.kx-lines`: fixed `height: 200px`, `padding: 100px 0` (so first/last lines can center),
  mask-image fade top/bottom. Active line: white, 20px, `opacity 1`; inactive: `#a7a7a7`,
  15px, `opacity 0.55`; cubic-bezier transitions.
- `.kx-body-inner` is `position: relative` — the pill will be absolutely positioned here
  (bottom-center), z-index below the search overlay (use ~5).
- Keyboard: a window-capture handler swallows keys from the panel's text inputs so
  YouTube's player shortcuts don't fire (shadow-DOM retargeting workaround) — don't break
  this when touching panel.ts.

### Panel callback wiring (`src/content/index.ts`)
- `activate(videoId)` mounts the panel and registers ALL callbacks (onOffsetNudge,
  onOffsetSet, onTapSync, onLineClick, onSpeedNudge, onCorrectRequest, onSearch,
  onCandidatePick, onRetry, onResetMatch, onCollapseChange). A new `onBackToCurrent` is
  registered by the loops, not here (single replaceable slot, like onManualScroll).
- `load()` fetches + renders; happy path at 498-555 starts either `startSyncLoop`
  (synced, 536) or `startAutoScrollLoop` (unsynced, 549), tracked via `addDisposer`.
- `onLineClick` seeks the video and calls `currentSyncLoop?.centerLine(index)`.
- Per-video state persisted to `chrome.storage.local` under `vm:${videoId}`
  (`{lrclibId, offsetSec, scrollSpeed}`) via `persistVideoMeta`.

### Test harnesses (reuse these patterns verbatim)
- `tests/content/panel.test.ts` (617 lines): jsdom; `container()` makes `#secondary`;
  `shadowOf(host)` reaches the shadow root; `fakeRaf()` captures rAF callbacks; stubs
  `Element.prototype.scrollIntoView`. Existing pattern for every PanelHandle method —
  mirror it for the pill (`setBackToCurrentVisible` / `onBackToCurrent`).
- `tests/content/auto-scroll-loop.test.ts` (307 lines): `mockPanel(extentPx,
  initialScrollTop, roundsToInteger)` returns a FULL PanelHandle stub (every method a
  vi.fn) + `forceScrollTop()` to simulate a hand scroll; `fakeRaf()`; `video()` helper.
  **When adding pill methods to PanelHandle, this mock must gain the two new vi.fn stubs
  or the file won't type-check.**
- `tests/content/auto-scroll-engine.test.ts` — add the `isScrolledAwayPx` unit test here.
- `tests/content/sync-loop.test.ts` (exists, 8.7K) and `tests/content/sync-engine.test.ts`
  (exists) — reuse for the synced pill wiring if practical.

---

## Prior Art (scouted — grounds the decisions)

A subagent scouted karaoke/lyrics browser extensions. Findings that drove the plan:

- **Wrong-song is the #1 uninstall trigger**, worse than showing nothing. A reviewer of
  "YouTube Lyrics by Rob W" (the closest direct analog — also sidebar injection, also
  depends on `Artist - Song` title parsing): *"90% of the time it shows lyrics from a
  completely different song."* → validates the TRUST deliverable, and the user's
  honest-failure instinct.
- **The fix prior art uses for trust is proactively surfacing doubt** (confidence +
  one-tap "wrong song?"), not just providing a search box. We have the search box; the
  user declined the proactive confidence signal → parked.
- **Auto-scroll fighting the reader is the classic "feel" bug.** Fix pattern: pause
  auto-scroll on manual scroll, show a "back to current line" pill, resume after a few
  seconds. → directly drives the pill (Phase 2/3 of the plan). Our synced mode already
  pauses (3s suspension) but has no pill; unsynced never re-aligns.
- **Sync drift fixed by tap-to-sync re-anchoring** — we already have "Sync here".
- **Named prior art:** YouTube Lyrics by Rob W (robwu.nl/lyricshere) — sidebar, wrong-song
  + slowness complaints, "broken for a year" rot; Musixmatch/Spotify — market leader still
  churns users over wrong/unsynced lyrics; auto-lyrics (github tonyzzz321) — good reference
  for honest fallback + multi-provider matching; LyricScroll (Chrome Web Store) — competes
  on speed/auto-scroll; LRCLIB ecosystem (LRCGET, keep-player #35, foo_ui_panels) —
  reference offset/tap-to-sync UX.
- **Solo-dev lyrics extensions die from un-maintained DOM breakage, not missing features**
  — relevant context: don't over-build; keep the surface small and maintainable.

### Non-obvious constraints (scouted)
- **LRCLIB has no published rate limit** but the maintainer added nginx limiting once
  (Jan 2026, issue #85) after a flood; treat ~30 req/min as a safe self-imposed ceiling,
  cache aggressively. **None of the planned UX changes add API calls** — no new exposure,
  just don't regress caching.
- **Manifest V3:** service worker sleeps → no long-lived background timers; highlighting
  is correctly already driven from the content script via rAF.
- **YouTube ToS on DOM injection:** unverified/unknown — flagged, not assumed safe.
- **Accessibility:** karaoke highlight relies partly on color; auto-scroll can be a
  motion issue. The panel deliberately force-animates scroll (overriding reduce-motion)
  because the slide IS the karaoke feel — a known, intentional tension, not a bug to fix.

## Repo history context (git)

Recent commits (`git log`) show the matching pipeline has been actively hardened:
`feat: add ℗ and keyword scoring`, `add Art Track description as song identification
signal`, `revert: remove Odesli integration — API now requires a key`, `fix: resolve 6
pre-existing panel test failures`, `chore: bump to v1.0.2`. Takeaway: the team already
invests heavily in *match correctness* at the algorithm layer — this UX work is
complementary (escape hatch + feel), not a substitute, and should not touch the scorer.

## Key Decisions (this session)

- **Scope the whole effort as incremental, not a redesign.** The codebase is mature and
  well-architected (pure engines + rAF drivers + imperative panel handle); work WITH that
  structure, add a single new PanelHandle capability (the pill) and CSS/label tweaks.
- **The pill is the only real new logic → it carries the tests.** Synced pill reuses the
  existing, tested `isScrollSuspended`; unsynced pill needs one new pure helper
  (`isScrolledAwayPx`) with a unit test. Loop-wiring verified by existing loop tests
  staying green + manual check (rAF/video harness is heavy but the mock pattern exists).
- **Trust work is mostly clarity, not a new feature** (because 519 already shows the
  button) — be honest about this; do not re-implement what exists.
- **Do the control-row changes (trust clarity + discoverability labels + polish) as ONE
  coherent pass** — they share `.kx-controls-row` and would otherwise fight each other's
  layout. The pill is independent (lives over `.kx-lines`).

## Open Questions / Risks

- **Synced pill while paused:** `apply()` doesn't run per-frame while the video is paused,
  so the auto-hide (on suspension expiry) won't fire until play resumes. Acceptable — the
  pill clicking still works paused (centerLine needs no playback). Note in the plan.
- **Unsynced "scrolled away" threshold:** pick a sensible px threshold (~24px ≈ half a
  line) so rounding noise doesn't flicker the pill. Tune during impl.
- **Light polish is subjective** — keep it to the three fixed items; resist bikeshedding.
- **Parked:** fullscreen/theater blindness; scorer threshold 0.55; confidence-flagging.

## Next Action

Start Phase 1 of `PLAN_karaoke-ux_2026-11-21.md`: add the `setBackToCurrentVisible` /
`onBackToCurrent` methods + `.kx-back-to-current` pill element to `panel.ts` /
`panel-styles.ts`, TDD-driven via new tests in `tests/content/panel.test.ts`. Remember to
add the two new vi.fn stubs to the `mockPanel` in `auto-scroll-loop.test.ts` so the suite
type-checks.
