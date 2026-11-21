# Search Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find lyrics for more real songs without adding wrong matches. Remove the music-category gate, fold the panel on not-found, retry over-long queries up to 3 times, and rank manual search.

**Architecture:** First, a replay eval (`scripts/search-eval.ts`) runs the real `handleFetchLyrics` against live LRCLIB over labeled YouTube videos, giving a baseline number. Then the behaviour changes, each pinned by unit tests using strings measured from real videos. A final eval run must show more correct hits and zero wrong matches.

**Tech Stack:** TypeScript, Vitest, esbuild (already installed), Chrome MV3, LRCLIB `/api/search`.

**Spec:** `docs/ideas/search-logic-2026-11-21.md`

## Global Constraints

- No new dependencies.
- `MATCH_THRESHOLD`, `MIN_TRACK_SIMILARITY`, `MIN_ARTIST_SIMILARITY`, `WEIGHT_*`, `VARIANT_PENALTY`, `SYNCED_BONUS` stay unchanged.
- At most **3** LRCLIB requests per video lookup, sent one after another, with no added delay. Stop at the first candidate that passes the gates.
- Not-found TTL stays 7 days (`NF_TTL_MS`). A not-found entry is written only after the whole chain fails, never on a 429 or a network error.
- Every existing test in `tests/core/search-query.test.ts` and `tests/core/title-normalizer.test.ts` keeps passing unchanged (the Thai/CJK behaviour is hard-won).
- SESSION.md rule: every new regex is run against the concrete strings in this plan (they are the tests), never accepted by reading.

## Review Focus

1. A field that is all brackets or hashtags (`【MV】`, `#music`): `coreReading` must return the original field, never an empty query. Pinned in Task 6.
2. A 429 or network error on request 2 or 3: return that error and cache no not-found. Pinned in Task 6.
3. A not-found reply that arrives after the user navigated: the auto-fold must only touch the panel of the same generation. Task 3 places the fold after the existing `gen !== generation` check, verified manually in the browser.
4. A cached record re-validated on revisit must use the same gates as a fresh search, including the translated-version rule. Pinned in Task 5.
5. Unicode Latin must not disturb Thai handling (`Atom ชนกันต์` still drops `Atom`). The existing test plus new ones in Task 4.

---

### Task 1: Extract reading construction

`content/index.ts` builds the reading list inline. The eval needs the identical list, so move it to a pure function.

**Files:**
- Create: `src/core/readings.ts`
- Modify: `src/content/index.ts:424-448` (replace the inline construction with the call)
- Test: `tests/core/readings.test.ts`

**Interfaces:**
- Produces: `buildReadings(rawTitle: string, channelName: string | null, attribution: { title: string; artist: string } | null, artTrack: { title: string; artist: string } | null): ParsedTitle[]`. The order is: attribution reading, Art Track reading, then `normalizeTitleCandidates(rawTitle)`, plus `{ artist: channelName, track: first.track }` when the first title reading has a null artist and `channelName` is non-empty. This is exactly today's logic.

- [ ] **Step 1: Write failing tests** in `tests/core/readings.test.ts`:
  - `buildReadings('DECO*27 - ヒバナ feat. 初音ミク', null, null, null)` deep-equals `normalizeTitleCandidates('DECO*27 - ヒバナ feat. 初音ミク')`.
  - With attribution `{ title: 'supїdo (slowed + reverb)', artist: 'фрози' }`: element `[0]` is `{ artist: 'фрози', track: 'supїdo (slowed + reverb)' }`.
  - A title with no separator (`'pov: you just woke up in an abandoned church'`) and channel `'Some Channel'`: the last element is `{ artist: 'Some Channel', track: <first reading's track> }`.
- [ ] **Step 2:** `npx vitest run tests/core/readings.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `buildReadings` and make `index.ts` call it. Keep the two `console.log` lines in `index.ts`.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `refactor: extract buildReadings for reuse by the search eval`.

### Task 2: Replay eval and baseline

**Files:**
- Create: `scripts/search-eval.ts`, `scripts/search-eval.csv`
- Modify: `package.json` (script `"eval:search": "esbuild scripts/search-eval.ts --bundle --platform=node --format=esm --outfile=.eval/search-eval.mjs --log-level=error && node .eval/search-eval.mjs"`), `.gitignore` (add `.eval/`)

**Interfaces:**
- Consumes: `buildReadings` (Task 1), `handleFetchLyrics`, `searchLyrics`, `parseMusicAttribution`, `parseArtTrackDescription`.
- Produces: `npm run eval:search [-- --fill]`. It prints one line per row and ends with exactly
  `SUMMARY correct=<n> wrong=<n> miss=<n> none-ok=<n> unlabeled=<n> requests=<n>`.

CSV columns: `videoId,expectedId,note`, where `expectedId` is an LRCLIB id, `none` (not on LRCLIB, or not a song), or empty (unlabeled).

- [ ] **Step 1: Build the row set.** Copy every non-empty `VideoID` from `mix_videos.csv`. For each `playlist_videos.csv` row, look up a video ID with a one-off scratch script (not committed): fetch `https://www.youtube.com/results?search_query=<title> <channel>` and take the first `"videoId":"…"`. Skip rows that don't resolve. Put the title in `note`.
- [ ] **Step 2: Write the script.** Per row: fetch `https://www.youtube.com/watch?v=<id>` and parse `ytInitialPlayerResponse.videoDetails` (`title`, `author`, `lengthSeconds`), plus attribution and Art Track from the same HTML. Then `readings = buildReadings(...)`, and call `handleFetchLyrics` (no storage) with the readings, the duration, and a `search` wrapper that counts calls around `searchLyrics`. Wait 400ms between rows.
  - Verdicts: `correct` = got the expected id; `wrong` = got an id ≠ expected (including expected `none`); `miss` = expected an id, got not-found; `none-ok` = expected `none`, got not-found; `unlabeled` = empty `expectedId`.
  - `--fill` writes the got id, or `none`, into empty `expectedId` cells only.
- [ ] **Step 3:** `npm run eval:search -- --fill`. Expected: a SUMMARY line, and `expectedId` filled on every row.
- [ ] **Step 4: ⛔ CHECKPOINT. The author reviews `scripts/search-eval.csv`** and corrects wrong labels, especially rows that are `none` today but should have a song (the known misses: `GOyPBSa282w` should stay `none` because it's a Thai-language cover; `pMYaW7IcJw4`, `FaD9mnP5wBM`, `1DpqxwT__5A` should get the original's id if LRCLIB has it). Don't continue until the author confirms.
- [ ] **Step 5:** Run `npm run eval:search` and paste the SUMMARY line into the spec under a new `## Eval` heading as "Baseline".
- [ ] **Step 6:** Commit `test: add replay eval for lyric search with labeled baseline`.

### Task 3: Remove the category gate; auto-fold on not-found

**Files:**
- Delete: `src/core/video-category.ts`, `tests/core/video-category.test.ts`
- Modify: `src/content/music-attribution.ts` (drop `category`, `hasCopyrightNotice`, `hasMusicKeyword` from `VideoPageSignals` and the return values), `src/messaging/types.ts` (drop `skipSearchIfNonMusic` and the `'category-gated'` reason), `src/background/handle-fetch-lyrics.ts` (drop the gate block), `src/content/index.ts` (drop the gate; add the fold), `src/content/panel.ts` (add `setCollapsedLabel`; fix the `category-gated` comment at line 22)
- Test: `tests/content/panel.test.ts`, `tests/content/music-attribution.test.ts`, `tests/background/handle-fetch-lyrics.test.ts` (delete the `category gate` describe block)

**Interfaces:**
- Produces: `PanelHandle.setCollapsedLabel(text: string): void`. It sets the text of `.kx-header-collapsed-label` and fires no listener.

- [ ] **Step 1: Write failing tests.** Panel: `setCollapsedLabel('No lyrics found')` puts that text in `.kx-header-collapsed-label`, and an `onCollapseChange` spy is not called. Update `music-attribution.test.ts` expectations to the 2-field `{ attribution, artTrack }` shape.
- [ ] **Step 2:** `npx vitest run tests/content`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `index.ts`, inside the `!response.ok` branch (after the existing generation check), when `response.reason === 'not-found'`, call `panel.setCollapsed(true); panel.setCollapsedLabel('No lyrics found');`. Do **not** assign `panelCollapsed`. In `onCandidatePick`, call `panel.setCollapsedLabel('Lyrics')`. Network and rate-limit errors don't fold.
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit` (catches every leftover gate reference). Expected: all pass, no type errors.
- [ ] **Step 5:** Commit `feat: remove category gate; fold the panel when no lyrics are found`.

### Task 4: Unicode Latin tokens

**Files:**
- Modify: `src/core/search-query.ts` (`LATIN_RUN`)
- Test: `tests/core/search-query.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `buildSearchQuery('фрози', 'supїdo')` → `'фрози supїdo'`
  - `buildSearchQuery('Beyoncé', 'Halo')` → `'Beyoncé Halo'`
  - `buildSearchQuery('Atom ชนกันต์', 'PLEASE')` still → `'ชนกันต์ PLEASE'`
- [ ] **Step 2:** `npx vitest run tests/core/search-query.test.ts`. Expected: the first two FAIL.
- [ ] **Step 3: Implement.** Replace `A-Za-z` in both character classes of `LATIN_RUN` with `\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}` and add the `u` flag. **Do not use `\p{L}`**, because it would pull Thai and CJK into the Latin path.
- [ ] **Step 4:** `npm test`. Expected: all pass, including every pre-existing Thai/CJK test.
- [ ] **Step 5:** Commit `fix: keep non-ASCII Latin/Cyrillic/Greek letters in search tokens`.

### Task 5: Backing-track edits match vocals; translated versions never match originals

**Files:**
- Modify: `src/core/match-scorer.ts`, `src/background/handle-fetch-lyrics.ts` (cache re-validation)
- Test: `tests/core/match-scorer.test.ts`, `tests/background/handle-fetch-lyrics.test.ts`

**Interfaces:**
- Produces: `stripSameLyricsEdits(track: string): string`, exported from `match-scorer.ts`. It removes `/\b(?:instrumental|inst|off[\s-]?vocal|karaoke|slowed|reverb|sped[\s-]?up|nightcore)\b\.?/gi` and `/伴奏/g`, then collapses whitespace.
- Produces: `isTranslatedVersion(text: string): boolean`. True for `/\b(?:thai|eng(?:lish)?|jp|japanese|chinese|cn|korean|kr)\s*[.\-]?\s*ver(?:sion)?\b/i` or `/เวอร์ชั่นไทย|เวอร์ชันไทย/` (no `\b` on Thai).
- Behaviour: `scoreCandidates` scores `stripSameLyricsEdits(input.track)` in place of `input.track` (for both similarity and variant tags). `pickBestScored` **skips** any candidate where `isTranslatedVersion(input.track) !== isTranslatedVersion(record.trackName)`. It is a hard skip, not a penalty, because a penalty still lets `Angel With A Shotgun Thai.ver` match at ≈0.645.
- The cache re-validation in `handleFetchLyrics` (lines ~66–80) is replaced by `pickBestScored({ artist, track, durationSec }, [cached]) !== null`, so revisits share the gates.

`rec(track, artist)` below = a record with `duration: 200`, synced lyrics, not instrumental. `durationSec: 200`.

- [ ] **Step 1: Write failing tests** (`pickBestScored`):
  - `{ artist: 'Bodyslam', track: 'ความเชื่อ (Instrumental)' }` vs `[rec('ความเชื่อ', 'Bodyslam')]` → not null
  - `{ artist: '一颗狼星', track: '无人区玫瑰 (伴奏)' }` vs `[rec('无人区玫瑰', '一颗狼星')]` → not null
  - `{ artist: 'фрози', track: 'supїdo (slowed + reverb)' }` vs `[rec('supїdo', 'фрози')]` → not null
  - `{ artist: 'The Cab', track: 'Angel With A Shotgun Thai.ver' }` vs `[rec('Angel With A Shotgun', 'The Cab')]` → null
  - `{ artist: 'The Cab', track: 'Angel With A Shotgun (Thai Version)' }` vs the same → null
  - handleFetchLyrics: VideoMeta + cached `rec('Angel With A Shotgun', 'The Cab')`, request track `'Angel With A Shotgun Thai.ver'`, not user-picked → the cache is rejected and `search` is called.
- [ ] **Step 2:** `npx vitest run tests/core/match-scorer.test.ts tests/background`. Expected: FAIL on the new cases.
- [ ] **Step 3:** Implement as specified.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: match backing-track edits to vocal records; never match translated covers to originals`.

### Task 6: Core reading and the retry chain

**Files:**
- Modify: `src/core/title-normalizer.ts` (add `coreReading`), `src/core/search-query.ts` (add `buildQueryChain`, `MAX_SEARCH_REQUESTS`), `src/background/handle-fetch-lyrics.ts` (loop)
- Test: `tests/core/title-normalizer.test.ts`, `tests/core/search-query.test.ts`, `tests/background/handle-fetch-lyrics.test.ts`

**Interfaces:**
- Consumes: `stripSameLyricsEdits` (Task 5).
- Produces: `coreReading(r: ParsedTitle): ParsedTitle`. Per field, in order:
  1. Cut at the first ` | `.
  2. Remove `#\S+`.
  3. Remove `(…)`, `[…]` and `【…】` segments.
  4. Remove `/\bcover(?:ed)?\b(?:\s+by\b.*)?/i`.
  5. Apply `stripSameLyricsEdits`.
  6. Collapse whitespace.

  If a field ends up empty, keep its original value. `null` artist stays `null`. 「」 and other CJK quote brackets are **not** removed. Translated markers are **kept**.
- Produces: `MAX_SEARCH_REQUESTS = 3` and `buildQueryChain(readings: ParsedTitle[]): string[]`. The order is `[q(r0), q(core(r0)), q(r1), q(core(r1)), …]` with `q = buildSearchQuery`, dropping empty strings and exact duplicates, cut to `MAX_SEARCH_REQUESTS`.
- Behaviour: `handleFetchLyrics` runs the chain in order. Each response is filtered by `hasUsableLyrics` and scored with `pickBestScored` against **all readings plus `readings.map(coreReading)`**. The best wins, and the chain stops at the first query with a winner. A 429 or network error at any step returns that error right away (no not-found written). The not-found entry is written once, after the last query.

- [ ] **Step 1: Write failing `coreReading` tests** (real readings from the eval set):
  - `{ artist: 'The Cab', track: 'Angel With A Shotgun (ทูตสรรค์ที่มาพร้อมลูกซอง) Thai.ver | Covered by Aino Wuwu' }` → `{ artist: 'The Cab', track: 'Angel With A Shotgun Thai.ver' }`
  - `{ artist: '【cover】เธอ ๆ เพื่อนเราชอบ (Guess Who?)', track: 'SERIOUS BACON【Poru】#arproject' }` → `{ artist: 'เธอ ๆ เพื่อนเราชอบ', track: 'SERIOUS BACON' }`
  - `{ artist: '一颗狼星', track: '无人区玫瑰 (伴奏)' }` → `{ artist: '一颗狼星', track: '无人区玫瑰' }`
  - `{ artist: '[THAISUB] กุหลาบแดนร้างผู้คน', track: '无人区玫瑰 - 一颗狼星 | เพลงจีนแปลไทย' }` → `{ artist: 'กุหลาบแดนร้างผู้คน', track: '无人区玫瑰 - 一颗狼星' }`
  - `{ artist: null, track: '【MV】' }` → unchanged
  - `{ artist: '9Lana', track: '「右ポケット」' }` → unchanged
- [ ] **Step 2: Write failing `buildQueryChain` tests:**
  - The Cab reading and its swapped twin → `['ทูตสรรค์ที่มาพร้อมลูกซอง The Cab Angel With A Shotgun Thai.ver Covered by Aino Wuwu', 'The Cab Angel With A Shotgun Thai.ver']`. The twin dedupes because `buildSearchQuery` ignores field order.
  - Five distinct readings → length 3.
- [ ] **Step 3: Write failing handler tests** (a fake `search` that records the queries it receives):
  - The first query returns `[]` and the second returns a matching record → `ok`, two calls, in chain order.
  - The first query matches → exactly one call.
  - Nothing ever matches → `not-found`, calls = chain length ≤ 3, not-found cached.
  - The second query throws `LrclibRateLimitError(30)` → `reason: 'rate-limited'`, and `isNotFoundCached` is false.
  - The Cab Thai.ver reading, where `search` always returns `[rec('Angel With A Shotgun', 'The Cab')]` → `not-found`.
  - A user-picked cached record → `search` is never called (keep or confirm the existing test).
- [ ] **Step 4:** `npx vitest run tests/core tests/background`. Expected: the new cases FAIL.
- [ ] **Step 5:** Implement as specified.
- [ ] **Step 6:** `npm test`. Expected: all pass.
- [ ] **Step 7:** Commit `feat: retry over-long LRCLIB queries with a core reading (max 3 requests)`.

### Task 7: Rank manual search results

**Files:**
- Modify: `src/messaging/types.ts` (`SearchCandidatesRequest.rankAgainst?: MatchInput`), `src/background/handle-search-candidates.ts`, `src/content/index.ts` (keep a module-level `currentMatchInput: MatchInput | null` set when the FETCH_LYRICS request is built, cleared in teardown, and sent with SEARCH_CANDIDATES)
- Test: `tests/background/handle-search-candidates.test.ts`

**Interfaces:**
- Consumes: `scoreCandidates(input: MatchInput, candidates: LrclibRecord[]): ScoredCandidate[]` (already sorted by score).
- Behaviour: when `rankAgainst` is present, the result is `scoreCandidates(rankAgainst, usable).map(c => c.record).slice(0, 10)`; without it, the current behaviour stays. "Same score → synced first" is already guaranteed by `SYNCED_BONUS`, so no extra comparator is needed.

- [ ] **Step 1: Write failing tests.** LRCLIB order `[unrelated, exactPlain, exactSynced]` with `rankAgainst` = the exact song → order `[exactSynced, exactPlain, unrelated]`. Without `rankAgainst`, the order is unchanged.
- [ ] **Step 2:** `npx vitest run tests/background/handle-search-candidates.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: rank manual search results against the detected song`.

### Task 8: Acceptance

- [ ] **Step 1:** `npm run eval:search`. Acceptance:
  - `wrong=0`
  - `correct` > the baseline `correct`
  - no row that was `correct` at baseline is anything else now
  - `requests` ≤ 3 × the row count

  If a row regresses, fix the rule that caused it (add that row's strings as a unit test first). Don't loosen the acceptance.
- [ ] **Step 2:** Paste the SUMMARY into the spec's `## Eval` section as "After", next to "Baseline".
- [ ] **Step 3: Manual browser check.** Run `npm run build` and load `dist/` unpacked.
  - (a) A gaming-category song now searches.
  - (b) A video with no lyrics folds, reading "No lyrics found", and the next video opens the panel.
  - (c) Minimize by hand, then go to the next video: it stays minimized.
  - (d) Manual search lists the detected song first.
- [ ] **Step 4:** `npm test && npm run build`. Expected: all pass. Commit `docs: record search eval before/after`.
