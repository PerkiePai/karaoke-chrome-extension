# Session state — YouTube Karaoke Lyrics extension

Last updated: 2026-08-16

## What this is

A Manifest V3 browser extension that shows lyrics beside YouTube music videos.
Runs unpacked in **Opera GX** (Chromium). Lyrics come from **LRCLIB**
(`https://lrclib.net/api`) — free, no auth, no API key.

Long-term goal is guitar chords alongside the lyrics. The line model already
reserves a `chords?` field; no chord code exists yet.

## Where things stand

**Sprints 1–2.5 are complete, reviewed, and committed.** 157 tests pass,
typecheck and build are clean. The extension loads in Opera GX, reaches
LRCLIB from its service worker, mounts a panel in YouTube's `#secondary`
column, identifies the song, re-detects it when YouTube swaps the title in
late, and renders lyrics as static text — including Thai titles, via a
Latin-token query strategy.

| Sprint | Status |
|---|---|
| 1 — loads, panel mounts, SPA lifecycle | done, browser-verified |
| 2 — song detection, lyrics rendered (static) | done, browser-verified |
| 2.5 — matching + staleness fixes | **done, NOT yet browser-verified** |
| 3 — rAF sync engine, scrolling karaoke | not started |
| 4 — offset nudge, manual search, caching | not started |
| 5 — category gate, error states, polish | not started |

## Documents

- Spec: `docs/superpowers/specs/2026-08-15-youtube-karaoke-lyrics-design.md`
  — read the two "Correction (2026-08-15)" sections; they overturn claims in
  the original feasibility table.
- Sprint 1–2 plan: `docs/superpowers/plans/2026-08-15-karaoke-lyrics-sprints-1-2.md`
- Sprint 2.5 plan (executed): `docs/superpowers/plans/2026-08-15-karaoke-sprint-2-5-matching-fixes.md`
- Sprint 1–2 execution ledger: `.superpowers/sdd/2026-08-15-karaoke-lyrics-sprints-1-2/progress.md` (gitignored)
- Sprint 2.5's execution ledger was deleted after its final review went clean
  (per the subagent-driven-development skill's Finish step) — the git history
  below is the record now.

## Sprint 2.5 — what shipped and why it took two review passes

Five tasks, each individually reviewed clean, then a **whole-branch review
found the five tasks composed to reintroduce the exact silent-wrong-match bug
the sprint existed to eliminate** — on `คืนจันทร์`, the song literally named in
the plan's own exit criteria. This is the load-bearing lesson from this
sprint: task-scoped review cannot see cross-task interaction. Only a review
of the whole diff, driven end-to-end through the real code path (not a
hand-picked reading in isolation), caught it.

**Sprint commits** (base `0b21ef0`):
- `5c40994` — self-correcting navigation (remembers the title acted on;
  re-runs when YouTube swaps it in late instead of trusting one DOM read)
- `b9c4337` — `MIN_TRACK_SIMILARITY` gate (a candidate's track name must
  resemble the wanted one, independent of the weighted score)
- `7bb0ac4` — collapse a channel name repeated across bracketed noise
  (`LOSO 【OFFICIAL MV】LOSO` → `LOSO`)
- `e058f29` — offer both artist/track orderings (Thai titles often run
  `Song - Artist`, reversed from the Western convention)
- `dad17b4` — query LRCLIB with Latin tokens only (its search cannot
  tokenize Thai) and score every reading against one result set

**Fix-wave commits**, from the whole-branch review's findings (base `dad17b4`):
- `43434fd` — `MIN_ARTIST_SIMILARITY` gate, symmetric to the track gate. The
  bracket-collapse fix above turns `LOSO 【…】LOSO` into bare track `LOSO`,
  which scores `trackSimilarity=1.000` against ANY self-titled LRCLIB record
  (artist name == track name — common in real catalogues). The track gate
  alone didn't catch this because the *artist* axis was the one that failed;
  there was no floor on it. Now there is.
- `857200b` — the bracket-collapse regex now hands the separating bracket
  back instead of consuming it, so the noise-strippers below (already scoped
  to preserve `live`/`acoustic`/`cover`/`remix`) get to decide its fate.
  Fixes `Coldplay - Yellow (Live) Yellow` silently losing `(Live)`.
- `d986e9c` — a lone variant word or bare digit can no longer become the
  *entire* search query (was: `q=Live` returning 20 unrelated tracks by a
  band named Live). Gates the whole extracted-token list rather than
  filtering individual tokens, deliberately — literal per-token filtering
  broke a shipped Task 5 case (`Rock 'n' Roll Train 2`, where `2` is a real
  discriminator once real tokens sit beside it, not noise).

**One parked Minor**, not fixed: an artist literally named `Live`/`Cover`/
`Remix`/`Acoustic`/`Instrumental` (such acts exist in LRCLIB's catalogue),
paired with a Thai-only track title, now falls back to a guaranteed-empty
query instead of the correct one — recall-only, never a wrong match, narrow
enough to defer. Fix if it's ever hit: scope `isNonIdentifying` to the
track-field tokens only, not the whole extracted list.

## Environment gotchas

- **Node is v22.11.0.** `require(esm)` became unflagged in 22.12.0, and jsdom 27
  needs it, so `npm test` carries `NODE_OPTIONS=--experimental-require-module`
  via `cross-env`. Do not remove it. Upgrading Node past 22.12 would let it go.
- **Do not run `npx vitest` directly** — it bypasses that flag and jsdom test
  files can fail to load silently, under-reporting the test count. Always
  `npm test`.
- Build is two IIFE Vite passes (`TARGET=content`, then `TARGET=background`).
  Output goes to `dist/`, which is what you load unpacked.
- `tests/build.test.ts` asserts the content bundle contains no ES module syntax —
  MV3 content scripts are classic scripts and a stray `import` breaks injection
  silently.
- Reload the extension at `opera://extensions` after every build, or you are
  testing the old bundle.

## Hard-won lessons

**Every real defect found in this codebase so far, across two sprints, has
been string-matching code that matched more than intended and produced a
plausible wrong answer rather than an error.** Task-level review reading the
code carefully did not catch these; only executing the pattern against
concrete strings did, and — new in Sprint 2.5 — only a whole-branch review
driven through the real end-to-end code path caught the composition bug that
five individually-correct, individually-tested tasks produced together.

**Rule going forward: execute patterns with `node -e` (or equivalent) against
concrete strings. Do not accept one by reading it.** And: a plan's own
acceptance-check step is not trustworthy by construction — Sprint 2.5's Task
5 Step 12 called `pickBestScored` on a hand-picked reading in isolation,
never through the real `handleFetchLyrics`, and never the *primary* reading
the content script actually sends first. It reported `NO MATCH` and looked
like a pass while being structurally incapable of catching the bug that
existed. Verification steps must exercise the real call path, not a
convenient stand-in for it.

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
- **Sprint 2.5 additions**: the `reload` path (Task 1) leaves the previous
  song's lyrics visible for up to 10s while a reload fetch runs — a
  time-boxed version of the bug Task 1 exists to fix, not a permanent one. A
  failed `activate()` (e.g. `#secondary` never appears) has no retry path.
  `pickBestMatch` is now unused outside its own test file (superseded by
  `pickBestScored`, still a tested public function). Scores can exceed 1.0
  (cosmetic). The `isNonIdentifying` artist-name-collision edge case above.

## Open question: dochord.com

The user asked about fetching from `https://www.dochord.com` (Thai lyrics +
chords) as a second source. **Parked until the hit rate after Sprint 2.5 is
known via the manual browser check below** — three of the four originally-Thai
failures may now be reachable given the query-strategy fix; `คืนจันทร์` looks
genuinely absent from LRCLIB regardless.

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

1. **Rebuild and reload in Opera GX, then re-run the ten-song check (5 Thai,
   5 English) against the real browser.** This is Sprint 2.5's one exit
   criterion that no automated agent can perform — everything else (the
   matching logic, the live-LRCLIB retrieval behavior, the navigation
   self-correction unit tests) has been verified, but nobody has clicked
   through real YouTube videos with this code loaded yet. Record the exact
   titles of any that still fail — real failing titles are worth more than
   any invented fixture.
2. Decide on dochord based on that hit rate.
3. Then Sprint 3, opening with the panel-seam and teardown refactors above.
