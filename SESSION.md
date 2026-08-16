# Session state — YouTube Karaoke Lyrics extension

Last updated: 2026-08-16 (session 5)

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
| 2.5 — matching + staleness fixes | done, browser-verified |
| 3 — rAF sync engine, scrolling karaoke | done, browser-verified |
| 4 — offset nudge, manual search, caching | done, browser-verified |
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

## Lyrics API research (session 2)

Playlist is ~70% Thai, ~30% English. Researched in this session.

| Source | Thai lyrics | Synced LRC | Notes |
|---|---|---|---|
| **lrclib.net** | Partial | ✅ Yes | Free, no key, no rate limit; `lrclib-api` npm package |
| **Musixmatch (unofficial)** | ✅ Good | ✅ Yes | `musicxmatch-api` / `Strvm/musicxmatch-api` on GitHub |
| **dochord.com** | ✅ Full | ❌ Plain only | Scrape in extension context (bypasses 403); no API |
| Genius | Some | ❌ Plain only | Free API; unsynced only |

**Recommended strategy:**
1. Primary: lrclib.net (zero friction, LRC output, TypeScript-native)
2. Fallback for Thai gaps: Musixmatch unofficial wrapper
3. dochord as chord source eventually — not as a sync source

## Open question: dochord.com

Investigated in session 2. Summary of findings:

- URL pattern: `https://www.dochord.com/{numeric_id}/` for songs, `/artist/{slug}/` for artist pages
- Confirmed coverage: PHUMIN `นายหญิง` → `/368717/`; Tattoo Colour → `/artist/tattoo-colour/`; likely most Thai playlist artists
- Returns 403 to server-side fetchers (Cloudflare) but **Chrome extension fetch works** (real browser session)
- No official API, no LRC/timestamps — chords + plain text lyrics only
- **No timings** — cannot drive karaoke scrolling, only static text display
- It *does* have chords, so it is more interesting as the eventual chord source (long-term goal) than as a lyrics fallback
- Adding it is a design change (source interface, precedence, per-source capabilities) — needs its own spec

**Parked** — pursue after confirming lrclib + Musixmatch hit rate against real playlist.

## Sprint 3 — what shipped

Five commits on top of Sprint 2.5 (base `dad17b4` → fix-wave → `0a97e95`):

- `0cf999e` — pure sync engine (`findActiveLineIndex` binary search, `tick`, `notifyManualScroll`, 4 s scroll suspension)
- `bcdc61e` — sync loop wires `video` events to engine via rAF; paused = zero CPU; `seeked` fires one immediate apply
- `ec8d979` — sync loop integrated into content script lifecycle via disposer registry
- `a557081` — fix: stop leaked sync loop when same-video reload comes back not-ok
- `0a97e95` — fix: initial highlight on paused load; empty-list padding regression

### How timestamp sync works (from session 2 review)
1. **`parseLrc()`** (`src/core/lrc-parser.ts`) — parses `[mm:ss.xx] text` → `LyricLine[]` sorted by `timeMs`
2. **`findActiveLineIndex()`** (`src/content/sync-engine.ts:22`) — binary search: last line where `timeMs ≤ currentTimeMs`
3. **`startSyncLoop()`** (`src/content/sync-loop.ts`) — playing → rAF chain; paused → cancelled; `seeked` → one apply; only calls `setActiveLine` when index changes
4. Scroll suspension: `autoScroll` suppressed 4 s after manual scroll (`SCROLL_SUSPEND_MS = 4000`)

**The extension does not generate timestamps.** It relies entirely on pre-timed LRC from lrclib.net. Plain-text sources (dochord, Genius) give static display only.

## Session 3 — fixes applied during browser verification

Five bugs found and fixed during 2.5/3 verification:

- **All 5 Thai songs returning no lyrics** — root causes: bare digits from channel names
  (e.g. "Phumin อัลบั้ม 2") poisoning queries; 20-result cap on prolific artists;
  "Session" not in VARIANT_WORDS. Fix: rewrote `buildSearchQuery` to include Thai text
  from predominantly-Thai fields, always filter non-identifying Latin (digits + variant
  words), added `'session'` to VARIANT_WORDS. All 5 Thai songs now find lyrics.
- **"Love To Death - English" returning no lyrics** — YouTube title was
  "Mother Mother - Love To Death - English"; the "- English" suffix included in
  the track name broke the lrclib query. Fix: added a BARE_NOISE pattern in
  `title-normalizer.ts` that strips trailing single-word language qualifiers
  (english/thai/japanese/…) after a separator.
- **Panel disconnects on first video** — attempted fix (detect host element
  removed from DOM, reset state). Did NOT resolve the issue. Parked as known debt.
  Root cause unknown; likely YouTube's initial render replacing `#secondary` before
  the panel mounts, or `yt-navigate-finish` not firing for the very first navigation.

194 tests pass after this session's work (was 192 before).


## Sprint 4 — what shipped

229 tests, typecheck and build clean. 6 commits on top of Sprint 3 (base `0a97e95`):

- `e2f1072` + `df5c404` — `src/background/storage.ts`: `StorageLike` interface, `VideoMeta`, read/write helpers for per-video meta and LRC lyrics cache with LRU eviction (max 50 entries, `lc:order` key). Critical fix: `lc:order` read uses `Array.isArray` guard, not a blind cast.
- `20be09c` — `handle-fetch-lyrics`: cache-hit path (VideoMeta → lyrics cache → return with stored offset); miss path writes both caches; offset preserved across same-video reloads.
- `bc14859` — `handle-search-candidates`: passes query verbatim to search, filters `hasUsableLyrics`, caps at 10 results.
- `50279c6` — panel: offset controls UI (◀/▶ nudge buttons, formatted `±N.NNs` display), "Not this one?" correct-bar, search form, candidate list. Sync loop gains `setOffsetMs()`.
- `600a6e9` — panel styles: `.kx-hidden`, offset/search/candidate CSS.
- Content script (`src/content/index.ts`) integrated all four features:
  - Offset nudge: `onOffsetNudge` clamped ±30s, writes `vm:${videoId}` directly to `chrome.storage.local`, updates sync loop immediately.
  - Manual search: `onCorrectRequest` pre-fills from `currentRecord`; `onSearch` sends `SEARCH_CANDIDATES` with double-submit guard; `onCandidatePick` replaces lyrics, resets offset, writes `vm:${videoId}` synchronously (race-free — background no longer writes VideoMeta on PICK_CANDIDATE).
  - Stored offset only applied on session-first load (`if (currentLrclibId === null)`), not on title-triggered reloads.
  - "Not this one?" bar now shown in the `!response.ok` branch too, so users who get "No lyrics found" can still trigger manual search.

### Key design decision: PICK_CANDIDATE race fix

Background originally wrote `writeVideoMeta({offsetSec: 0})` ~50-200ms after pick. If the user nudged in that window, the background write would overwrite their nudge. Fix: background PICK_CANDIDATE only caches lyrics; content script writes VideoMeta synchronously at pick time before any await, so any subsequent nudge write always races against a newer timestamp and wins (last-write-wins, same `chrome.storage.local` key).

## Session 5 — cache correctness fixes

Four bugs diagnosed and fixed via console logging in Opera GX.

### 1. Search UI disabled

All `showCorrectBar(true)` calls removed from the content script. The "Not this one?" button, search form, and candidate list are permanently hidden. Code is intact for future re-enable. Reason: the search feature had multiple edge-case bugs (stale panel contamination, missing `exitSearchMode` on crash) that were not worth fixing before core caching worked.

### 2. Cache hit validation (`handle-fetch-lyrics.ts`)

Cache-hit path previously returned the stored lrclibId unconditionally. If a previous wrong match had been written, it was served forever. Fix: re-score the cached record against the current request's readings using `scoreCandidates`. If none pass `MATCH_THRESHOLD` + `MIN_TRACK_SIMILARITY` + `MIN_ARTIST_SIMILARITY`, fall through to a fresh search. The fresh search uses an improved `offsetSec` rule: preserve the stored offset only when the fresh search returns the SAME lrclibId (cache eviction case); reset to 0 when a different lrclibId is found (stale match case).

### 3. `writeVideoMeta` moved to content script

`handleFetchLyrics` in the background was writing `vm:${videoId}` after every search. Console logs revealed two concurrent `FETCH_LYRICS` messages for the same videoId arriving at the background before either had written storage — the slower one would overwrite with its result even though the content script had already discarded that response via the generation check. Fix: removed `writeVideoMeta` from `handleFetchLyrics`; the content script now writes `vm:${videoId}` inside `load()` **after** the generation check passes. Background still writes `lc:${lrclibId}` (the lyrics record itself), which is idempotent and safe.

### 4. Stale title in `waitForSong` (root cause of cache corruption)

Console logs showed every navigation writing the PREVIOUS video's title under the NEW video's ID — e.g. `vm:AllFallsDown_vid → lrclibId of "More Than You Know"`. Root cause: YouTube updates the `<video>` element (duration) before updating the page heading. `waitForSong` returned immediately when `durationSec !== null`, which could mean new duration + stale title. Fix: require `rawTitle` to be identical across two consecutive polls (200ms apart) before returning. Adds ≤200ms per navigation; guarantees no stale title is committed.

### Debug logging added

Both the service worker and content script now emit `[karaoke]`-prefixed logs (cache HIT/REJECTED/MISS with videoId and score; `vm:write` with videoId, lrclibId, gen, and currentVideoId) to make future regressions diagnosable without a debugger.

### Test changes

- `handleFetchLyrics — cache behavior`: "writes video meta and lyrics cache" updated to assert that VideoMeta is now **absent** after the background call (responsibility moved to content script). "Returns from cache on repeat visit" updated to manually write VideoMeta between calls, simulating what the content script would do. New test: "rejects a stale cache entry and re-searches when the record no longer matches".

## Known debt (accumulated)

- **"First open" bug**: on the very first video after opening YouTube, the lyrics panel sometimes does not appear. The DOM-disconnection fix in `reconcile()` did not resolve it. Workaround: navigate to any other video and back, or reload the tab.
- Panel seam, teardown pattern, stale duration — see Sprint 2.5 debt section above.
- `pickBestMatch` unused outside tests.
- Scores can exceed 1.0 (cosmetic).
- Artist named `Live`/`Cover`/etc. with Thai-only track → empty query (narrow recall miss).
- Minor: leftmost-separator splitting means `AC | DC - Song` yields artist "AC".

## Next actions

1. **Sprint 5** — category gate, error states, polish.
2. Decide on Musixmatch fallback based on Thai hit rate.
3. Decide on dochord based on hit rate (chord source, not lyrics sync).
4. **music.youtube.com DOM extractor** — add a host-specific extractor for `music.youtube.com` that reads the already-separated artist and track fields directly from the DOM, avoiding raw-title parsing heuristics entirely.
5. Close the remaining double-call race: a `reload` can fire in the 200ms window between `mountPanel` returning and `load()` setting `isLoading = true`, sending two `FETCH_LYRICS` messages for the same videoId. Benign with current fixes (both find same result) but wastes a network round-trip.
