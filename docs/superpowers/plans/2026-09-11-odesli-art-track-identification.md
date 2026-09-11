# Odesli + Art Track Description — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new song-identification signals — Odesli (background, cross-origin) and the "Provided to YouTube by" Art Track description block (content, same page fetch) — as higher-confidence readings that flow through the existing `buildSearchQuery` → LRCLIB → `scoreCandidates` pipeline without bypassing the match gate.

**Spec:** `docs/superpowers/specs/2026-09-11-odesli-art-track-identification.md`

**Architecture:**
- Task 1 builds the Odesli module + tests, and adds `https://api.song.link/` to `host_permissions`.
- Task 2 wires Odesli into `handle-fetch-lyrics.ts`: prepends the Odesli reading and uses its query when available; updates tests.
- Task 3 adds `parseArtTrackDescription` to `src/core/music-attribution.ts`, extends `VideoPageSignals` with `artTrack`, and updates the content-side fetch wrapper + tests.
- Task 4 wires the Art Track reading into `content/index.ts`'s `load()` alongside the existing music-attribution reading.

---

## Global Constraints

- **`src/core/` is pure.** No `chrome.*`, no `fetch`, no DOM. Browser-side wiring lives in `src/content/` or `src/background/`.
- **TypeScript `strict: true` with `noUncheckedIndexedAccess: true`.** Every compile must pass `npm run typecheck` without error.
- **Run `npm test` (not `npx vitest`)** for all test runs — `NODE_OPTIONS=--experimental-require-module` is required on Node 22.11.0.
- **Commit after every task.**
- **`PanelHandle` mock objects must implement every method.** Any new method added to `PanelHandle` must also appear in every `mockPanel()` stub in `tests/content/*.test.ts`.
- **No new npm dependencies.** Odesli is a plain `fetch` call; no SDK.
- **Untrusted content.** Odesli's `title`/`artistName` and the Art Track description fields are third-party text — never render with `innerHTML`, only via `textContent` through the existing `panel.setHeader()`.

---

## Task 1: `src/background/fetch-odesli.ts` + manifest

**Files:**
- Create: `src/background/fetch-odesli.ts`
- Create: `tests/background/fetch-odesli.test.ts`
- Modify: `public/manifest.json`

**Goal:** A pure async function `fetchOdesli(videoId, fetchImpl?)` that calls
the Odesli API and returns `{ title: string; artistName: string } | null`.
Returns `null` on any failure (404, 429, network, bad shape) — never throws.
The `fetchImpl` seam makes it fully testable without a real network.

**Interfaces produced:**
```typescript
// src/background/fetch-odesli.ts
export interface OdesliResult {
  title: string;
  artistName: string;
}

export async function fetchOdesli(
  videoId: string,
  fetchImpl?: typeof fetch,
): Promise<OdesliResult | null>
```

---

- [ ] **Step 1: Create `src/background/fetch-odesli.ts` (stub)**

```typescript
export interface OdesliResult {
  title: string;
  artistName: string;
}

export async function fetchOdesli(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OdesliResult | null> {
  // TODO
  return null;
}
```

- [ ] **Step 2: Write the tests first (`tests/background/fetch-odesli.test.ts`)**

Cover all four outcomes. Use a `mockFetch` helper that returns a
`Response`-like object:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchOdesli } from '../../src/background/fetch-odesli';

function mockFetch(status: number, body: unknown) {
  return async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
}

describe('fetchOdesli', () => {
  it('returns title and artistName on a successful response', async () => {
    const body = {
      entityUniqueId: 'YOUTUBE_VIDEO::abc123',
      entitiesByUniqueId: {
        'YOUTUBE_VIDEO::abc123': { title: 'Never Gonna Give You Up', artistName: 'Rick Astley' },
      },
    };
    const result = await fetchOdesli('abc123', mockFetch(200, body));
    expect(result).toEqual({ title: 'Never Gonna Give You Up', artistName: 'Rick Astley' });
  });

  it('returns null on 404', async () => {
    expect(await fetchOdesli('missing', mockFetch(404, {}))).toBeNull();
  });

  it('returns null on 429 (rate-limited) without throwing', async () => {
    expect(await fetchOdesli('xyz', mockFetch(429, {}))).toBeNull();
  });

  it('returns null when the entity is missing from entitiesByUniqueId', async () => {
    const body = {
      entityUniqueId: 'YOUTUBE_VIDEO::abc123',
      entitiesByUniqueId: {},
    };
    expect(await fetchOdesli('abc123', mockFetch(200, body))).toBeNull();
  });

  it('returns null on network error', async () => {
    const throwing = async () => { throw new Error('network'); };
    expect(await fetchOdesli('abc123', throwing as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — confirm they all fail (function returns null stub)**

```
npm test -- fetch-odesli
```

All five tests should fail at the `title/artistName` assertion. The null cases
should already pass. Confirm no typecheck errors.

- [ ] **Step 4: Implement `fetchOdesli`**

```typescript
const ODESLI_TIMEOUT_MS = 5000;
const ODESLI_BASE = 'https://api.song.link/v1-alpha.1/links';

export async function fetchOdesli(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OdesliResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ODESLI_TIMEOUT_MS);
  try {
    const url = `${ODESLI_BASE}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&songIfSingle=true`;
    const resp = await fetchImpl(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json() as unknown;
    return extractOdesliResult(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractOdesliResult(data: unknown): OdesliResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const uniqueId = typeof d['entityUniqueId'] === 'string' ? d['entityUniqueId'] : null;
  if (!uniqueId) return null;
  const entities = d['entitiesByUniqueId'];
  if (typeof entities !== 'object' || entities === null) return null;
  const entity = (entities as Record<string, unknown>)[uniqueId];
  if (typeof entity !== 'object' || entity === null) return null;
  const e = entity as Record<string, unknown>;
  const title = typeof e['title'] === 'string' ? e['title'].trim() : null;
  const artistName = typeof e['artistName'] === 'string' ? e['artistName'].trim() : null;
  if (!title || !artistName) return null;
  return { title, artistName };
}
```

- [ ] **Step 5: Run tests — confirm all pass**

```
npm test -- fetch-odesli
```

- [ ] **Step 6: Add `https://api.song.link/*` to `host_permissions` in `public/manifest.json`**

```json
"host_permissions": ["https://lrclib.net/*", "https://api.song.link/*"],
```

- [ ] **Step 7: Full test suite + typecheck**

```
npm test && npm run typecheck
```

Expect the same passing count as before (all tests green, 6 pre-existing
`panel.test.ts` failures unchanged).

- [ ] **Step 8: Commit**

```
git add src/background/fetch-odesli.ts tests/background/fetch-odesli.test.ts public/manifest.json
git commit -m "feat: Odesli client module + host_permissions"
```

---

## Task 2: Wire Odesli into `handle-fetch-lyrics.ts`

**Files:**
- Modify: `src/background/handle-fetch-lyrics.ts`
- Modify: `tests/background/handle-fetch-lyrics.test.ts`

**Goal:** When `fetchOdesli` returns a result, prepend its `{ artist:
artistName, track: title }` reading to the front of `readings`, and use it to
build the LRCLIB search query. Title-parsed readings are kept as alternates.
If Odesli returns `null`, the function behaves identically to today.

**Signature change:** Add a third injectable dependency alongside `search`:

```typescript
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
  storage?: StorageLike,
  fetchOdesliImpl?: (videoId: string) => Promise<OdesliResult | null>,
): Promise<FetchLyricsResponse>
```

The seam defaults to the real `fetchOdesli` so production code in
`src/background/index.ts` needs no change; tests inject a stub.

---

- [ ] **Step 1: Add the Odesli tests to `tests/background/handle-fetch-lyrics.test.ts`**

Add a new `describe('Odesli integration')` block:

```typescript
import { fetchOdesli } from '../../src/background/fetch-odesli'; // for type only

describe('Odesli integration', () => {
  it('prepends Odesli reading and uses its query when Odesli succeeds', async () => {
    // Build a mock search that captures the query it was called with
    let capturedQuery = '';
    const search = async (q: string) => { capturedQuery = q; return [makeLrclibRecord(1, 'Never Gonna Give You Up', 'Rick Astley')]; };
    const odesli = async () => ({ title: 'Never Gonna Give You Up', artistName: 'Rick Astley' });

    const req: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId: 'dQw4w9WgXcQ',
      artist: 'リック・アストリー',   // garbled artist — Odesli should override
      track: 'Never Gonna Give You Up',
      durationSec: null,
    };
    const resp = await handleFetchLyrics(req, search, undefined, odesli);
    expect(resp.ok).toBe(true);
    // Query was built from Odesli's clean artist, not the garbled title-parsed one
    expect(capturedQuery).toContain('Rick Astley');
  });

  it('falls through to title-based flow when Odesli returns null', async () => {
    let searchCalled = false;
    const search = async () => { searchCalled = true; return [makeLrclibRecord(1, 'Song', 'Artist')]; };
    const odesli = async () => null;

    const req: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId: 'xyz',
      artist: 'Artist',
      track: 'Song',
      durationSec: null,
    };
    await handleFetchLyrics(req, search, undefined, odesli);
    expect(searchCalled).toBe(true);
  });

  it('does not call Odesli when there is a valid cache hit', async () => {
    const storage = mockStorage();
    await writeVideoMeta(storage, 'vid1', { lrclibId: 42, offsetSec: 0, scrollSpeed: 1 });
    await writeLyricsCache(storage, 42, makeLrclibRecord(42, 'Cached Song', 'Cached Artist'));

    let odesliCalled = false;
    const odesli = async () => { odesliCalled = true; return null; };

    const req: FetchLyricsRequest = {
      type: 'FETCH_LYRICS', videoId: 'vid1', artist: 'Cached Artist',
      track: 'Cached Song', durationSec: null,
    };
    const resp = await handleFetchLyrics(req, async () => [], storage, odesli);
    expect(resp.ok).toBe(true);
    expect(odesliCalled).toBe(false);
  });
});
```

(Define a `makeLrclibRecord` helper if one doesn't already exist in the test
file's setup — look for existing similar helpers first.)

- [ ] **Step 2: Run tests — confirm the new ones fail**

```
npm test -- handle-fetch-lyrics
```

- [ ] **Step 3: Add the `fetchOdesliImpl` parameter and the pre-search Odesli call**

In `handle-fetch-lyrics.ts`, after the cache-hit / category-gate block and
before line 130 (`const readings = ...`):

```typescript
import { fetchOdesli, type OdesliResult } from './fetch-odesli';

// ... existing signature:
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
  storage?: StorageLike,
  fetchOdesliImpl: (videoId: string) => Promise<OdesliResult | null> = fetchOdesli,
): Promise<FetchLyricsResponse> {
  // ... (all existing cache/gate logic unchanged) ...

  // Try Odesli for a higher-confidence artist/track before falling back to
  // title-parsed readings. Null on any failure — never blocks the pipeline.
  const odesliResult = await fetchOdesliImpl(request.videoId);
  if (odesliResult) {
    console.log(
      `[karaoke] odesli OK videoId=${request.videoId}`,
      `"${odesliResult.title}" / "${odesliResult.artistName}"`,
    );
  }

  const odesliReading = odesliResult
    ? { artist: odesliResult.artistName, track: odesliResult.title }
    : null;

  const readings = [
    ...(odesliReading ? [odesliReading] : []),
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  // Use Odesli's cleaner metadata for the LRCLIB search query when available;
  // the title-parsed artist/track may be garbled or incorrectly split.
  const queryArtist = odesliReading?.artist ?? request.artist;
  const queryTrack = odesliReading?.track ?? request.track;
  const query = buildSearchQuery(queryArtist, queryTrack);

  // ... rest unchanged (search, score, return) ...
```

- [ ] **Step 4: Update `src/background/index.ts` to pass `fetchOdesli` explicitly**

Find the `handleFetchLyrics(request, ...)` call in `index.ts`. The defaulted
parameter means it already works without change, but passing it explicitly
makes the dependency visible:

```typescript
import { fetchOdesli } from './fetch-odesli';
// ...
handleFetchLyrics(request, search, storage, fetchOdesli)
```

- [ ] **Step 5: Run all tests + typecheck**

```
npm test && npm run typecheck
```

- [ ] **Step 6: Commit**

```
git add src/background/handle-fetch-lyrics.ts src/background/index.ts tests/background/handle-fetch-lyrics.test.ts
git commit -m "feat: wire Odesli into handle-fetch-lyrics as lead identification signal"
```

---

## Task 3: `parseArtTrackDescription` in `src/core/music-attribution.ts`

**Files:**
- Modify: `src/core/music-attribution.ts`
- Modify: `src/content/music-attribution.ts`
- Modify: `tests/core/music-attribution.test.ts` (create if absent)
- Modify: `tests/content/music-attribution.test.ts`

**Goal:** Add `parseArtTrackDescription(html: string): { title: string; artist: string } | null`
to the pure core module, extracting the Art Track block from
`ytInitialPlayerResponse.videoDetails.shortDescription`. Extend
`VideoPageSignals` with `artTrack` so the content-side fetch wrapper returns
it in the same single network call.

**Interfaces produced:**
```typescript
// src/core/music-attribution.ts (new export)
export function parseArtTrackDescription(
  html: string,
): { title: string; artist: string } | null

// src/content/music-attribution.ts (extended)
export interface VideoPageSignals {
  attribution: MusicAttribution | null;
  artTrack: { title: string; artist: string } | null;   // ← new
  category: string | null;
}
```

---

- [ ] **Step 1: Check for an existing test file for `src/core/music-attribution.ts`**

```
npm test -- music-attribution
```

If `tests/core/music-attribution.test.ts` does not exist, create it now with
the describe block and import. If it does, add to it.

- [ ] **Step 2: Write tests for `parseArtTrackDescription`**

```typescript
import { parseArtTrackDescription } from '../../src/core/music-attribution';

describe('parseArtTrackDescription', () => {
  it('extracts title and artist from an Art Track description', () => {
    const desc = 'Provided to YouTube by DistroKid\n\nSong Title · Artist Name\nAlbum\n℗ 2024 Label\n';
    const html = buildHtmlWithDescription(desc);
    expect(parseArtTrackDescription(html)).toEqual({ title: 'Song Title', artist: 'Artist Name' });
  });

  it('extracts a Thai title and Latin artist', () => {
    const desc = 'Provided to YouTube by The Orchard\n\nใจสั่งมา · Bodyslam\nรักนะเว้ย\n℗ 2008 GMM Grammy\n';
    const html = buildHtmlWithDescription(desc);
    expect(parseArtTrackDescription(html)).toEqual({ title: 'ใจสั่งมา', artist: 'Bodyslam' });
  });

  it('returns null when the description has no Art Track block', () => {
    const html = buildHtmlWithDescription('A normal video description with no special format.');
    expect(parseArtTrackDescription(html)).toBeNull();
  });

  it('returns null when ytInitialPlayerResponse is absent', () => {
    expect(parseArtTrackDescription('<html><body>no json here</body></html>')).toBeNull();
  });

  it('returns null when the JSON is malformed', () => {
    const html = `<html><body><script>var ytInitialPlayerResponse = {bad json</script></body></html>`;
    expect(parseArtTrackDescription(html)).toBeNull();
  });
});

// Helper: embed a description string inside a minimal ytInitialPlayerResponse blob
function buildHtmlWithDescription(description: string): string {
  const json = JSON.stringify({ videoDetails: { shortDescription: description } });
  return `<html><body><script>var ytInitialPlayerResponse = ${json};</script></body></html>`;
}
```

- [ ] **Step 3: Run tests — confirm new tests fail**

```
npm test -- music-attribution
```

- [ ] **Step 4: Implement `parseArtTrackDescription` in `src/core/music-attribution.ts`**

Add after the existing `parseMusicAttribution` export:

```typescript
const YT_INITIAL_PLAYER_RESPONSE_PATTERN = /var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s;
const ART_TRACK_PATTERN = /^Provided to YouTube by .+?\n\n(.+?) · (.+?)\n/m;

export function parseArtTrackDescription(
  html: string,
): { title: string; artist: string } | null {
  const match = html.match(YT_INITIAL_PLAYER_RESPONSE_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) return null;
  const videoDetails = (data as Record<string, unknown>)['videoDetails'];
  if (typeof videoDetails !== 'object' || videoDetails === null) return null;
  const desc = (videoDetails as Record<string, unknown>)['shortDescription'];
  if (typeof desc !== 'string') return null;

  const artMatch = desc.match(ART_TRACK_PATTERN);
  if (!artMatch) return null;

  const title = artMatch[1]?.trim();
  const artist = artMatch[2]?.trim();
  if (!title || !artist) return null;

  return { title, artist };
}
```

- [ ] **Step 5: Extend `VideoPageSignals` in `src/content/music-attribution.ts`**

```typescript
import { parseMusicAttribution, parseArtTrackDescription, type MusicAttribution } from '../core/music-attribution';

export interface VideoPageSignals {
  attribution: MusicAttribution | null;
  artTrack: { title: string; artist: string } | null;
  category: string | null;
}

// In fetchVideoPageSignals, change the return line:
return {
  attribution: parseMusicAttribution(html),
  artTrack: parseArtTrackDescription(html),
  category: parseVideoCategory(html),
};
```

- [ ] **Step 6: Update `tests/content/music-attribution.test.ts`**

Find the existing test that checks `fetchVideoPageSignals` returns
`{ attribution, category }`. Update the expected shape to include
`artTrack: null` (most test HTML won't have a `ytInitialPlayerResponse` blob).
Also add one test that verifies a non-null `artTrack` is returned when the
HTML contains a valid Art Track description.

- [ ] **Step 7: Run all tests + typecheck**

```
npm test && npm run typecheck
```

TypeScript will flag every consumer of `VideoPageSignals` that doesn't
destructure `artTrack` — fix any resulting "object may have additional
properties" or exhaustiveness errors.

- [ ] **Step 8: Commit**

```
git add src/core/music-attribution.ts src/content/music-attribution.ts tests/core/music-attribution.test.ts tests/content/music-attribution.test.ts
git commit -m "feat: parse Art Track description block from ytInitialPlayerResponse"
```

---

## Task 4: Wire Art Track reading into `content/index.ts`

**Files:**
- Modify: `src/content/index.ts`

**Goal:** After `fetchVideoPageSignals()` returns, if `artTrack` is non-null,
add `{ artist: artTrack.artist, track: artTrack.title }` as an alternate
reading in `FetchLyricsRequest`, at the same priority position as the existing
music-attribution reading (i.e., ahead of title-parsed alternates but behind
the primary `{ artist, track }` from title parsing, so the request's primary
`artist`/`track` fields keep their role for the cache re-score and display
header while alternate readings provide the extra signal for the LRCLIB
scorer).

---

- [ ] **Step 1: Locate the `load()` function's `fetchVideoPageSignals` call and reading assembly**

Find in `src/content/index.ts` the block that:
1. Calls `fetchVideoPageSignals(videoId)`
2. Uses the `attribution` result to prepend a reading to the `alternates` list
3. Sends `FETCH_LYRICS`

It will look similar to:

```typescript
const signals = await fetchVideoPageSignals(videoId);
if (gen !== generation) return;

const attributionAlternate = signals.attribution
  ? { artist: signals.attribution.artist, track: signals.attribution.title }
  : null;

const request: FetchLyricsRequest = {
  type: 'FETCH_LYRICS',
  videoId,
  artist: song.artist,
  track: song.track,
  durationSec: song.durationSec,
  alternates: [
    ...(attributionAlternate ? [attributionAlternate] : []),
    ...titleAlternates,
  ],
  skipSearchIfNonMusic: ...,
};
```

(The exact variable names may differ — read the actual code before editing.)

- [ ] **Step 2: Add Art Track reading alongside attribution**

```typescript
const attributionAlternate = signals.attribution
  ? { artist: signals.attribution.artist, track: signals.attribution.title }
  : null;

const artTrackAlternate = signals.artTrack
  ? { artist: signals.artTrack.artist, track: signals.artTrack.title }
  : null;

const request: FetchLyricsRequest = {
  type: 'FETCH_LYRICS',
  // ...
  alternates: [
    ...(attributionAlternate ? [attributionAlternate] : []),
    ...(artTrackAlternate ? [artTrackAlternate] : []),
    ...titleAlternates,
  ],
  // ...
};
```

- [ ] **Step 3: Run all tests + typecheck**

```
npm test && npm run typecheck
```

`content/index.ts` has no unit tests (it's DOM-wiring glue — verified manually
as per this project's established practice). TypeScript will catch any
destructuring mismatches introduced by the `VideoPageSignals` shape change in
Task 3.

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/content/index.ts
git commit -m "feat: add Art Track description as alternate reading in FETCH_LYRICS"
```

---

## Final: acceptance check

Follow the manual acceptance check in the spec:
`docs/superpowers/specs/2026-09-11-odesli-art-track-identification.md`

Run in Opera GX after `npm run build` + reload unpacked.
