# UX Improvements — 2026-11-21

## Problem / goal
The extension works (v1.0.2) but "the user experience could be better." Audience is
the author + a friend (informal GitHub-unpacked distribution) — so no Chrome Web Store
polish, onboarding flows, or scale-robustness work. Make the day-to-day singing
experience more trustworthy, better-feeling, and more discoverable.

Scouting (prior art: Rob W's YouTube Lyrics, Musixmatch, auto-lyrics, LRCLIB tools)
confirmed the two things that actually make people keep vs. uninstall these tools:
**correct song** and **sync that stays locked** — and that confidently-wrong lyrics is
the #1 uninstall trigger, worse than showing nothing.

## Chosen direction
Incremental polish of the existing (well-architected) panel across four branches —
**not** a redesign and **not** the fullscreen/overlay rework. Do all four as a single
coherent pass over the control row + render path, because they share the same DOM.

Rejected directions (one line each):
- **Reach-first (video-overlay / fullscreen mode):** biggest hole for a karaoke tool
  (lyrics vanish in theater + fullscreen), but out of scope for a 2-person audience who
  watch in default view. High cost-of-reversal — parked as an open risk.
- **Trust-first scorer rework:** the matcher's low `MATCH_THRESHOLD` (0.55) is the root
  cause of wrong matches, but reworking scoring is deeper than the UX ask. Addressed at
  the UX layer (escape hatch) instead of the algorithm layer.

## Locked decisions
Each: the decision — alternative rejected — cost-of-reversal.

1. **Trust: always-visible "Not this one?" on any successful match.**
   Today `showCorrectBar(true)` fires only on not-found (index.ts:490) or after a manual
   correction (519); on a successful auto-match (319) the escape hatch stays hidden — so a
   confident *wrong* match offers the user no way to fix it. Make it visible whenever
   lyrics render (synced or plain-text).
   - Rejected: also flagging low-confidence matches (score-based "is this right?" note).
     Cheap and recommended by prior art, but the author opted for the simpler button-only
     change. **Parked as an optional later add**, not dropped.
   - Cost-of-reversal: trivial (one visibility toggle).

2. **Feel: "back to current line" pill.**
   When the user scrolls away from the active line, show a small clickable pill to snap
   back + resume auto-scroll. Covers synced (active line off-screen during the manual-
   scroll suspension window) and unsynced (sweep offset diverged past a threshold).
   Rejected: silent auto-resume after ~4s (can still feel like a yank). Rejected: leave
   as-is. Cost-of-reversal: low (self-contained UI + visibility logic).

3. **Feel: light visual polish, YouTube-native.**
   Scope fixed to exactly three things to prevent sprawl: active-line emphasis/easing,
   line rhythm/spacing, control-row legibility. No new panel size, no word-level fill
   (LRCLIB is line-level only — no per-word timing exists). Rejected: bigger redesign.
   Cost-of-reversal: trivial (CSS-only, in panel-styles.ts).

4. **Discoverability: minimal — clearer labels + always-visible affordances.**
   Make click-line-to-seek, sync-here, and the correction entry legible at a glance; no
   first-run hint, no "?" panel (YAGNI for 2 desktop users). Rejected: one-time first-run
   tip (needs a storage "seen" flag). Cost-of-reversal: trivial.

## Open risks / holes
- **[parked] Fullscreen/theater blindness.** Panel mounts only into
  `ytd-watch-flexy #secondary`, which YouTube hides in theater (`t`) and fullscreen (`f`)
  — the exact modes you'd sing in. Deliberately out of scope; revisit if real use demands
  it (would mean a video-overlay rendering mode: new positioning, z-index, fullscreen
  event handling).
- **[open] Wrong-match root cause remains.** `MATCH_THRESHOLD = 0.55` is low enough that
  "nearly any track name clears it" (per the scorer's own comments + CONTEXT.md's
  documented "Nice Meet U → unrelated rapper" case). The escape hatch mitigates the
  symptom, not the cause. Confidence-flagging (parked above) would be the next cheap step.
- **[watch] LRCLIB rate limiting.** No published limit, but the maintainer added nginx
  limits once (Jan 2026) after a flood. None of these UX changes add API calls, so no new
  exposure — just don't regress caching.

## Next steps
1. Single pass over `src/content/panel.ts`, `panel-styles.ts`, and `src/content/index.ts`
   (plus the two scroll loops) implementing branches 1–4 together.
2. The pill's visibility logic (the only non-trivial new branch) gets a small vitest.
3. Everything else is behavior/CSS changes the existing render tests should still cover.
