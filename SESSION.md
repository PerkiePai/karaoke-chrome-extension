# Session state — YouTube Karaoke Lyrics extension

Last updated: 2026-08-15

## What this is

A Manifest V3 browser extension that shows lyrics beside YouTube music videos.
Runs unpacked in **Opera GX** (Chromium). Lyrics come from **LRCLIB**
(`https://lrclib.net/api`) — free, no auth, no API key.

Long-term goal is guitar chords alongside the lyrics. The line model already
reserves a `chords?` field; no chord code exists yet.

## Where things stand

**Sprints 1–2 are complete, reviewed, and committed.** 101 tests pass, typecheck
and build are clean. The extension loads in Opera GX, reaches LRCLIB from its
service worker, mounts a panel in YouTube's `#secondary` column, identifies the
song, and renders lyrics as static text.

**Sprint 2.5 is planned but NOT implemented.** It fixes five defects found by
real-world testing. That plan is the next thing to execute.

| Sprint | Status |
|---|---|
| 1 — loads, panel mounts, SPA lifecycle | done, browser-verified |
| 2 — song detection, lyrics rendered (static) | done, browser-verified |
| **2.5 — matching + staleness fixes** | **planned, not started** |
| 3 — rAF sync engine, scrolling karaoke | not started |
| 4 — offset nudge, manual search, caching | not started |
| 5 — category gate, error states, polish | not started |

## Documents

- Spec: `docs/superpowers/specs/2026-08-15-youtube-karaoke-lyrics-design.md`
  — **read the two "Correction (2026-08-15)" sections**; they overturn claims in
  the original feasibility table.
- Sprint 1–2 plan: `docs/superpowers/plans/2026-08-15-karaoke-lyrics-sprints-1-2.md`
- **Sprint 2.5 plan (execute this next):**
  `docs/superpowers/plans/2026-08-15-karaoke-sprint-2-5-matching-fixes.md`
- Sprint 1–2 execution ledger, with every ruling made:
  `.superpowers/sdd/2026-08-15-karaoke-lyrics-sprints-1-2/progress.md` (gitignored)

## The two bugs Sprint 2.5 fixes

**1. Stale lyrics after navigation.** Click a suggested video and the previous
song's lyrics stay, permanently, until F5. Cause: `detectSong` guards on
`ytd-watch-flexy[video-id]` but reads the `<h1>` — different elements, different
update timings, so the guard passes while the heading is stale. And
`onLocationChanged` returns early when the videoId is unchanged, so the
`yt-navigate-finish` that arrives after the heading updates does nothing. One bad
read is final. Fix: remember the title acted on; re-run when it changes.

**2. Thai songs not found (4 of 5 failed).** Cause is NOT coverage.
**LRCLIB's `/api/search` cannot tokenize Thai.** Verified: `q=ใจสั่งมา` returns
0 results while that track is in the database with synced lyrics. `/api/get` is
no help — strict exact match, needs album and duration, 404s for tracks that
exist.

Working strategy, validated live: **query with Latin tokens only, match Thai
locally.** `q=Loso` returns the catalogue with Thai track names intact, and the
existing NFC + Levenshtein scorer identifies them at 0.950.

Two further findings folded into the same plan:
- Thai titles often run `Song - Artist`, reversed (`คืนจันทร์ - LOSO`).
- **The 0.55 threshold is too loose without a duration.** A matching artist plus
  `durationSec: null` puts the floor at 0.45, so almost any track name clears it.
  Measured: a song genuinely absent matched an unrelated same-artist track at
  0.561. **Task 2 must land before Task 5** — otherwise fixing retrieval turns a
  visible "not found" into silently wrong lyrics.

## Environment gotchas

- **Node is v22.11.0.** `require(esm)` became unflagged in 22.12.0, and jsdom 27
  needs it, so `npm test` carries `NODE_OPTIONS=--experimental-require-module`
  via `cross-env`. Do not remove it. Upgrading Node past 22.12 would let it go.
- **Do not run `npx vitest` directly** — it bypasses that flag and two jsdom test
  files fail to load, silently reporting 78 tests instead of 101. Always
  `npm test`.
- Build is two IIFE Vite passes (`TARGET=content`, then `TARGET=background`).
  Output goes to `dist/`, which is what you load unpacked.
- `tests/build.test.ts` asserts the content bundle contains no ES module syntax —
  MV3 content scripts are classic scripts and a stray `import` breaks injection
  silently.
- Reload the extension at `opera://extensions` after every build, or you are
  testing the old bundle.

## Hard-won lessons

**Five of the six real defects were in string-matching code, all written by me,
all surviving careful reading.** The pattern each time: the regex matched more
than intended and produced a *plausible wrong answer* rather than an error.

- `ft` matched inside "Swift" → "Taylor Swi"
- bare `HD`/`4K` stripped mid-title → "HD Radio" lost its "HD"
- `live` matched inside "Deliver" → variant penalty silently never fired
- greedy `[^)\]]*` ate past its bracket → "Palmy ft. Guest - Song" became "Palmy"
- standalone "Feat"/"Ft." still eaten (known, parked, low frequency)

**Rule going forward: execute patterns with `node -e` against concrete strings.
Do not accept one by reading it.** Reading is what produced all of them.

Related: the whole-branch review caught bugs nine per-task reviews could not,
because each task was only judged against its own brief. Cross-cutting failures
(an instrumental record outranking the vocal one, then reporting "instrumental"
for a song whose lyrics were in the same candidate array) only show up when
someone traces a request end to end.

## Known debt, deliberately deferred

- **Panel seam**: `PanelHandle.setLines(string[])` throws away the `timeMs`
  values `parseLrc` produces, and there is no `setActiveLine`. Sprint 3's sync
  engine needs both — it opens with this refactor.
- **`teardown()` is not a disposer registry**, and the module-scope
  `setInterval` is never cleared. Harmless now; the wrong pattern to hang an rAF
  loop off. Convert before Sprint 3, not during.
- **Stale / pre-roll-ad duration** can still be read: the id check gates on
  `ytd-watch-flexy`, which flips before the reused `<video>` reloads. Closing it
  needs a `loadedmetadata` check.
- `hasUsableLyrics` tests `instrumental === true` before checking lyric fields,
  so a record flagged instrumental that carries lyrics is dropped.
- Minor: leftmost-separator splitting means `AC | DC - Song` yields artist "AC".
- **UNVERIFIED**: whether YouTube *replaces* `#secondary` on navigation or
  re-renders its children. If it replaces it, the panel could vanish with no
  remount path. Invisible to every test — needs a human check.

## Open question: dochord.com

The user asked about fetching from `https://www.dochord.com` (Thai lyrics +
chords) as a second source. **Parked until the hit rate after Sprint 2.5 is
known**, because three of the four Thai failures may be reachable once the query
strategy is fixed — `คืนจันทร์` looks genuinely absent from LRCLIB.

If pursued, note:
- `robots.txt` allows content pages but **disallows `/?s=`, their search** — the
  exact path a lookup needs. A sitemap is published, so a robots-compliant route
  exists (build a title→URL index from the sitemap, fetch only song pages).
- Cloudflare sits in front; programmatic fetches may be challenged.
- **No timings** — it cannot drive karaoke scrolling, only static text.
- It *does* have chords, so it is more interesting as the eventual chord source
  than as a lyrics fallback.
- Personal use in the user's own browser is defensible; redistributing the
  content in a published extension is not. Keep it personal-use.
- Adding it is a design change (source interface, precedence, per-source
  capabilities) and needs its own spec, not a task bolted onto an existing plan.

## Next actions

1. Execute `docs/superpowers/plans/2026-08-15-karaoke-sprint-2-5-matching-fixes.md`
   — 5 tasks, TDD, subagent-driven. Task 2 before Task 5, non-negotiable.
2. Rebuild, reload in Opera GX, re-run the ten-song check (5 Thai, 5 English).
   **Record the exact titles that still fail** — real failing titles are worth
   more than any invented fixture.
3. Decide on dochord based on that hit rate.
4. Then Sprint 3, opening with the panel-seam and teardown refactors above.
