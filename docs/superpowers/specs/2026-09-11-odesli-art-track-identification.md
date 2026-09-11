# Odesli + Art Track Description — Song Identification Signals

**Date:** 2026-09-11
**Status:** Approved for planning
**Branch:** `feat/odesli-identification`

## Problem

The current pipeline reaches LRCLIB for ~133 of 210 Thai-playlist videos. The
77 misses are mostly songs that ARE in LRCLIB but whose YouTube titles are too
noisy or non-standard for `title-normalizer.ts` to parse cleanly: wrong
artist-track split, full-width CJK bracket misread as noise, `/` separator
unrecognized, etc. Title parsing is the bottleneck.

Two signals exist that bypass title parsing entirely and deliver clean
artist/track metadata directly:

1. **Odesli/Songlink** — a free public API that resolves a YouTube video URL
   to canonical song metadata by cross-referencing Spotify, Apple Music,
   Deezer, and YouTube Music. Returns `{ title, artistName }` — no title
   parsing needed, no separator detection.

2. **"Provided to YouTube by" Art Track description** — when a label
   distributes a track through YouTube's Art Track system (official upload with
   no dedicated video), a rigidly-structured description block is
   auto-generated:
   ```
   Provided to YouTube by DistroKid

   ชื่อเพลง · ชื่อศิลปิน
   Album Name
   ℗ 2024 Label Name
   ```
   The middle dot `·` (U+00B7) is the stable, machine-readable separator
   between track and artist. This text is inside `ytInitialPlayerResponse`
   which the content script's existing page fetch already retrieves.

## What Changes

### Two new signals in the cascade

```
Odesli lookup             ← new (background, cross-origin, api.song.link)
  ↓ miss
Music attribution panel   ← existing (content, ytInitialData)
Art Track description     ← new (content, ytInitialPlayerResponse)
Channel name fallback     ← existing (content, DOM)
Title parsing             ← existing (content, DOM)
```

All signals produce an `{ artist, track }` reading. Every reading — regardless
of source — goes through `buildSearchQuery` → LRCLIB search →
`scoreCandidates` → match gate. No signal gets an exemption from the score
gate. This is the codebase's standing rule (SESSION.md, "Hard-won lessons");
Odesli's confidence earns it first-reading priority, not a bypass.

### Odesli — architecture

Odesli is a cross-origin fetch to `https://api.song.link/`. The content script
runs on `youtube.com` and cannot make such a call. The background service
worker (already calling `lrclib.net`) is the right home: no new architectural
surface, just a new host in `host_permissions`.

**Call:** `GET https://api.song.link/v1-alpha.1/links?url=https://www.youtube.com/watch?v={videoId}&songIfSingle=true`

**Response (relevant parts):**
```json
{
  "entityUniqueId": "YOUTUBE_VIDEO::dQw4w9WgXcQ",
  "entitiesByUniqueId": {
    "YOUTUBE_VIDEO::dQw4w9WgXcQ": {
      "title": "Never Gonna Give You Up",
      "artistName": "Rick Astley"
    }
  }
}
```

Read `entitiesByUniqueId[response.entityUniqueId]` for the canonical entity.

**Failure modes (all → `null`, pipeline continues):**
- HTTP 404: video not recognized
- HTTP 429: rate-limited (Odesli's limit is 10 req/s; extension use is well
  under this, but must not error)
- Network error / timeout (5s timeout)
- Unexpected JSON shape

**Integration point:** `handle-fetch-lyrics.ts`, immediately after cache/gate
checks, before the LRCLIB search. When Odesli returns a result:
- Prepend `{ artist: odesli.artistName, track: odesli.title }` to the
  `readings` list (first = highest scoring priority)
- Use Odesli's `{ artist, track }` to build the LRCLIB search query instead
  of the title-parsed `request.artist`/`request.track`

This means the Odesli reading leads both the query AND the candidate ranking,
which is where the win is: a clean Bodyslam/`ใจสั่งมา` query returns the
right catalog; a garbled `[Official MV] 4K บอดี้สแลม` query might not.

Title-parsed readings are kept as alternates in case Odesli's canonical title
form doesn't match LRCLIB's stored title (some tracks use Thai script in
LRCLIB but Odesli returns a romanized form, or vice versa).

### Art Track description — architecture

`fetchVideoPageSignals()` (`src/content/music-attribution.ts`) already fetches
the YouTube watch page HTML and returns `{ attribution, category }`. The "Provided to YouTube by"
text is in `ytInitialPlayerResponse.videoDetails.shortDescription` inside that
same HTML — no extra network call needed.

A new `parseArtTrackDescription(html: string): { title: string; artist: string } | null`
function in `src/core/music-attribution.ts` will:
1. Locate `var ytInitialPlayerResponse\s*=\s*(\{.*?\});` in the HTML
2. `JSON.parse` the blob
3. Read `.videoDetails.shortDescription` (a flat string)
4. Apply `/^Provided to YouTube by .+?\n\n(.+?) · (.+?)\n/m` to get title · artist

`VideoPageSignals` gains an `artTrack: { title: string; artist: string } | null`
field. `content/index.ts` adds it to the readings list alongside the existing
music-attribution reading.

## Non-goals

- Word-level lyrics — not offered by LRCLIB regardless of identification quality
- Odesli ISRC lookup into other lyrics sources — out of scope; LRCLIB only
- Keeping Odesli results when LRCLIB has no match — Odesli is an
  identification signal, not a lyrics source
- Caching Odesli responses across sessions — the per-video VideoMeta cache
  (written after a successful match) already prevents repeat Odesli calls for
  cached videos
- `music.youtube.com` — different host, out of scope for this branch

## Acceptance check

Manual, in Opera GX, after `npm run build` + reload:

1. **Odesli hit — previously-failing Thai title.** Navigate to a Thai playlist
   video that previously returned "No lyrics found". Confirm lyrics now load.
   Open the service worker console and verify a `[karaoke] odesli OK` log line.
2. **Odesli miss — falls through cleanly.** Navigate to a private/unlisted
   video that Odesli won't recognize. Confirm the panel behaves identically to
   today: either lyrics from title parsing or "No lyrics found". No error shown.
3. **Art Track — description block detected.** Navigate to a YouTube Art Track
   upload (audio + album art, auto-generated by a label). Verify the panel
   shows correct lyrics and the service worker console shows the Art Track
   reading was used.
4. **Cached video — Odesli not called.** Navigate to a video already in cache.
   Confirm the `[karaoke] cache HIT` log appears and no Odesli call is made
   (no `odesli` log line).
5. **Rate-limited Odesli — no crash.** Simulate a 429 from Odesli by
   temporarily pointing the URL at a 429-returning host. Confirm the panel
   falls through to title-based results and no error is surfaced to the user.
