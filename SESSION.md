# Session state — YouTube Karaoke Lyrics extension

Last updated: 2026-08-16 (session 9)

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
| 5 — dual sync mode, tap-to-sync, detection signals | done, browser-verified (session 9) |

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

## Session 7 — panel window/overflow fix, static-lyric styling; feature ideas parked for Sprint 5 planning

Treated as small, contained bug fixes (not sprint-planned): shipped directly on top of session 6's uncommitted `waitForSecondary` fix.

### What shipped

- **Lyric window is now a fixed ~5-line height, not a 60vh mask.** `.kx-lines` (`panel-styles.ts`) changed from unconstrained-growth-plus-mask to `height: 200px` (`flex: none` so the flex column can't stretch it), with `padding: 100px 0` (half its height) replacing the old `30vh 0` so the first/last lines can still scroll to the vertical center. `:empty` now also zeroes `height`, not just `padding`, so the loading/error states don't leave a blank 200px box.
- **Overflow bug fixed**: `.kx-panel` had `max-height: 60vh` but no `overflow` set (default `visible`), and `.kx-lines` was a flex child with no fixed height — a classic flexbox bug where the child won't shrink below its content size, so content (offset buttons, lyric lines) could render past the panel's rounded border instead of being clipped. Fix: `.kx-lines` now has an explicit height (above), and `.kx-panel` got `overflow: hidden` as a belt-and-braces clip.
- **Unsynced (no-timestamp) lyrics now render in the same bold/white style as an active synced line**, instead of sitting permanently dimmed with no highlight (the sync loop never runs for `plan.synced === false`, so `setActiveLine` was never called and every line stayed at the default dim style). `PanelHandle.setLines()` gained an optional second param, `synced = true`; `panel.ts` applies `kx-line-active` to every `<li>` up front when `synced === false`. Both call sites in `content/index.ts` (`load()` and `onCandidatePick`) now pass `plan.synced` through.

232 tests pass (2 new, in `tests/content/panel.test.ts`), typecheck and build clean. **Not yet browser-verified** — reload at `opera://extensions` to check the new window size/centering and the static-lyric styling for real.

### Feature ideas discussed, deliberately NOT implemented — plan for Sprint 5

- **Dual sync modes**: auto-sync (current, timestamp-driven) by default; a second auto-scroll mode with adjustable speed for lyrics with no timestamps (currently `plan.synced === false` just renders static text, no scrolling at all — `sync-loop.ts` is 100% timestamp-driven, no fallback path exists).
- **Tap-to-sync offset**: replace/augment the ◀▶ 0.25s-step nudge (clamped ±30s) with a "sync here" button — user clicks it when vocals start, extension reads `video.currentTime` at that instant and computes `offset = clickTimeMs - firstLyricLine.timeMs`. Motivating case: some MVs have a cold-open/intro >20s before the song starts, making the fixed-step nudge impractical (dozens of clicks). Keep the ◀▶ buttons for fine-tuning after the tap.
- **Rate adjustment (0.95x/1.05x) — explicitly parked, not recommended yet**: would turn the offset from a constant additive shift into a linear time-warp (`adjustedTime = (t - anchor) * rate + anchorLine`), needing a second persisted value per video. Only implement if a real song is found where a single constant offset doesn't hold across the whole track (expected drift cause is edit-length mismatch, not tempo mismatch — tap-to-sync alone should cover the common case).

## Session 8 — feature idea discussed: channel name + YouTube "Music" attribution box as additional signals

User asked why detection doesn't use the channel name as artist, or the licensed-music attribution info YouTube shows for some videos (the "Music in this video" panel / auto-generated `Provided to YouTube by … \n\nTitle · Artist \nAlbum …` description). Not implemented yet — discussed only. Two separate ideas with different risk profiles:

- **Channel name as artist**: reliable for official artist/VEVO channels, but wrong for karaoke channels, compilation channels ("NoCopyrightSounds", "1theK"), label channels, and cover channels — anywhere the channel isn't the performer. Recommendation: use it as a **fallback only**, when `normalizeTitle` returns `artist: null` (no separator found in the title) — today that case just sends the bare track to search. Small, low-risk addition to `title-normalizer.ts` / `content/index.ts`.
- **YouTube "Music" attribution box**: when present, this is authoritative label metadata (same data Content ID uses), not a guess — worth treating as a high-confidence override that skips scoring entirely.

Suggested order: channel-name fallback first, then the Music panel as a second detection signal. Related to the already-parked **music.youtube.com DOM extractor** idea in Next actions #4 — same underlying theme (read structured metadata instead of parsing raw title text) but for the main youtube.com watch page rather than music.youtube.com.

### Verified: the Music attribution data is embedded JSON, not something you click to render

Follow-up question was whether we could script "click expand, read it, click collapse" to get the Music panel. Checked by fetching a real watch page's raw HTML directly (`curl` a known video with licensed music, `https://www.youtube.com/watch?v=dQw4w9WgXcQ` — Rick Astley) and inspecting the embedded `var ytInitialData = {...}` script blob. No browser/JS execution involved — plain HTTP GET.

**Finding: the data is already present in the page source on load, fully structured, no click needed.**

Path inside `ytInitialData`:
`engagementPanels[].engagementPanelSectionListRenderer` (where `panelIdentifier == "engagement-panel-structured-description"`) → `.content.structuredDescriptionContentRenderer.items[]` → `.horizontalCardListRenderer.cards[].videoAttributeViewModel`, which has clean fields — not text to regex-parse:

```json
"videoAttributeViewModel": {
  "title": "Never Gonna Give You Up (7\" Mix)",
  "subtitle": "Rick Astley",
  "secondarySubtitle": { "content": "Whenever You Need Somebody" }
}
```
`title` = song, `subtitle` = artist, `secondarySubtitle.content` = album. (There's also a per-card `confirmDialogEndpoint.dialogMessages` with localized "Song/Artist/Album/Writers" labels — skip that, it's locale-dependent display text; the `videoAttributeViewModel` fields above are the stable structured source.)

**Implication for implementation**: no expand/collapse UI automation needed — that would only be for the human eye, since the panel is inert UI over data that's already there. The one real complication: `window.ytInitialData` only reflects the page's *initial* load, and this extension's content script runs through YouTube's SPA navigation (no full reload between videos) — so the global won't update per-video, and a content script can't read the page's `window.ytInitialData` directly anyway (it's set in the page's main JS world, isolated from the content script's world). Workaround: on each video navigation, `fetch('https://www.youtube.com/watch?v=' + videoId)` for the current video specifically (same technique as the curl test above, run from the extension), regex out the `ytInitialData` blob from the response text, and `JSON.parse` it. No DOM timing, no isolated-world problem, no visible flash to the user. Still just a bonus signal — most videos won't have this panel at all (no recognized licensed music), so title parsing stays the primary path.

Not yet implemented — this is confirmed feasibility + the concrete extraction path, still needs a plan before building (new module, e.g. `music-attribution.ts`, feeding into `song-detector.ts`).

## Sprint 5 — what shipped

Plan: `docs/superpowers/plans/2026-08-16-karaoke-sprint-5-dual-sync-and-detection-signals.md`. All 7 tasks committed (base `328084a` → `10558f9`): `scrollSpeed` in storage/messaging, the pure auto-scroll engine, panel API (scroll position, speed controls, tap-to-sync button), the auto-scroll DOM loop, wiring dual sync mode + tap-to-sync into the content script, channel-name-as-artist fallback, and the YouTube Music attribution signal. 287 tests passing at that point, typecheck and build clean.

### Session 9 — acceptance-check bugs found and fixed

Running the plan's own "Sprint 5 acceptance check" in Opera GX (which had not actually been done before this session, despite the sprint table saying otherwise) surfaced real bugs the task-level reviews missed — consistent with this project's running lesson that only driving the real code path catches these:

- **Tap-to-sync offset was inverted.** `onTapSync` in `content/index.ts` computed `offset = video.currentTime - firstLineMs` instead of `firstLineMs - video.currentTime`. Sync-loop applies offset as `video.currentTime + offsetMs`, so the sign had to be the latter for the clicked moment to land on the first line. One-line fix.
- **Auto-scroll fought manual scrolling.** The original design suspended auto-scroll for 4s after a manual scroll (mirroring the synced sync-loop's behavior) and then snapped back. User feedback: a manual scroll should *stick* — the sweep should continue from wherever it was left, and only an explicit pause button should stop it. Rewrote `auto-scroll-loop.ts` from an absolute `scrollTop = f(video.currentTime)` model to a relative one: each frame advances an internally-tracked float position (`posPx`) by however far elapsed video time should move it, and only rebases onto the DOM's actual `scrollTop` when it detects a jump bigger than rounding noise (a real manual scroll). Added a pause/resume button (`PanelHandle.onScrollPauseToggle`, `.kx-scroll-pause`) as the only way to stop the sweep; `getScrollTop()` added to `PanelHandle`.
- **Sweep didn't move at all at normal (1x) speed, only became visible at high video playback rates.** Root cause: a real browser's `scrollTop` is a whole pixel, and at speed 1 a single ~16ms frame advances well under 1px for any song of normal length. The first fix (above) still derived each frame's base from `panel.getScrollTop()`, which silently rounds away that sub-pixel progress every frame — nothing ever accumulated. Fixed by keeping `posPx` as the sole accumulation source (full float precision), only reading the DOM back to detect a genuine manual scroll (>1px jump), never as the routine per-frame base. Covered by a regression test using a mock panel that rounds `scrollTop` to an integer, the class of bug that would have caught this before it shipped.
- **Added a 5s lead-in/lead-out pad.** Per request, the sweep now holds at the top for the first 5s of playback and reaches the bottom 5s before the video ends, instead of mapping the full `[0, duration]` span onto the list (most tracks have a few seconds of intro/outro with no lyrics on screen yet). Implemented as a time-remapping (`effectiveMs()`) in the loop, not a change to the pure engine functions.

294 → 297 tests across these fixes (net, after several were rewritten rather than just added), typecheck and build clean throughout. Committed as `372f8dc`.

### Session 9 (cont.) — smoother active-lyric highlight

Separate polish pass, same session: the active-line color/opacity/font-size transition felt like a snap rather than a glide, and `scrollTo({behavior: 'smooth'})` has no controllable duration and some browsers silently downgrade it to an instant jump, which read as the active line warping into place. Slowed the CSS transition to 0.4s ease-out and replaced native smooth-scroll with a self-driven rAF scroll animation in `panel.ts`. Committed as `488464a`.

## Session 10 — minimize/expand panel, click-to-seek, end-of-lyrics highlight fix

Three user-requested features/fixes, no formal plan doc (small, independent, bounded changes reviewed and approved in chat as they went):

- **Minimize/expand panel toggle**, styled after YouTube's own collapsible panels. `PanelHandle` gained `setCollapsed`/`onCollapseChange`; the header shows a circular icon button (YouTube's own X-close SVG when expanded, a matching chevron-down SVG when collapsed) that toggles a `kx-collapsed` class. Iterated through a few rounds of feedback: first pass used a text-glyph circle button (rejected — replaced with real SVG icons matching YouTube's spec-icon markup); the collapsed label originally reserved the same height as the title+artist stack, which just left a dead empty gap (rejected — collapsed bar is now a tight single line); added a CSS-grid `1fr↔0fr` accordion transition (a technique that animates to/from a container's natural content height with no JS measurement) so the collapse/expand slides instead of snapping. Collapse state is kept in a module-level variable in `content/index.ts` (deliberately not reset in `teardown()`) and restored into each freshly-mounted panel, so minimizing sticks across same-tab "next video" navigation — but it's in-memory only, not written to `chrome.storage.local`, so a full page reload resets it to expanded.
- **Click a lyric line to seek the video there.** `PanelHandle.onLineClick` fires with the clicked line's index (only for synced lines — unsynced/plain-text lines carry placeholder `timeMs`, not real timestamps, so they render without the handler or the pointer cursor). Found a real bug while wiring this up: routing the post-seek highlight through the normal `sync-loop` tick logic left it silently un-centered, because `tick()`'s `autoScroll` flag is `false` for 4s after any manual scroll — and you almost always have to scroll the list to find the line you're about to click. Fixed by adding `SyncLoopHandle.centerLine(index)`, which force-highlights and centers the line directly (bypassing both the "index unchanged" no-op and the suspension check) and clears the suspension so normal playback tracking resumes cleanly afterward.
- **Last lyric line was losing its highlight before the video ended.** Root cause: `parseLrc` doesn't filter blank-text LRC entries, and many LRC files end with a trailing timestamp that has no text (the convention for marking "song ends here"). Once playback passed that marker, `findActiveLineIndex` returned it as the active index — an invisible blank line "active" instead of the real last lyric. Fixed in `sync-engine.ts`: `findActiveLineIndex` now walks back to the nearest non-blank line whenever it lands on a blank entry, so the last real lyric stays highlighted through the outro. This also fixes the same class of bug for blank markers used mid-song to mark instrumental breaks (the last sung line now stays highlighted through the gap instead of going blank).

304 → 315 tests across these three changes, typecheck and build clean throughout.

## Known debt (accumulated)

- ~~**"First open" bug**~~ — **fixed, session 6.** Root cause found via live DOM inspection in Opera GX: `waitForSecondary()` queried bare `#secondary`, but YouTube's home/browse page (`ytd-browse`) has its own `#secondary` element that YouTube leaves cached in the DOM (`display:none`) after navigating away instead of removing it. On the very first navigation from `youtube.com` to a watch page, that stale hidden element sits earlier in the DOM than the real one inside `ytd-watch-flexy`, so the panel silently mounted into an invisible, orphaned container (lyrics still fetched fine — that's why logs looked normal). Fix: scoped the selector to `ytd-watch-flexy #secondary` and added an `offsetParent !== null` visibility check in `waitForSecondary()` so a matched-but-hidden container is rejected and polling continues.
- Panel seam, teardown pattern, stale duration — see Sprint 2.5 debt section above.
- `pickBestMatch` unused outside tests.
- Scores can exceed 1.0 (cosmetic).
- Artist named `Live`/`Cover`/etc. with Thai-only track → empty query (narrow recall miss).
- Minor: leftmost-separator splitting means `AC | DC - Song` yields artist "AC".

## Session 11 — title-normalizer CJK/full-width bugs found via a real playlist audit; SaaS/licensing research

Started from a pasted `nf:` (not-found) cache dump, then systematically audited the full `PLFHg5PiuP4_ZlrYdpIT4H1MVCWHw7hbyf` YouTube playlist (210 of 228 videos fetched via the `youtubei/v1/browse` continuation API — see method below) against the real LRCLIB API to separate genuine not-found (instrumental/ambient tracks) from pipeline bugs.

### Bug #1 — fixed, uncommitted: full-width parens + `/` separator (`src/core/title-normalizer.ts`)

Root cause: Japanese YouTube titles commonly write `曲名（feat.名前）/『アーティスト』` — a full-width paren `（）` (U+FF08/09) around a feat. credit glued directly to the name with no space, and `/` as the artist/track separator. None of the three were handled:
- `FEATURED_BRACKETED` / `BRACKETED_NOISE` / `DUPLICATED_ACROSS_BRACKETS` only matched ASCII `()`/`[]`, so `（feat.れん）` survived every noise stripper.
- `FEATURED_BRACKETED` required `\s+` after the feat. keyword; Japanese has no such space, so it wouldn't have stripped the bracket even with full-width support.
- `/` wasn't a recognized separator at all.

The leftover literal `feat.` became the *entire* search query (it was the only surviving Latin token, and `search-query.ts` treats any surviving Latin token as identifying) — a real song (好きだから. by 『ユイカ』, confirmed present on LRCLIB) was reported not-found.

Fix: extended the bracket regexes to also match full-width `（）`, relaxed the required whitespace after "feat." to `\s*`, and added `' /'`/`'/ '` as separators (guarded to need adjacent whitespace so `AC/DC` doesn't split). Verified end-to-end against the live LRCLIB API — corrected query scores 0.95 (threshold 0.55). 3 regression tests added to `tests/core/title-normalizer.test.ts`. Full suite: same pre-existing 6 `panel.test.ts` failures as master (unrelated — confirmed via `git stash`), no new regressions.

**Status: implemented, tested, NOT committed.** `git status`: `src/core/title-normalizer.ts` and `tests/core/title-normalizer.test.ts` both modified.

### Playlist audit method (reusable)

YouTube's playlist page embeds only the first 100 items as `lockupViewModel` objects (`{contentId, metadata.lockupMetadataViewModel.title.content}`) inside `var ytInitialData = {...}` in the raw HTML — not the older `playlistVideoRenderer` shape. The rest come from `POST https://www.youtube.com/youtubei/v1/browse?key={INNERTUBE_API_KEY}` with `{context: INNERTUBE_CONTEXT, continuation: token}`, where both the key and context are also embedded in the initial HTML and the continuation token is under `...continuationCommand.token` in the parsed JSON. Paged this way to 210/228 videos (the missing ~18 are likely private/deleted, not present in any page).

To compare old vs. new title-normalizer behavior at scale: a scratch vitest test importing both the current `src/core/title-normalizer.ts` and a `git show HEAD:...` copy, running each video's primary reading through the real `buildSearchQuery` → live LRCLIB search → `pickBestScored`, with a query-string cache shared across both pipelines (most titles produce an identical query either way, so this avoids ~2x redundant network calls). Scratch files were deleted after use (`tests/_scratch_*.test.ts` — never commit these).

**Result on this specific playlist: 133/210 found, before and after Bug #1's fix — 0 changed.** Expected: the playlist is all Thai-language titles, and Bug #1 only affects the Japanese full-width-paren/slash convention. Confirms the fix is real but doesn't move the needle on *this* dataset — it was found from the artifact dump, not from this playlist.

### Bug #2 — fixed, uncommitted (implemented after the research pause below)

Of the 77 still-not-found videos (post-Bug-#1-fix), `zXX4GCP11eI` — title `【MV】 「右ポケット」 /  9Lana` — loses the actual song title entirely. `CJK_BRACKETED_NOISE` (`title-normalizer.ts`) unconditionally strips **everything** inside `【】` and `「」`, with no keyword gate (unlike `BRACKETED_NOISE`, which only strips ASCII/full-width parens containing a promo keyword). `「右ポケット」` ("Right Pocket") is the real track title, not noise — it's wrapped in `「」` because that bracket is literally Japan's quotation mark (kagi kakko), not a promo tag. Result: query collapses to just `9Lana` (the artist), losing the title.

Confirmed via research this is a known, previously-solved ambiguity — see below — not a one-off. Only 1 of 210 videos in this playlist hits it (the other two `「」` matches in the not-found set, `o07e96DPB5c` and `5xuALlBVZUM`, correctly contain promo keywords like "Official Lyrics Video" and are fine to strip), but it's the same *class* of bug as #1: real content lost because 【】/「」 are treated as unconditionally-noise brackets rather than gated like their ASCII counterparts.

**Fix, in two parts, both needed** — found by tracing the bug all the way through, not stopping at the first layer:
1. `title-normalizer.ts`: extracted a shared `PROMO_KEYWORDS_SRC` regex source and gated `CJK_BRACKETED_NOISE` on it (same check `BRACKETED_NOISE` already used for ASCII/full-width parens) — a promo tag like `【OFFICIAL MV】` still strips, a quoted title like `「右ポケット」` no longer does. Verified: parse alone wasn't enough — even with `「右ポケット」` surviving in the parsed field, `buildSearchQuery` still produced just `q=9Lana`.
2. `search-query.ts`: `buildSearchQuery` only ever carried a field's text into the query if it was predominantly Thai or had Latin tokens — any other script (Japanese/Chinese/Korean) was silently dropped whenever Latin content existed elsewhere in the title. Added `OTHER_SCRIPT_RUN` (`\p{L}\p{M}` runs, excluding Thai to avoid double-counting) as a fallback, included only when a field's own Latin-token count is zero.

Verified end-to-end: `q=右ポケット 9Lana` returns the exact record (`右ポケット / 9Lana`, 162s) that `q=9Lana` alone couldn't (20 unrelated same-artist tracks, target absent — LRCLIB's 20-result cap).

### Prior-art research: is this problem already solved?

Yes — parsing artist/track from a freeform YouTube title is an established problem with existing libraries, not something specific to this codebase:
- [`get-artist-title`](https://github.com/goto-bus-stop/get-artist-title) (npm, MIT) — built for plug.dj's now-playing scrobbler. Ports exist: `youtube_title_parse` (Python), `YouTubeTitleParse` (C#), `SongTitleParser` (Java-ish, independent).
- Two design choices directly relevant to Bug #2: (1) its `cleanMVPV` only strips brackets matching an MV/PV/official pattern, never blanket-strips bracket content — same principle this codebase's `BRACKETED_NOISE` already uses for ASCII parens, but `CJK_BRACKETED_NOISE` doesn't. (2) its `quoted-title.js` plugin treats `""`/`''` as a *positive* "this is the title" signal, extracting the quoted content rather than stripping it as noise.
- Independent web research confirms why this matters for CJK: `「」`/`『』` (kagi kakko) are literally the Japanese quotation mark, used to quote/set off a work's title — and `【】` (lenticular brackets) have a *second*, competing convention of wrapping the artist name (`【Musician's Name】Song Title`), not just promo tags. Both conventions are already documented outside this codebase.

### Bug #3 — fixed, uncommitted: Thai text dropped by the >50% predominance gate

After Bug #2's fix, re-audited all 78 still-not-found videos: for each, tried the swapped-reading's own query and a maximally-loose "keep everything" query, unioned the result sets, and rescored — surfacing any case where a real match exists but production's single primary-reading query can't reach it. Found 4 candidate flips; investigated each individually rather than trusting the aggregate number (per the user's explicit "don't hardcode/mockup the score" — verify against real output, not hand-typed expectations):

- **`นิ่ง - พัน พลุแตก [Official MV]`**: NOT a real bug. Directly reproducing the exact production scoring logic found the correct record at score 0.9 — the earlier "not found" reading was live-API flakiness under the audit script's 6-way concurrent load, not something production (which sends one request at a time) would hit.
- **`ลม (Remaster)`, `อยากหยุดเวลา (Cover Version)...`, `ใจความสำคัญ (From "...")`**: all three share one root cause. `buildSearchQuery`'s Thai-text extraction only ran when a field was **>50% Thai by codepoint count** (`isPredominantlyThai`). A short/moderate Thai title next to a longer English parenthetical (a remaster/version/cover tag, or a "From ..." source-work attribution) falls under that threshold, and the Thai text — the only actually-identifying part — was dropped entirely. `q=Remaster` (20 unrelated results) vs the real record needing `q=ลม Remaster`; confirmed all three narrow to a small set containing the exact record once Thai extraction stops being gated on predominance.

**Fix**: `extractThaiText` now runs unconditionally on every field; the `isPredominantlyThai` threshold still gates whether that field's *own Latin tokens* are also kept (preserves the existing "Atom ชนกันต์" nickname-dropping test). Also added `'อัลบั้ม'` ("album") to `THAI_STOP_WORDS` — a channel-name-noise word (same class as the existing `'เพลง'`/"song") that only started leaking into queries once Thai extraction became unconditional.

**A regression this surfaced, and a real architectural limit found while fixing it**: making Thai extraction unconditional makes the query **order-dependent** when both fields can independently contribute Thai text — violates `buildSearchQuery`'s own documented "both orderings share one request" invariant. First instinct (sort the collected Thai/other-script parts before joining) was wrong — verified via real output, not assumption — because it broke already-correct, already-tested behavior for titles where *both* fields are themselves fully Thai script (e.g. `บอดี้สแลม` is the Thai spelling of "Bodyslam", not Latin — that case was already order-sensitive before this session and just never tested under a literal argument swap). Reverted the sort; documented the residual order-dependence directly in the test (`tests/core/search-query.test.ts`, the Session-marker case) rather than hiding it, and confirmed empirically that LRCLIB's search result set is itself word-order-insensitive, so this doesn't affect recall in practice — only which of two equally-valid query strings gets sent.

**A second, confirmed-real regression, root-caused precisely — shipped anyway, by user decision**: `ไม่รัก...ไม่ต้อง - นิว จิ๋ว (NEW&JIEW) [ Official MV ]` went from found (OLD, score 0.791) to not-found (NEW). Isolated the exact mechanism by testing term subsets directly against LRCLIB: `q=ไม่รัก ไม่ต้อง นิว จิ๋ว` (Thai only, 4 terms) → 4 results; `q=ไม่รัก ไม่ต้อง NEW JIEW` (Latin only, 4 terms) → 2 results; `q=ไม่รัก ไม่ต้อง นิว NEW` (Thai transliteration + its own Latin counterpart together, still 4 terms) → **0 results**. Not a term-count issue — specifically mixing a Thai transliteration of a name with that name's own Latin spelling zeroes LRCLIB's result set, even though either form alone works. Couldn't find a cheap heuristic distinguishing this from the 3 confirmed-good cases above (`ลม`+`Remaster` also mixes Thai+Latin in one field, but "Remaster" is an unrelated edit-tag, not a transliteration of "ลม" — the real distinguishing signal is semantic, not structural). Presented the tradeoff explicitly to the user (net effect on this playlist: +3 fixed / -1 regressed = net +2, and the regression's failure mode — a silent miss — is safer than the old code's, which we also newly discovered can confidently serve the *wrong* song: `Nice 2 Meet U / Jon Connor` and `Freehand / Gentle Giant`, both unrelated Western acts matched off a shared name fragment). **User chose: ship as-is.**

**Also found but explicitly out of scope, not fixed**: `SEPARATORS` doesn't include `:` (colon). Two titles (`ใจเกเร : Nice 2 Meet U [Official MV]`, `รสหวาน : FREEHAND (Official MV)`) never split into artist/track, so even though the fixed query now finds the *correct* record, the diluted (unsplit) track-similarity falls just under the match gate and it's rejected. Notably, the old code wasn't correct here either — it was confidently serving the wrong Western-artist match (see above), so this isn't a new gap, just a newly-visible one. Candidate for a future, narrowly-scoped fix (add `' : '` to `SEPARATORS`) — not attempted this session.

**Methodological note for future sessions**: the "found" metric used throughout this playlist-audit work only checks that *some* candidate cleared `MATCH_THRESHOLD` — it does not verify the matched record is actually the right song. The `ใจเกเร`/`รสหวาน` cases proved the old pipeline was quietly serving wrong-artist matches often enough to be visible in a ~210-video sample. Any future "before/after found count" comparison on this playlist should be read as a lower-confidence signal for the *old* baseline specifically — some of its "found" count is probably wrong-song false positives, not real hits.

**Status of all three bugs**: implemented, tested (37 title-normalizer + 26 search-query tests, all passing), full suite 315 passed with the same pre-existing 6 `panel.test.ts` failures / 2 typecheck errors as master (both reconfirmed via `git stash` this session too). **Not committed** — `git status`: `src/core/title-normalizer.ts`, `src/core/search-query.ts`, `tests/core/title-normalizer.test.ts`, `tests/core/search-query.test.ts` all modified.

### Licensing/SaaS research (no code changes; answered a user question, not acted on)

Asked whether `get-artist-title` and this extension's approach could become a paid product:
- `get-artist-title`: MIT license, confirmed from its repo — free for commercial/SaaS use, only needs the copyright notice kept somewhere.
- LRCLIB (server + API): MIT-licensed server, docs state no API key/registration required and no explicit commercial-use restriction — but it's a volunteer-run free service with no SLA, a business-continuity risk for anything built to scale on it.
- **The real risk is neither of those**: LRCLIB's lyrics are user-submitted with no licensing deal with music publishers/songwriters — LRCLIB doesn't hold rights to the lyrics text any more than this extension would. A free personal-use extension pulling from that free community database is low-risk; a **paid product** built on the same unlicensed lyrics content is a materially different exposure. Flagged as a real legal question needing an actual lawyer, not resolved here — nothing implemented or decided.

## Next actions

1. Category gate, error states, polish — the scope originally pencilled in for "Sprint 5" before it got reassigned to dual sync mode / detection signals; still not started.
2. Decide on Musixmatch fallback based on Thai hit rate.
3. Decide on dochord based on hit rate (chord source, not lyrics sync).
4. **music.youtube.com DOM extractor** — add a host-specific extractor for `music.youtube.com` that reads the already-separated artist and track fields directly from the DOM, avoiding raw-title parsing heuristics entirely.
5. Close the remaining double-call race: a `reload` can fire in the 200ms window between `mountPanel` returning and `load()` setting `isLoading = true`, sending two `FETCH_LYRICS` messages for the same videoId. Benign with current fixes (both find same result) but wastes a network round-trip.
6. Browser-verify the Session 7 panel changes (5-line window centering, overflow clip, static-lyric styling) in Opera GX — not yet done.
7. Browser-verify the Session 10 changes (minimize/expand toggle and its animation, click-to-seek + centering, end-of-lyrics highlight persistence) in a real browser — built and unit-tested only so far, consistent with this project's running lesson that live testing is what actually catches these bugs.
