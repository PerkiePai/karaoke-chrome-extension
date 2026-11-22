# Search Logic — 2026-11-21

## Problem / goal
Improve how the extension finds lyrics on LRCLIB. Pain, ranked by the author:
1. **Category gate wrongly blocks songs** ("Doesn't look like a music video" on a real song). Hurts most.
2. (a) Misses on songs LRCLIB has, (b) confident wrong matches, (c) unranked manual search.

## Evidence (probe, 2026-11-21)
Real pipeline (`handleFetchLyrics` + live LRCLIB) replayed over the 34 `mix_videos.csv` rows that have a VideoID, gate forced off:
- Gate would block **9/34**. Searched anyway, **all 9 → not-found**. In this sample the gate prevented **0** wrong matches; it only costs requests it saves and songs it wrongly hides.
- 8 hits, all correct by eye. **0 wrong matches.**
- Misses are dominated by **over-long queries**: LRCLIB's `q=` requires *every* token to appear (implicit AND), so tails like `Thai.ver Covered by Aino Wuwu`, `Poru arproject`, `伴奏`, `CU Chorus Concert The Journey of Love` zero the result set.
- Tokenizer bug: `LATIN_RUN` is ASCII-only, so `supїdo` → `sup do` (same for `é`, `ñ`… e.g. `Beyoncé` → `Beyonc`).

## Eval
`npm run eval:search` — 77 labeled videos (`scripts/search-eval.csv`), live YouTube + LRCLIB.
- **Baseline (2026-11-22, before changes):** `SUMMARY correct=32 wrong=1 miss=15 none-ok=29 unlabeled=0 error=0 requests=77`
  - wrong: `blue — yung kai` → "blue (oiia spinning cat version) / Oiia Cat".
  - Run-to-run noise: `jzi6RNVEOtA` (Hai Yorokonde) hit in one baseline run and missed in the next with identical code.
- **After (2026-11-22, branch tip, two consecutive runs, final labels):** `correct=41 wrong=1 miss=6 none-ok=29` in both; `requests` 117–119 (≤ 3 × 77).
  - **Correct 32 → 41, missed 15 → 6.** No row that was correct at baseline failed in both runs.
  - The 1 wrong is the same row as at baseline: `blue — yung kai`. **YouTube's own Music attribution panel labels the official video "blue - yung kai (oiia spinning cat version) / Oiia Cat"** (4/4 fetches), and attribution is deliberately the most trusted reading. Not a search bug; fixing it means distrusting attribution, which is an open design decision.
  - Still missed: 大喜 (title credits the character "Hu Tao", not the singer), 苏幕遮, Lullaby of the New Moon (I), จากฉันถึงเธอ, ถอด, เศษ.
  - Labels grew during acceptance only with **verified duplicates**: same song and artist, same duration ±1s and same first lyric line, checked via `/api/get/{id}`. LRCLIB stores many copies, and which copy wins a tie varies between runs.
- **After final-review fixes (2026-11-22, two consecutive runs):** `correct=40 wrong=1 miss=7 none-ok=29` in both, with 118–119 requests. Each run's 7th miss is a different known-flaky row (`jzi6RNVEOtA` in run 1, `Flnk4A69_4A` in run 2); each of them hit in the other run. No baseline-correct row failed in both runs. Two more verified duplicates were added to the labels (`XcVmDJSqCNA`, `Z6PQtPL0I6A`: same first lyric line, duration within 2.4s).
  - Tried and reverted: scoring the core readings only as a fallback. It fixed nothing real (the "ดาว" case was a duplicate) and made `A Moment — Zweed n' Roll` pick the 296s duet re-recording over the 317s solo.

## LRCLIB facts (scouted)
- `/api/search`: max 20, no paging; `q` = all tokens must match some field; structured `track_name` = exact phrase, `artist_name` = all tokens any order. Thai with no spaces = one token (whole-run equality).
- `/api/get`: exact normalized equality on track+artist(+album), duration ±2s; can return the wrong album's record (lrclib#26) → must still pass local gates.
- Fair use: ~90 req/min with identifying header, sequential, 200–500ms apart, honor Retry-After.
- Prior art (LRCGET, `lyrical`): exact `/get` first, `/search` as fallback. Nobody found doing query relaxation.

## Chosen direction
**A. Relaxation chain on `q=`**: today's query first (no regressions), then a core query with the tails removed, then the next reading's query. Max 3 requests, sent one after another, stopping at the first candidate that passes the gates. Nothing merges unless the eval shows 0 wrong matches.

Rejected:
- **B. Exact `/api/get` first.** It needs exact equality, and the observed misses carry tails inside the attribution names. It also has a known wrong-record bug (lrclib#26).
- **C. Structured `track_name=`/`artist_name=`.** `track_name` is an exact phrase, so the tails still kill it.

## Locked decisions
- **Eval first** (replay harness over the CSVs, labeled expected LRCLIB id / "none") — rejected: change-by-feel. Reversal: n/a.
- **Scope = retrieval + manual-search ranking; no scorer weight/threshold changes** — rejected: re-tuning weights. Reversal: low.
- **Not-found TTL stays 7 days**, no version-bump invalidation — rejected: invalidating pre-upgrade misses. Reversal: trivial. Risk: misses cached before the upgrade stay dead up to 7 days.
- **Category gate removed** (`isConfidentlyNonMusic`, `skipSearchIfNonMusic`, `category-gated` reason, and the ℗/keyword signals that only fed it) — rejected: tightening it or adding more music signals. Reversal: trivial (revert).
- **Auto-fold on not-found.** When no song is found, the panel collapses via `panel.setCollapsed(true)` *without* touching `panelCollapsed` (the user's minimize preference), so the next video mounts in whatever state the user chose. Rejected: leaving it open with an error, or remembering the auto-fold. Reversal: trivial.
- **Up to 3 LRCLIB requests per video**, sent one after another, stopping at the first candidate that passes the existing gates; stop at once on 429 or a network error. Rejected: 1 request (can't fix the long-query misses) or parallel requests (3x load on every video). Reversal: low.
- **Retry chain (Claude's call, checked by the eval):** (1) today's full query, unchanged, so today's hits can't regress; (2) a core query with the tails removed (covered by / cover / ver / concert / 伴奏, bracketed segments); (3) the next distinct reading's query. Each response is scored on its own. Order and contents are final only after the eval runs.
- **Make `LATIN_RUN` match Unicode letters** (Latin, Cyrillic, Greek scripts), not just ASCII. Reversal: trivial.
- **Translated-version markers count as variants** (`<language> ver`/`version`, e.g. `Thai.ver`, plus Thai `เวอร์ชั่นไทย`), so a Thai cover never matches the original English record. Reversal: trivial.
  - Refinement (planning, 2026-11-22): **`แปลเพลง` / `THAISUB` are NOT markers.** In those videos the audio is the original song with translated subtitles, so the original lyrics are the right ones (see `FaD9mnP5wBM`).
- **Manual search ranked by `scoreCandidates`** against the detected song; on equal score, the synced record comes first. Then top 10. Reversal: trivial.
- **Auto-fold triggers only on a real not-found** (including a cached not-found), never on network or rate-limit errors. While auto-folded, the header reads "No lyrics found".
- **Backing tracks match the vocal record:** `instrumental` / `off vocal` / `inst.` / `伴奏` are stripped from the reading before scoring, not penalized. Measured: `ความเชื่อ (Instrumental)` is rejected today. Translated-version markers are never stripped. Reversal: trivial.
  - Refinement: the same treatment covers **same-lyrics audio edits**: `slowed`, `reverb`, `sped up`, `nightcore` (Music attribution gave `supїdo (slowed + reverb)`).
- **One `coreReading()` drives both the step-2 query and extra scoring.** It removes text after ` | `, `#hashtags`, bracketed segments (only when text remains), `cover` / `covered by …`, and the backing-track/edit words. It **keeps** translated markers. Candidates are scored against both the original and the core readings, and the best score wins. Real readings showed the noise sits inside the fields (`SERIOUS BACON【Poru】#arproject`, `… Thai.ver | Covered by Aino Wuwu`), so scoring only the original readings would reject what the core query finds.
- **Duplicate query strings within the chain are skipped**, so a no-op step doesn't spend a request.
- **`LATIN_RUN` uses explicit Latin/Cyrillic/Greek script classes**, not `\p{L}`, which would swallow Thai/CJK.
- **Eval harness:** `scripts/search-eval.ts`, bundled with the esbuild already installed. Labels cover about 78 rows (mix + playlist, with playlist IDs looked up). The "expected" column is pre-filled from today's results and corrected by the author.
- **Auto-scroll for plain lyrics goes to its own session** (not this doc).

## Open risks / holes
- Wrong-match rate with gate removed is measured on only 9 non-music videos.
- Auto-scroll for unsynced (plain) lyrics reported as poor. Split to its own session; it hasn't started yet.

- Accepted (minor): fast skipping can hit a 429, which stops the chain and shows a message. Navigating away mid-chain wastes up to 2 requests. Live LRCLIB data drifts, so labels go stale; re-check only the rows whose result changes.

## Next steps
1. Eval harness and labels, plus a baseline run.
2. Remove the gate and add the auto-fold.
3. Tokenizer fix, variant markers (translated = keep; backing track = strip).
4. Retry chain.
5. Manual-search ranking.
6. Re-run the eval: more hits than baseline, 0 wrong matches.
