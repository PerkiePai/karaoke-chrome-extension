# YouTube Karaoke Lyrics — Design

**Date:** 2026-08-15
**Status:** Approved for planning
**Target browser:** Opera GX (Chromium, MV3, loaded unpacked)

## Problem

When watching a music video on YouTube, there is no way to see time-synced
lyrics. The goal is a browser extension that detects the song playing, fetches
synced lyrics, and scrolls them in time with the video — close enough to
karaoke to sing along, and later to play guitar along.

The user listens mainly to Thai music and Western pop/rock/hip-hop.

## Scope

**v1 is lyrics only.** Chords are the long-term motivation but are not built
here. The data model and renderer reserve a place for them (§8) and nothing
else about chords is implemented.

### Not in v1

- Word-level highlighting — LRCLIB is line-level; enhanced LRC is rare
- Translations and romanization
- Tap-to-sync timing editor
- `music.youtube.com` — different DOM, watch page only
- Chrome Web Store publishing — loaded unpacked

## Feasibility (verified 2026-08-15)

Lyrics come from **LRCLIB** (`https://lrclib.net`) — free, no auth, no API key,
serves time-synced LRC.

Measured share of search results carrying `syncedLyrics`:

| Artist | Synced |
|---|---|
| Taylor Swift | 20/20 |
| Getsunova | 19/20 |
| Oasis | 19/20 |
| Scrubb | 18/20 |
| Bodyslam | 16/20 |
| Palmy | 16/20 |
| Three Man Down | 13/20 |
| Cocktail | 12/20 |
| Tilly Birds | 10/20 |
| Potato | 10/20 |

Thai coverage is real. Misses are a case to handle, not the default.

CORS was confirmed against a `youtube.com` origin:

```
HTTP/2 200
access-control-allow-origin: *
access-control-expose-headers: retry-after
```

Two consequences drive the design:

1. `retry-after` is exposed, so LRCLIB rate-limits. All network traffic goes
   through one path in the service worker with caching and backoff.
2. YouTube music videos carry intros and outros, so their duration will not
   match the official track. Exact-match lookup will often fail (we use fuzzy
   search plus scoring) and **playback will drift against the LRC timings**, so
   a user-adjustable offset is mandatory, not a nicety.

## Architecture

```
┌─ content script  (youtube.com/watch) ─────────────────┐
│  song-detector  → what song is this?                  │
│  sync-engine    → rAF loop on <video>.currentTime     │
│  panel          → shadow DOM mounted in #secondary    │
└──────────────┬────────────────────────────────────────┘
               │ chrome.runtime messages
┌──────────────▼─ service worker ───────────────────────┐
│  lrclib-client  → search/get, retry-after aware       │
│  cache          → chrome.storage.local, LRU           │
└───────────────────────────────────────────────────────┘

pure modules — no chrome.*, no DOM, fully unit-tested:
  lrc-parser        LRC text → [{ timeMs, text }]
  title-normalizer  raw video title → { artist, track }
  match-scorer      (videoMeta, candidates[]) → ranked
```

**Boundary rule:** the three pure modules never import `chrome.*` and never
touch the DOM. They hold most of the logic and therefore most of the bugs, and
they are the only things with automated tests.

Networking lives in the service worker even though CORS would permit a direct
content-script fetch. One shared cache, one place to honor `retry-after`, one
in-flight request per song across all tabs.

### Stack

TypeScript, Vite, Vitest. Panel UI is plain DOM inside a shadow root — no UI
framework.

The build must emit the content script and the service worker as **separate
entry points** (no shared chunk splitting between them — MV3 content scripts
cannot use ES module imports at runtime) alongside a `manifest.json`, all into
`dist/`. `dist/` is the directory loaded unpacked. Sprint 1 picks the concrete
mechanism, `@crxjs/vite-plugin` or a hand-rolled multi-entry Rollup config,
whichever produces a clean load in Opera GX.

## Song identification

A cascade, best signal first:

1. **YouTube's music metadata.** Licensed music renders a structured
   Song / Artist / Album block in the expanded description (Content ID data).
   When present, treat as authoritative.
2. **Category gate.** If the video is not category Music, the panel does not
   mount at all. This gate arrives in Sprint 5; through Sprints 1–4 the panel
   mounts on every watch page, which is intentional — it keeps early builds
   easy to test.
3. **Title parsing.** Strip `[MV]`, `(Official Music Video)`, `Official Audio`,
   `4K`, `【】` brackets, `ft.`/`feat.`; split on ` - ` / ` – `. Channel name is
   a low-weight artist signal — Thai official channels are usually the label
   (What The Duck, GeneLab), not the band.
4. **Manual search box**, always available in the panel.

### Matching

Rank LRCLIB candidates by:

- normalized string similarity on track name
- normalized string similarity on artist name
- duration proximity to the YouTube video
- penalty when `(Live)` / `(Acoustic)` / `Cover` disagrees between the video
  title and the candidate

Thai text is normalized to Unicode NFC with whitespace and punctuation
collapsed. **No tone-mark folding** — it breaks more than it fixes.

The panel header always shows which match was chosen, with a "not this one?"
control. The extension never silently guesses.

## Sync engine

- `requestAnimationFrame` loop reading `video.currentTime`, running only while
  the video is playing and the panel is visible. `timeupdate` fires ~4×/sec,
  too coarse to feel like karaoke.
- Binary search into the line array for the current index. **The DOM is
  touched only when that index changes**, never per frame.
- Auto-scroll keeps the current line centered, but suspends for 4 seconds
  after any manual scroll — otherwise reading ahead is impossible, which
  matters with a guitar in hand.
- Offset: `effectiveTime = currentTime + offset`. `◀ ▶` adjust in 0.25s steps.
  Persisted per videoId.
- Scrubbing needs no special handling; the `seeked` event recomputes the index.

The engine consumes a `{ currentTime, paused }` source rather than a `<video>`
element directly, so it can be driven by a fake clock in tests.

## Lifecycle

YouTube is an SPA: navigating between videos **does not reload the page**. The
content script listens for `yt-navigate-finish`, with a videoId poll as a
backup signal, then tears down and re-mounts. `#secondary` is recreated on
navigation and the `<video>` element is reused with a new src. Getting this
wrong is the most common way extensions of this kind break.

## Persistence

`chrome.storage.local`, two keyspaces:

- `videoId → { lrclibId, offsetSec }` — the user's corrections, remembered
- `lrclibId → lyricsPayload` — the lyrics themselves

Lyrics do not change, so there is no TTL. The cache has a total size cap with
LRU eviction.

## Error handling

| Case | Behavior |
|---|---|
| Network down or 5xx | Panel offers retry; no automatic spam |
| HTTP 429 | Honor `retry-after`, back off in the worker |
| Plain lyrics only, no timings | Static scrollable block; offset controls hidden |
| Nothing found | "No lyrics found" with the search box focused |
| Not a music video | Panel does not mount |

## Testing

**Automated (Vitest), on the pure modules only:**

- `lrc-parser` — malformed timestamps, `[mm:ss.xx]` vs `[mm:ss.xxx]`, multiple
  timestamps on one line, metadata tags (`[ar:]`, `[ti:]`, `[offset:]`)
- `title-normalizer` — fixtures taken from real Thai and English video titles
- `match-scorer` — ranking assertions over candidate sets
- `sync-engine` — driven by a fake clock, no jsdom video required

**Manual, by checklist:** everything that reads YouTube's DOM. Automating
YouTube DOM scraping is a maintenance trap and is deliberately not attempted.

## Chord hook (reserved, not built)

The line model is:

```ts
{ timeMs: number, text: string, chords?: { charIndex: number, symbol: string }[] }
```

The renderer supports an optional chord row above a lyric line, always empty in
v1. That is the entire accommodation. No speculative chord code is written.

## Delivery sprints

Each sprint ends in a build that loads in Opera GX and that the user verifies
by hand before the next begins.

### Sprint 1 — Loads and lives

MV3 manifest, Vite build to `dist/`, content script mounting an empty shadow-DOM
panel into `#secondary` on watch pages, SPA teardown and re-mount, and a
**live LRCLIB smoke call** in the service worker that logs a real response.

The smoke call exists specifically to prove Opera GX's MV3 networking works on
day one rather than at Sprint 2.

*Verified by:* load unpacked at `opera://extensions` with Developer mode on;
open a video and see the panel; check the worker console for lyrics JSON; click
through to another video and confirm the panel re-mounts.

### Sprint 2 — Lyrics on screen, unsynced

`title-normalizer`, `lrc-parser`, `match-scorer`, the lrclib client, and
message passing. Panel shows the matched song header and the full lyric text as
a static block.

*Verified by:* opening ten songs, Thai and English, and counting how many
identify correctly.

### Sprint 3 — It syncs

The rAF sync engine, current-line highlighting, auto-scroll with manual-scroll
suspension.

*Verified by:* playing a song and singing along.

### Sprint 4 — Fix-it controls

Offset nudge with persistence, manual search box with a candidate picker,
per-video memory, the storage cache.

*Verified by:* finding a mismatched or intro-padded video, correcting it,
reloading, and confirming the correction stuck.

### Sprint 5 — Hardening

Category gate, YouTube music-metadata reader promoted to primary signal, all
error states, rate-limit backoff, LRU cache cap, visual polish and theming.

*Verified by:* opening a podcast and seeing no panel; going offline and seeing
a clean error rather than a hang.
