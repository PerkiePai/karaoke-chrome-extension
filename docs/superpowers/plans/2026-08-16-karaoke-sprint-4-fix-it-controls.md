# Sprint 4 — Fix-it Controls Implementation Plan

> **For Claude:** Use the `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Add per-video offset nudge with persistence, manual search with candidate picker, and a chrome.storage.local cache that avoids redundant LRCLIB requests on revisits.

**Architecture:**
- Task 1 creates an injectable storage module (`src/background/storage.ts`) with two keyspaces: video-meta (`vm:${videoId}` → `{ lrclibId, offsetSec }`) and lyrics cache (`lc:${id}` + `lc:order` for LRU eviction).
- Task 2 wires the cache into `handleFetchLyrics`: check cache before search, populate on miss, return `lrclibId` and `offsetSec` to the content script.
- Task 3 adds ◀/▶ offset controls to the panel, an `initialOffsetMs` parameter and `setOffsetMs()` to the sync loop, and writes offset changes back to `chrome.storage.local` directly from the content script.
- Task 4 adds two new background message handlers — `SEARCH_CANDIDATES` (search LRCLIB with a raw query, return top 10) and `PICK_CANDIDATE` (cache a manually chosen record and save video meta).
- Task 5 adds the "Not this one?" button, search form, and candidate list to the panel, then wires up all the new callbacks in the content script.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom (panel/sync-loop tests). No new npm dependencies.

---

## Global Constraints

These apply to every task in this sprint — they are not repeated per-task but are always in force.

- **`src/core/` is pure.** Files there never import `chrome.*` and never reference `document`, `window`, or `location`. Storage functions live in `src/background/`, not `src/core/`.
- **Content script bundle must not contain ES module syntax.** `tests/build.test.ts` enforces this. `npm run build` must stay clean.
- **TypeScript `strict: true` with `noUncheckedIndexedAccess: true`.** Every compile must pass `npm run typecheck` without error.
- **Run `npm test` (not `npx vitest`) for all test runs** — the `NODE_OPTIONS=--experimental-require-module` flag in the script is required for jsdom tests on Node 22.11.0.
- **Commit after every task.**
- **Lyrics are untrusted third-party content.** Render all user-supplied and API-supplied text with `textContent` only, never `innerHTML`.
- **`chrome.storage.local` is used directly in `src/content/index.ts`** for offset persistence — this is safe because the extension already has the `"storage"` permission in `public/manifest.json`. Storage management for the lyrics cache is centralized in `src/background/`.

---

## Task 1: Storage module

**Files:**
- Create: `src/background/storage.ts`
- Create: `tests/background/storage.test.ts`

**Goal:** Injectable, unit-testable functions for reading and writing both storage keyspaces. No `chrome.*` imports in the module itself — callers inject a `StorageLike` object. The production caller (`src/background/index.ts`, modified in Task 2) passes `chrome.storage.local`.

---

- [ ] **Step 1: Write the failing tests**

Create `tests/background/storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  readVideoMeta,
  writeVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  type StorageLike,
} from '../../src/background/storage';
import type { LrclibRecord } from '../../src/core/types';

function mockStorage(): StorageLike {
  const store = new Map<string, unknown>();
  return {
    async get(keys) {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store.has(key)) result[key] = store.get(key);
      }
      return result;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    async remove(keys) {
      for (const key of keys) store.delete(key);
    },
  };
}

const baseRecord: LrclibRecord = {
  id: 42,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: '[00:01.00]test line',
};

describe('readVideoMeta / writeVideoMeta', () => {
  it('returns null when nothing is stored for that videoId', async () => {
    const s = mockStorage();
    expect(await readVideoMeta(s, 'abc123')).toBeNull();
  });

  it('round-trips a VideoMeta', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 42, offsetSec: 0.75 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 42, offsetSec: 0.75 });
  });

  it('does not bleed across different videoIds', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0 });
    expect(await readVideoMeta(s, 'xyz789')).toBeNull();
  });

  it('overwrites an existing entry', async () => {
    const s = mockStorage();
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0 });
    await writeVideoMeta(s, 'abc123', { lrclibId: 1, offsetSec: 0.5 });
    expect(await readVideoMeta(s, 'abc123')).toEqual({ lrclibId: 1, offsetSec: 0.5 });
  });
});

describe('readLyricsCache / writeLyricsCache', () => {
  it('returns null on cache miss', async () => {
    const s = mockStorage();
    expect(await readLyricsCache(s, 42)).toBeNull();
  });

  it('round-trips a record', async () => {
    const s = mockStorage();
    await writeLyricsCache(s, 42, baseRecord);
    expect(await readLyricsCache(s, 42)).toEqual(baseRecord);
  });

  it('evicts the least-recently-used entry when max is exceeded', async () => {
    const s = mockStorage();
    const r = (id: number): LrclibRecord => ({ ...baseRecord, id });
    // Write 3 with max=2: r(1) is LRU, should be evicted when r(3) is written
    await writeLyricsCache(s, 1, r(1), 2);
    await writeLyricsCache(s, 2, r(2), 2);
    await writeLyricsCache(s, 3, r(3), 2);
    expect(await readLyricsCache(s, 1)).toBeNull();
    expect(await readLyricsCache(s, 2)).toEqual(r(2));
    expect(await readLyricsCache(s, 3)).toEqual(r(3));
  });

  it('bumps a re-written entry to the front, protecting it from eviction', async () => {
    const s = mockStorage();
    const r = (id: number): LrclibRecord => ({ ...baseRecord, id });
    await writeLyricsCache(s, 1, r(1), 2);
    await writeLyricsCache(s, 2, r(2), 2);
    await writeLyricsCache(s, 1, r(1), 2); // re-access r(1) → moves to front
    await writeLyricsCache(s, 3, r(3), 2); // r(2) is now LRU → evicted
    expect(await readLyricsCache(s, 2)).toBeNull();
    expect(await readLyricsCache(s, 1)).toEqual(r(1));
    expect(await readLyricsCache(s, 3)).toEqual(r(3));
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```
npm test -- --reporter=verbose 2>&1 | Select-String "storage"
```

Expected: import error — `storage.ts` does not exist yet.

- [ ] **Step 3: Implement `src/background/storage.ts`**

```typescript
import type { LrclibRecord } from '../core/types';

export interface StorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface VideoMeta {
  lrclibId: number;
  offsetSec: number;
}

const VM_PREFIX = 'vm:';
const LC_PREFIX = 'lc:';
const LC_ORDER_KEY = 'lc:order';
export const LYRICS_CACHE_MAX = 50;

export async function readVideoMeta(
  storage: StorageLike,
  videoId: string,
): Promise<VideoMeta | null> {
  const key = `${VM_PREFIX}${videoId}`;
  const result = await storage.get([key]);
  const v = result[key];
  if (v != null && typeof v === 'object' && 'lrclibId' in v && 'offsetSec' in v) {
    return v as VideoMeta;
  }
  return null;
}

export async function writeVideoMeta(
  storage: StorageLike,
  videoId: string,
  meta: VideoMeta,
): Promise<void> {
  await storage.set({ [`${VM_PREFIX}${videoId}`]: meta });
}

export async function readLyricsCache(
  storage: StorageLike,
  lrclibId: number,
): Promise<LrclibRecord | null> {
  const key = `${LC_PREFIX}${lrclibId}`;
  const result = await storage.get([key]);
  const v = result[key];
  return v != null ? (v as LrclibRecord) : null;
}

export async function writeLyricsCache(
  storage: StorageLike,
  lrclibId: number,
  record: LrclibRecord,
  maxEntries = LYRICS_CACHE_MAX,
): Promise<void> {
  const idStr = String(lrclibId);
  const orderResult = await storage.get([LC_ORDER_KEY]);
  const order = (orderResult[LC_ORDER_KEY] as string[] | undefined) ?? [];

  const updated = [idStr, ...order.filter((k) => k !== idStr)];

  const writes: Record<string, unknown> = {
    [`${LC_PREFIX}${lrclibId}`]: record,
    [LC_ORDER_KEY]: updated.slice(0, maxEntries),
  };
  await storage.set(writes);

  const evicted = updated.slice(maxEntries);
  if (evicted.length > 0) {
    await storage.remove(evicted.map((k) => `${LC_PREFIX}${k}`));
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```
npm test
```

Expected: all tests pass (the new storage tests + all previously passing tests). Count should be 194 + new storage tests.

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/background/storage.ts tests/background/storage.test.ts
git commit -m "feat: storage module — injectable VideoMeta + LRU lyrics cache functions"
```

---

## Task 2: Cache-backed handleFetchLyrics

**Files:**
- Modify: `src/messaging/types.ts`
- Modify: `src/background/handle-fetch-lyrics.ts`
- Modify: `src/background/index.ts`
- Modify: `tests/background/handle-fetch-lyrics.test.ts`

**Goal:** On a repeat visit to the same video, return the cached record immediately without hitting LRCLIB. On a first visit, populate both cache keyspaces after a successful search. The content script now receives `lrclibId` and `offsetSec` in every successful response.

---

- [ ] **Step 1: Update `src/messaging/types.ts`**

The ok case of `FetchLyricsResponse` gains two new fields. Change:

```typescript
export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
```

To:

```typescript
export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord; lrclibId: number; offsetSec: number }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
```

- [ ] **Step 2: Update tests that check the exact ok-case shape**

In `tests/background/handle-fetch-lyrics.test.ts`, change both `toEqual` calls that assert `{ ok: true, record: ... }` to `toMatchObject` so the extra fields don't break the assertion.

Find and replace:
```typescript
expect(result).toEqual({ ok: true, record: wonderwall });
```
→
```typescript
expect(result).toMatchObject({ ok: true, record: wonderwall });
```

And:
```typescript
expect(result).toEqual({ ok: true, record: thai });
```
→
```typescript
expect(result).toMatchObject({ ok: true, record: thai });
```

Also add these two new describe blocks at the end of the file:

```typescript
describe('handleFetchLyrics — cache behavior', () => {
  const storage = (): StorageLike => {
    const store = new Map<string, unknown>();
    return {
      async get(keys) {
        const r: Record<string, unknown> = {};
        for (const k of keys) { if (store.has(k)) r[k] = store.get(k); }
        return r;
      },
      async set(items) { for (const [k, v] of Object.entries(items)) store.set(k, v); },
      async remove(keys) { for (const k of keys) store.delete(k); },
    };
  };

  it('returns lrclibId and offsetSec in the ok response when no storage is provided', async () => {
    const result = await handleFetchLyrics(request, async () => [wonderwall]);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, offsetSec: 0 });
  });

  it('writes video meta and lyrics cache on a fresh fetch', async () => {
    const s = storage();
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, lrclibId: 99, offsetSec: 0 });
    // verify the cache was written
    const cached = await readLyricsCache(s, 99);
    expect(cached).toEqual(wonderwall);
    const meta = await readVideoMeta(s, 'abc123');
    expect(meta).toEqual({ lrclibId: 99, offsetSec: 0 });
  });

  it('returns from cache on a repeat visit without calling search', async () => {
    const s = storage();
    let calls = 0;
    await handleFetchLyrics(request, async () => { calls++; return [wonderwall]; }, s);
    const result = await handleFetchLyrics(request, async () => { calls++; return [wonderwall]; }, s);
    expect(calls).toBe(1); // second call served from cache
    expect(result).toMatchObject({ ok: true, record: wonderwall });
  });

  it('preserves a previously stored offsetSec on a cache miss (re-search)', async () => {
    const s = storage();
    // First visit: search, cache, offset stays 0
    await handleFetchLyrics(request, async () => [wonderwall], s);
    // Simulate user having set offset manually after the first visit
    await writeVideoMeta(s, 'abc123', { lrclibId: 99, offsetSec: 1.25 });
    // Evict lyrics cache so it falls through to search
    await s.remove(['lc:99']);
    // Second visit: cache miss → re-search → should preserve offsetSec=1.25
    const result = await handleFetchLyrics(request, async () => [wonderwall], s);
    expect(result).toMatchObject({ ok: true, offsetSec: 1.25 });
  });
});
```

You will need to add these imports at the top of the test file:

```typescript
import { readLyricsCache, readVideoMeta, type StorageLike } from '../../src/background/storage';
```

- [ ] **Step 3: Run tests — confirm 2 failures (the two toEqual checks)**

```
npm test
```

Expected: exactly the two changed `toEqual` calls fail with "received extra properties". (They will pass once we switch to `toMatchObject` — but we changed them in Step 2, so they should now pass. The cache tests will fail because `handleFetchLyrics` doesn't accept storage yet.)

Actually: after Step 2, both `toEqual` assertions are already changed to `toMatchObject`, but the test file also adds new cache tests that call `handleFetchLyrics` with 3 args. The new tests will fail because `handleFetchLyrics` doesn't accept a third argument yet AND the ok response doesn't have `lrclibId`/`offsetSec`. Run now to see the failures.

- [ ] **Step 4: Update `src/background/handle-fetch-lyrics.ts`**

Replace the entire file with:

```typescript
import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics, pickBestScored, type ScoredCandidate } from '../core/match-scorer';
import { buildSearchQuery } from '../core/search-query';
import {
  readVideoMeta,
  readLyricsCache,
  writeLyricsCache,
  writeVideoMeta,
  type StorageLike,
} from './storage';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function and an optional storage injection so it can be
 * tested without a network, a browser, or any chrome.* global.
 *
 * With storage: checks the cache before searching and writes back on success.
 * Without storage: behaves identically to the pre-Sprint-4 version.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
  storage?: StorageLike,
): Promise<FetchLyricsResponse> {
  let existingMeta = storage ? await readVideoMeta(storage, request.videoId) : null;

  if (existingMeta) {
    const cached = await readLyricsCache(storage!, existingMeta.lrclibId);
    if (cached) {
      return {
        ok: true,
        record: cached,
        lrclibId: existingMeta.lrclibId,
        offsetSec: existingMeta.offsetSec,
      };
    }
  }

  const readings = [
    { artist: request.artist, track: request.track },
    ...(request.alternates ?? []),
  ];

  const query = buildSearchQuery(request.artist, request.track);

  let candidates: LrclibRecord[];
  try {
    candidates = await search(query);
  } catch (error) {
    if (error instanceof LrclibRateLimitError) {
      return {
        ok: false,
        reason: 'rate-limited',
        message: `Rate limited by lrclib. Try again in ${error.retryAfterSec}s.`,
      };
    }
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : 'Network request failed.',
    };
  }

  const usable = candidates.filter(hasUsableLyrics);

  let best: ScoredCandidate | null = null;
  for (const reading of readings) {
    const scored = pickBestScored(
      { artist: reading.artist, track: reading.track, durationSec: request.durationSec },
      usable,
    );
    if (scored && (best === null || scored.score > best.score)) best = scored;
  }

  if (!best) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  // Preserve any offset the user previously set for this video; default to 0 on first visit.
  const offsetSec = existingMeta?.offsetSec ?? 0;

  if (storage) {
    await writeLyricsCache(storage, best.record.id, best.record);
    await writeVideoMeta(storage, request.videoId, { lrclibId: best.record.id, offsetSec });
  }

  return { ok: true, record: best.record, lrclibId: best.record.id, offsetSec };
}
```

- [ ] **Step 5: Update `src/background/index.ts`**

Replace the entire file with:

```typescript
import { searchLyrics } from '../lrclib/client';
import { handleFetchLyrics } from './handle-fetch-lyrics';
import { writeLyricsCache, writeVideoMeta, type StorageLike } from './storage';
import type { FetchLyricsRequest } from '../messaging/types';

console.log('[karaoke] service worker started');

const storage: StorageLike = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FETCH_LYRICS') {
    void handleFetchLyrics(
      message as FetchLyricsRequest,
      (query) => searchLyrics(query),
      storage,
    ).then(sendResponse);
    return true;
  }
  return false;
});

async function runSmokeTest(): Promise<void> {
  try {
    const results = await searchLyrics('oasis wonderwall');
    const syncedCount = results.filter((r) => r.syncedLyrics).length;
    console.log(
      `[karaoke] SMOKE OK — ${results.length} results, ${syncedCount} with synced lyrics`,
    );
  } catch (error) {
    console.error('[karaoke] SMOKE FAILED —', error);
  }
}
```

- [ ] **Step 6: Run tests — all should pass**

```
npm test
```

Expected: all tests pass. The new cache tests exercise `handleFetchLyrics` with an injected storage. The test for "preserves offsetSec on cache miss" writes video meta manually then evicts the lyrics cache entry.

- [ ] **Step 7: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 8: Update `src/content/index.ts` to read new response fields**

In `src/content/index.ts`, the `load()` function currently uses:

```typescript
const { record } = response;
```

The content script now needs to consume `lrclibId` and `offsetSec` from the response (they will be used in Task 3). For now, just read them and assign to module-scope variables that we will add to the file.

Add to the module-scope variable declarations (near the top, after `let generation = 0;`):

```typescript
/** lrclibId of the record currently displayed; null while no lyrics are shown. */
let currentLrclibId: number | null = null;
/** Offset applied to the sync engine for the current video, in seconds. */
let currentOffsetSec = 0;
```

Add `currentLrclibId = null; currentOffsetSec = 0;` inside `teardown()`, right after `renderedTitle = null;`.

In `load()`, after the `const { record } = response;` destructuring, add:
```typescript
currentLrclibId = response.lrclibId;
currentOffsetSec = response.offsetSec;
```

(The actual use of these variables comes in Task 3; for now they're populated but not yet consumed.)

- [ ] **Step 9: Typecheck the content script**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```
git add src/messaging/types.ts src/background/handle-fetch-lyrics.ts src/background/index.ts src/content/index.ts tests/background/handle-fetch-lyrics.test.ts
git commit -m "feat: cache-backed handleFetchLyrics — check cache first, return lrclibId + offsetSec"
```

---

## Task 3: Offset nudge

**Files:**
- Modify: `src/content/panel.ts`
- Modify: `src/content/panel-styles.ts`
- Modify: `src/content/sync-loop.ts`
- Modify: `src/content/index.ts`
- Modify: `tests/content/panel.test.ts`
- Modify: `tests/content/sync-loop.test.ts`

**Goal:** Two buttons (◀ ▶) let the user shift lyrics earlier or later by 0.25 s per click. The offset is persisted per-video in `chrome.storage.local` and restored when the video is revisited. The sync loop applies the offset to `video.currentTime` before computing the active line.

The offset controls are hidden until synced lyrics are displayed (plain-text and no-lyrics states never show them).

---

- [ ] **Step 1: Extend `PanelHandle` interface and add HTML in `src/content/panel.ts`**

In `panel.ts`, change the `PanelHandle` interface to add two new methods:

```typescript
export interface PanelHandle {
  setHeader(title: string, subtitle: string): void;
  setStatus(message: string): void;
  setLines(lines: LyricLine[]): void;
  setActiveLine(index: number | null, autoScroll: boolean): void;
  onManualScroll(callback: () => void): void;
  /** Shows or hides the ◀ ▶ offset controls and updates the displayed value.
   *  When visible=false the value argument is ignored. */
  setOffsetControls(visible: boolean, offsetSec?: number): void;
  /** Replaces the callback fired when ◀ (delta = -0.25) or ▶ (delta = +0.25) is clicked. */
  onOffsetNudge(callback: (delta: number) => void): void;
  destroy(): void;
}
```

Change the panel's static HTML skeleton in `mountPanel`:

```typescript
  panel.innerHTML = `
    <div class="kx-header">
      <div class="kx-title"></div>
      <div class="kx-subtitle"></div>
    </div>
    <div class="kx-offset kx-hidden">
      <button class="kx-offset-back" title="Shift lyrics earlier (−0.25 s)">◀</button>
      <span class="kx-offset-value">+0.00s</span>
      <button class="kx-offset-fwd" title="Shift lyrics later (+0.25 s)">▶</button>
    </div>
    <div class="kx-status"></div>
    <ol class="kx-lines"></ol>
  `;
```

Add a replaceable slot for the nudge callback (same pattern as `manualScrollListener`):

```typescript
  let offsetNudgeListener: ((delta: number) => void) | null = null;
```

Add event listeners for the two offset buttons (right after the `linesEl` event listeners):

```typescript
  find<HTMLElement>('.kx-offset-back').addEventListener('click', () => {
    offsetNudgeListener?.(-0.25);
  });
  find<HTMLElement>('.kx-offset-fwd').addEventListener('click', () => {
    offsetNudgeListener?.(0.25);
  });
```

Add the two new method implementations to the returned object:

```typescript
    setOffsetControls(visible, offsetSec) {
      const el = find<HTMLElement>('.kx-offset');
      el.classList.toggle('kx-hidden', !visible);
      if (visible && offsetSec !== undefined) {
        const sign = offsetSec >= 0 ? '+' : '';
        find('.kx-offset-value').textContent = `${sign}${offsetSec.toFixed(2)}s`;
      }
    },
    onOffsetNudge(callback) {
      offsetNudgeListener = callback;
    },
```

- [ ] **Step 2: Add offset CSS to `src/content/panel-styles.ts`**

Append to the template literal (before the closing backtick):

```css
  .kx-hidden { display: none !important; }
  .kx-offset {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 2px;
    font-size: 12px;
    color: #aaa;
    border-bottom: 1px solid #303030;
  }
  .kx-offset button {
    background: none;
    border: 1px solid #555;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    padding: 1px 6px;
    font-size: 11px;
    line-height: 1.5;
  }
  .kx-offset button:hover { color: #fff; border-color: #aaa; }
  .kx-offset-value { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Write failing tests for the new panel methods**

Add this describe block to `tests/content/panel.test.ts`, inside the outer `describe('mountPanel', ...)`:

```typescript
  describe('setOffsetControls', () => {
    it('hides the offset bar by default', () => {
      mountPanel(host);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-offset')!;
      expect(el.classList.contains('kx-hidden')).toBe(true);
    });

    it('shows the offset bar with formatted value when visible=true', () => {
      const panel = mountPanel(host);
      panel.setOffsetControls(true, 0.5);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-offset')!;
      expect(el.classList.contains('kx-hidden')).toBe(false);
      expect(shadowOf(host).querySelector('.kx-offset-value')!.textContent).toBe('+0.50s');
    });

    it('formats a negative offset with a minus sign', () => {
      const panel = mountPanel(host);
      panel.setOffsetControls(true, -0.25);
      expect(shadowOf(host).querySelector('.kx-offset-value')!.textContent).toBe('-0.25s');
    });

    it('hides the bar again when called with visible=false', () => {
      const panel = mountPanel(host);
      panel.setOffsetControls(true, 0);
      panel.setOffsetControls(false);
      expect(shadowOf(host).querySelector<HTMLElement>('.kx-offset')!.classList.contains('kx-hidden')).toBe(true);
    });
  });

  describe('onOffsetNudge', () => {
    it('fires the callback with −0.25 when ◀ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onOffsetNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-offset-back')!.click();
      expect(cb).toHaveBeenCalledWith(-0.25);
    });

    it('fires the callback with +0.25 when ▶ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onOffsetNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-offset-fwd')!.click();
      expect(cb).toHaveBeenCalledWith(0.25);
    });

    it('replaces rather than stacks the callback', () => {
      const panel = mountPanel(host);
      const first = vi.fn();
      const second = vi.fn();
      panel.onOffsetNudge(first);
      panel.onOffsetNudge(second);
      shadowOf(host).querySelector<HTMLElement>('.kx-offset-back')!.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 4: Run tests — expect failures for the new offset tests**

```
npm test
```

Expected: the new offset describe blocks fail because the methods don't exist on the `PanelHandle` interface yet. (The `mountPanel` implementation added in Step 1 is already present; the tests should now pass if Step 1 was applied correctly. If Step 1 was done first, these tests may already pass — that is fine.)

- [ ] **Step 5: Update `mockPanel()` in `tests/content/sync-loop.test.ts`**

Add the two new methods so the mock satisfies the full `PanelHandle` interface:

```typescript
function mockPanel(): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    destroy: vi.fn(),
  };
}
```

- [ ] **Step 6: Write failing sync-loop tests for offset**

Add these tests inside the existing `describe('startSyncLoop', ...)` in `tests/content/sync-loop.test.ts`:

```typescript
  it('applies an initial offset: currentTime=0.4s + offset=700ms puts line 1 active', () => {
    const v = video();
    const panel = mockPanel();
    // LINES: line 0 at 0ms, line 1 at 1000ms
    // effectiveMs = 0.4*1000 + 700 = 1100 → line 1
    startSyncLoop(v, panel, LINES, 700);
    v.dispatchEvent(new Event('seeked'));
    expect(panel.setActiveLine).toHaveBeenCalledWith(1, true);
  });

  it('setOffsetMs updates the effective time and triggers an immediate apply', () => {
    const v = video();
    const panel = mockPanel();
    const handle = startSyncLoop(v, panel, LINES);
    Object.defineProperty(v, 'currentTime', { value: 0.4, configurable: true });
    v.dispatchEvent(new Event('seeked'));
    // Without offset: 400ms → line 0 still active (timeMs[0]=0, timeMs[1]=1000)
    vi.clearAllMocks();
    // Now shift by 700ms: 400 + 700 = 1100ms → line 1
    handle.setOffsetMs(700);
    expect(panel.setActiveLine).toHaveBeenCalledWith(1, true);
  });
```

- [ ] **Step 7: Run tests — expect the two new sync-loop tests to fail**

```
npm test
```

Expected: `startSyncLoop` does not yet accept a 4th argument and `SyncLoopHandle` has no `setOffsetMs`.

- [ ] **Step 8: Update `src/content/sync-loop.ts`**

Replace the entire file:

```typescript
import type { LyricLine } from '../core/types';
import type { PanelHandle } from './panel';
import { createSyncEngineState, tick, notifyManualScroll } from './sync-engine';

export interface SyncLoopHandle {
  stop(): void;
  /** Updates the offset applied to video.currentTime before computing the active line.
   *  Triggers an immediate recompute so the panel reflects the change without waiting
   *  for the next animation frame. */
  setOffsetMs(ms: number): void;
}

export function startSyncLoop(
  video: HTMLVideoElement,
  panel: PanelHandle,
  lines: LyricLine[],
  initialOffsetMs = 0,
): SyncLoopHandle {
  const state = createSyncEngineState();
  let offsetMs = initialOffsetMs;
  let rafId: number | null = null;

  function apply(): void {
    const result = tick(state, lines, video.currentTime * 1000 + offsetMs, Date.now());
    if (result) panel.setActiveLine(result.index, result.autoScroll);
  }

  function frame(): void {
    apply();
    rafId = requestAnimationFrame(frame);
  }

  function handlePlay(): void {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function handlePause(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function handleManualScroll(): void {
    notifyManualScroll(state, Date.now());
  }

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeked', apply);
  panel.onManualScroll(handleManualScroll);

  apply();
  if (!video.paused) handlePlay();

  return {
    stop() {
      handlePause();
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', apply);
      panel.onManualScroll(() => {});
    },
    setOffsetMs(ms) {
      offsetMs = ms;
      apply();
    },
  };
}
```

- [ ] **Step 9: Run tests — all should pass**

```
npm test
```

Expected: all tests pass including the two new sync-loop offset tests.

- [ ] **Step 10: Wire offset into `src/content/index.ts`**

The content script already has `currentLrclibId` and `currentOffsetSec` from Task 2 Step 8. Now add:

1. Add `currentSyncLoop: SyncLoopHandle | null = null` to module-scope declarations. Import `SyncLoopHandle` from `./sync-loop`.

2. In `teardown()`, add `currentSyncLoop = null;`.

3. In `load()`, find the section that starts the sync loop:
   ```typescript
   const syncLoop: SyncLoopHandle = startSyncLoop(video, panel, plan.lines);
   addDisposer(syncLoop.stop);
   ```
   
   Change to:
   ```typescript
   const syncLoop = startSyncLoop(video, panel, plan.lines, currentOffsetSec * 1000);
   currentSyncLoop = syncLoop;
   addDisposer(() => { syncLoop.stop(); currentSyncLoop = null; });
   panel.setOffsetControls(true, currentOffsetSec);
   ```

4. Immediately after `mountPanel(container)` in `activate()`, register the offset nudge callback once per panel lifetime:
   ```typescript
   panel.onOffsetNudge((delta) => {
     currentOffsetSec += delta;
     // Clamp to a reasonable range to prevent runaway offsets.
     currentOffsetSec = Math.max(-30, Math.min(30, currentOffsetSec));
     currentSyncLoop?.setOffsetMs(currentOffsetSec * 1000);
     panel!.setOffsetControls(true, currentOffsetSec);
     if (currentVideoId !== null && currentLrclibId !== null) {
       void chrome.storage.local.set({
         [`vm:${currentVideoId}`]: { lrclibId: currentLrclibId, offsetSec: currentOffsetSec },
       });
     }
   });
   ```

   Note: this registration must happen immediately after `mountPanel`, before `load()` is called, so the callback is in place before any nudge could fire.

5. For completeness, when the lyrics fetch fails or returns plain text (no sync), ensure offset controls are hidden:

   In the `!response.ok` branch:
   ```typescript
   panel.setOffsetControls(false);
   ```

   After `panel.setLines(plan.lines)` in the success branch, but *before* the synced check, remove the `panel.setOffsetControls(true, ...)` call from the sync loop block (we already added it there) — it should only appear when `plan.synced` is true, so move it inside the `if (plan.synced && video)` block.

   When `plan.synced` is false, add:
   ```typescript
   panel.setOffsetControls(false);
   ```

- [ ] **Step 11: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: both pass cleanly.

- [ ] **Step 12: Run full test suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 13: Commit**

```
git add src/content/panel.ts src/content/panel-styles.ts src/content/sync-loop.ts src/content/index.ts tests/content/panel.test.ts tests/content/sync-loop.test.ts
git commit -m "feat: offset nudge — ◀▶ buttons in panel, sync loop offset, persistent per-video"
```

---

## Task 4: SEARCH_CANDIDATES and PICK_CANDIDATE handlers

**Files:**
- Modify: `src/messaging/types.ts`
- Create: `src/background/handle-search-candidates.ts`
- Modify: `src/background/index.ts`
- Create: `tests/background/handle-search-candidates.test.ts`

**Goal:** Two new message types. `SEARCH_CANDIDATES` takes a raw user query string, calls `searchLyrics`, filters by `hasUsableLyrics`, and returns up to 10 results. `PICK_CANDIDATE` takes a manually chosen `LrclibRecord` plus `videoId`, caches the record, and saves the video-meta pointing to it.

---

- [ ] **Step 1: Add new types to `src/messaging/types.ts`**

Append to the file:

```typescript
export interface SearchCandidatesRequest {
  type: 'SEARCH_CANDIDATES';
  /** Raw user-typed query, passed verbatim to lrclib /search?q= */
  query: string;
}

export type SearchCandidatesResponse =
  | { ok: true; candidates: LrclibRecord[] }
  | { ok: false; reason: 'rate-limited' | 'network'; message: string };

export interface PickCandidateRequest {
  type: 'PICK_CANDIDATE';
  videoId: string;
  record: LrclibRecord;
}

export type PickCandidateResponse = { ok: true };
```

Also add `import type { LrclibRecord } from '../core/types';` at the top of `messaging/types.ts` (it already imports `LrclibRecord` via `FetchLyricsResponse` — check first; if already present, do not add a duplicate).

Actually, looking at the current file — `LrclibRecord` is already imported there via `FetchLyricsResponse`. Verify and do not duplicate the import.

- [ ] **Step 2: Write failing tests for `handleSearchCandidates`**

Create `tests/background/handle-search-candidates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { handleSearchCandidates } from '../../src/background/handle-search-candidates';
import { LrclibRateLimitError } from '../../src/lrclib/client';
import type { LrclibRecord } from '../../src/core/types';

const base: LrclibRecord = {
  id: 1,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

describe('handleSearchCandidates', () => {
  it('returns candidates from the search results', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'wonderwall oasis' },
      async () => [base],
    );
    expect(result).toEqual({ ok: true, candidates: [base] });
  });

  it('filters out records with no usable lyrics', async () => {
    const noLyrics: LrclibRecord = { ...base, id: 2, plainLyrics: null, syncedLyrics: null };
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'wonderwall' },
      async () => [noLyrics, base],
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.id).toBe(1);
  });

  it('caps the result list at 10 entries', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...base, id: i + 1 }));
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => many,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.candidates).toHaveLength(10);
  });

  it('passes the raw query string to search without modification', async () => {
    const captured: string[] = [];
    await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'คืนจันทร์ loso' },
      async (q) => { captured.push(q); return [base]; },
    );
    expect(captured).toEqual(['คืนจันทร์ loso']);
  });

  it('reports rate-limited', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => { throw new LrclibRateLimitError(30); },
    );
    expect(result).toMatchObject({ ok: false, reason: 'rate-limited' });
  });

  it('reports a network error', async () => {
    const result = await handleSearchCandidates(
      { type: 'SEARCH_CANDIDATES', query: 'test' },
      async () => { throw new Error('offline'); },
    );
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });
});
```

- [ ] **Step 3: Run tests — expect import error**

```
npm test
```

Expected: `handle-search-candidates.ts` does not exist yet — import fails.

- [ ] **Step 4: Implement `src/background/handle-search-candidates.ts`**

```typescript
import { LrclibRateLimitError } from '../lrclib/client';
import { hasUsableLyrics } from '../core/match-scorer';
import type { LrclibRecord } from '../core/types';
import type { SearchCandidatesRequest, SearchCandidatesResponse } from '../messaging/types';

const MAX_CANDIDATES = 10;

export async function handleSearchCandidates(
  request: SearchCandidatesRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
): Promise<SearchCandidatesResponse> {
  let results: LrclibRecord[];
  try {
    results = await search(request.query);
  } catch (error) {
    if (error instanceof LrclibRateLimitError) {
      return {
        ok: false,
        reason: 'rate-limited',
        message: `Rate limited by lrclib. Try again in ${error.retryAfterSec}s.`,
      };
    }
    return {
      ok: false,
      reason: 'network',
      message: error instanceof Error ? error.message : 'Network request failed.',
    };
  }

  return {
    ok: true,
    candidates: results.filter(hasUsableLyrics).slice(0, MAX_CANDIDATES),
  };
}
```

- [ ] **Step 5: Run tests — all should pass**

```
npm test
```

Expected: all tests pass including the six new search-candidates tests.

- [ ] **Step 6: Wire both new handlers into `src/background/index.ts`**

Add imports at the top:

```typescript
import { handleSearchCandidates } from './handle-search-candidates';
import type {
  FetchLyricsRequest,
  SearchCandidatesRequest,
  PickCandidateRequest,
  PickCandidateResponse,
} from '../messaging/types';
```

Replace the `onMessage.addListener` with:

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FETCH_LYRICS') {
    void handleFetchLyrics(
      message as FetchLyricsRequest,
      (query) => searchLyrics(query),
      storage,
    ).then(sendResponse);
    return true;
  }

  if (message?.type === 'SEARCH_CANDIDATES') {
    void handleSearchCandidates(
      message as SearchCandidatesRequest,
      (query) => searchLyrics(query),
    ).then(sendResponse);
    return true;
  }

  if (message?.type === 'PICK_CANDIDATE') {
    const req = message as PickCandidateRequest;
    void (async () => {
      await writeLyricsCache(storage, req.record.id, req.record);
      await writeVideoMeta(storage, req.videoId, { lrclibId: req.record.id, offsetSec: 0 });
      sendResponse({ ok: true } satisfies PickCandidateResponse);
    })();
    return true;
  }

  return false;
});
```

- [ ] **Step 7: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: both succeed cleanly.

- [ ] **Step 8: Commit**

```
git add src/messaging/types.ts src/background/handle-search-candidates.ts src/background/index.ts tests/background/handle-search-candidates.test.ts
git commit -m "feat: SEARCH_CANDIDATES + PICK_CANDIDATE background handlers"
```

---

## Task 5: Manual search panel UI and content script wiring

**Files:**
- Modify: `src/content/panel.ts`
- Modify: `src/content/panel-styles.ts`
- Modify: `src/content/index.ts`
- Modify: `tests/content/panel.test.ts`

**Goal:** A "Not this one?" button appears in the panel header after lyrics load. Clicking it reveals a pre-filled search form. Submitting the form sends `SEARCH_CANDIDATES` and shows a candidate list. Clicking a candidate re-renders lyrics, resets the offset, and sends `PICK_CANDIDATE` to background.

---

- [ ] **Step 1: Extend `PanelHandle` with search UI methods**

Add to the `PanelHandle` interface in `src/content/panel.ts`:

```typescript
  /** Shows or hides the "Not this one?" button. */
  showCorrectBar(visible: boolean): void;
  /** Pre-fills the search input with `query` and shows the search form. Hides any existing candidate list. */
  enterSearchMode(query: string): void;
  /** Renders the candidate list and hides the search form. Empty array hides the list. */
  showCandidates(candidates: import('../core/types').LrclibRecord[]): void;
  /** Hides both the search form and the candidate list. */
  exitSearchMode(): void;
  /** Fires when user clicks "Not this one?". */
  onCorrectRequest(callback: () => void): void;
  /** Fires when user submits the search form. */
  onSearch(callback: (query: string) => void): void;
  /** Fires when user clicks a candidate. */
  onCandidatePick(callback: (record: import('../core/types').LrclibRecord) => void): void;
```

- [ ] **Step 2: Update the panel HTML skeleton**

Change the `panel.innerHTML` assignment to include the new elements after the `kx-offset` div and before `kx-status`:

```typescript
  panel.innerHTML = `
    <div class="kx-header">
      <div class="kx-title"></div>
      <div class="kx-subtitle"></div>
    </div>
    <div class="kx-offset kx-hidden">
      <button class="kx-offset-back" title="Shift lyrics earlier (−0.25 s)">◀</button>
      <span class="kx-offset-value">+0.00s</span>
      <button class="kx-offset-fwd" title="Shift lyrics later (+0.25 s)">▶</button>
    </div>
    <div class="kx-correct-bar kx-hidden">
      <button class="kx-not-this">Not this one?</button>
    </div>
    <form class="kx-search-form kx-hidden" autocomplete="off">
      <input class="kx-search-input" type="text" placeholder="Artist and song title…">
      <button type="submit" class="kx-search-btn">Search</button>
    </form>
    <ol class="kx-candidates kx-hidden"></ol>
    <div class="kx-status"></div>
    <ol class="kx-lines"></ol>
  `;
```

- [ ] **Step 3: Add callback slots and event wiring**

In `mountPanel`, after the existing `let manualScrollListener` and `let offsetNudgeListener` declarations, add:

```typescript
  let correctRequestListener: (() => void) | null = null;
  let searchListener: ((query: string) => void) | null = null;
  let candidatePickListener: ((record: LrclibRecord) => void) | null = null;
```

Add event listeners (after the existing offset button listeners):

```typescript
  find<HTMLElement>('.kx-not-this').addEventListener('click', () => {
    correctRequestListener?.();
  });

  find<HTMLFormElement>('.kx-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = find<HTMLInputElement>('.kx-search-input').value.trim();
    if (q) searchListener?.(q);
  });
```

Note: `LrclibRecord` must be imported at the top of `panel.ts`. Add:
```typescript
import type { LyricLine, LrclibRecord } from '../core/types';
```
(Replace the existing `import type { LyricLine }` line.)

- [ ] **Step 4: Implement the new PanelHandle methods**

Add to the returned object (alongside `setOffsetControls`, etc.):

```typescript
    showCorrectBar(visible) {
      find<HTMLElement>('.kx-correct-bar').classList.toggle('kx-hidden', !visible);
    },
    enterSearchMode(query) {
      find<HTMLInputElement>('.kx-search-input').value = query;
      find<HTMLElement>('.kx-search-form').classList.remove('kx-hidden');
      find<HTMLElement>('.kx-candidates').classList.add('kx-hidden');
    },
    showCandidates(candidates) {
      const listEl = find<HTMLElement>('.kx-candidates');
      if (candidates.length === 0) {
        listEl.classList.add('kx-hidden');
        return;
      }
      listEl.replaceChildren(
        ...candidates.map((record) => {
          const li = document.createElement('li');
          li.className = 'kx-candidate';
          const title = document.createElement('span');
          title.className = 'kx-candidate-title';
          title.textContent = record.trackName;
          const sub = document.createElement('span');
          sub.className = 'kx-candidate-sub';
          sub.textContent = record.artistName;
          li.append(title, sub);
          li.addEventListener('click', () => candidatePickListener?.(record));
          return li;
        }),
      );
      listEl.classList.remove('kx-hidden');
      find<HTMLElement>('.kx-search-form').classList.add('kx-hidden');
    },
    exitSearchMode() {
      find<HTMLElement>('.kx-search-form').classList.add('kx-hidden');
      find<HTMLElement>('.kx-candidates').classList.add('kx-hidden');
    },
    onCorrectRequest(callback) {
      correctRequestListener = callback;
    },
    onSearch(callback) {
      searchListener = callback;
    },
    onCandidatePick(callback) {
      candidatePickListener = callback;
    },
```

- [ ] **Step 5: Add search UI CSS to `src/content/panel-styles.ts`**

Append before the closing backtick:

```css
  .kx-correct-bar {
    padding: 4px 0;
    border-bottom: 1px solid #303030;
  }
  .kx-not-this {
    background: none;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .kx-not-this:hover { color: #aaa; }
  .kx-search-form {
    display: flex;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid #303030;
  }
  .kx-search-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #555;
    border-radius: 4px;
    color: #f1f1f1;
    font-size: 12px;
    padding: 3px 6px;
    outline: none;
  }
  .kx-search-input:focus { border-color: #888; }
  .kx-search-btn {
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #f1f1f1;
    cursor: pointer;
    font-size: 11px;
    padding: 3px 8px;
  }
  .kx-search-btn:hover { background: #444; }
  .kx-candidates {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 160px;
    overflow-y: auto;
    border-bottom: 1px solid #303030;
  }
  .kx-candidate {
    cursor: pointer;
    padding: 4px 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .kx-candidate:hover { background: #1a1a1a; }
  .kx-candidate-title { font-size: 13px; color: #f1f1f1; }
  .kx-candidate-sub { font-size: 11px; color: #888; }
```

- [ ] **Step 6: Write failing tests for the new panel methods**

Add this describe block to `tests/content/panel.test.ts`:

```typescript
  describe('search UI', () => {
    it('hides the correct-bar, search form, and candidate list by default', () => {
      mountPanel(host);
      const shadow = shadowOf(host);
      expect(shadow.querySelector<HTMLElement>('.kx-correct-bar')!.classList.contains('kx-hidden')).toBe(true);
      expect(shadow.querySelector<HTMLElement>('.kx-search-form')!.classList.contains('kx-hidden')).toBe(true);
      expect(shadow.querySelector<HTMLElement>('.kx-candidates')!.classList.contains('kx-hidden')).toBe(true);
    });

    it('showCorrectBar(true) reveals the "Not this one?" button', () => {
      const panel = mountPanel(host);
      panel.showCorrectBar(true);
      expect(shadowOf(host).querySelector<HTMLElement>('.kx-correct-bar')!.classList.contains('kx-hidden')).toBe(false);
    });

    it('onCorrectRequest fires when "Not this one?" is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onCorrectRequest(cb);
      panel.showCorrectBar(true);
      shadowOf(host).querySelector<HTMLElement>('.kx-not-this')!.click();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('enterSearchMode pre-fills the input and shows the form', () => {
      const panel = mountPanel(host);
      panel.enterSearchMode('Wonderwall Oasis');
      const shadow = shadowOf(host);
      expect(shadow.querySelector<HTMLInputElement>('.kx-search-input')!.value).toBe('Wonderwall Oasis');
      expect(shadow.querySelector<HTMLElement>('.kx-search-form')!.classList.contains('kx-hidden')).toBe(false);
    });

    it('onSearch fires with the trimmed query when the form is submitted', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onSearch(cb);
      panel.enterSearchMode('Wonderwall');
      const form = shadowOf(host).querySelector<HTMLFormElement>('.kx-search-form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true }));
      expect(cb).toHaveBeenCalledWith('Wonderwall');
    });

    it('showCandidates renders one list item per record', () => {
      const panel = mountPanel(host);
      const records: LrclibRecord[] = [
        { id: 1, trackName: 'Wonderwall', artistName: 'Oasis', albumName: null, duration: 258, instrumental: false, plainLyrics: null, syncedLyrics: '[00:01.00]x' },
        { id: 2, trackName: 'Champagne Supernova', artistName: 'Oasis', albumName: null, duration: 400, instrumental: false, plainLyrics: null, syncedLyrics: '[00:01.00]x' },
      ];
      panel.showCandidates(records);
      expect(shadowOf(host).querySelectorAll('.kx-candidate')).toHaveLength(2);
    });

    it('onCandidatePick fires with the record when a candidate is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onCandidatePick(cb);
      const record: LrclibRecord = { id: 1, trackName: 'Wonderwall', artistName: 'Oasis', albumName: null, duration: 258, instrumental: false, plainLyrics: null, syncedLyrics: '[00:01.00]x' };
      panel.showCandidates([record]);
      shadowOf(host).querySelector<HTMLElement>('.kx-candidate')!.click();
      expect(cb).toHaveBeenCalledWith(record);
    });

    it('exitSearchMode hides both the form and the candidate list', () => {
      const panel = mountPanel(host);
      panel.enterSearchMode('test');
      panel.exitSearchMode();
      const shadow = shadowOf(host);
      expect(shadow.querySelector<HTMLElement>('.kx-search-form')!.classList.contains('kx-hidden')).toBe(true);
      expect(shadow.querySelector<HTMLElement>('.kx-candidates')!.classList.contains('kx-hidden')).toBe(true);
    });
  });
```

You also need to add `LrclibRecord` to the import at the top of the test file:

```typescript
import type { LyricLine, LrclibRecord } from '../../src/core/types';
```

(Replace the existing `import type { LyricLine }` line.)

- [ ] **Step 7: Update `mockPanel()` in `tests/content/sync-loop.test.ts`**

Add the seven new methods so the mock still satisfies `PanelHandle`:

```typescript
function mockPanel(): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    showCorrectBar: vi.fn(),
    enterSearchMode: vi.fn(),
    showCandidates: vi.fn(),
    exitSearchMode: vi.fn(),
    onCorrectRequest: vi.fn(),
    onSearch: vi.fn(),
    onCandidatePick: vi.fn(),
    destroy: vi.fn(),
  };
}
```

- [ ] **Step 8: Run tests — expect the new search-UI panel tests to fail**

```
npm test
```

Expected: failing tests for `showCorrectBar`, `enterSearchMode`, etc. because those methods are not implemented yet. The `sync-loop.test.ts` tests should still pass (mock now has all methods).

After running: verify that only the new panel tests in the `search UI` describe block are failing, and the sync-loop tests remain green.

- [ ] **Step 9: Run tests after implementation — all should pass**

If the implementation in Steps 1–5 was done before writing the tests (which is fine), run again to confirm all tests pass:

```
npm test
```

Expected: all tests pass.

- [ ] **Step 10: Wire manual search into `src/content/index.ts`**

Add the following imports (or update the existing messaging import):

```typescript
import type {
  FetchLyricsRequest,
  FetchLyricsResponse,
  SearchCandidatesRequest,
  SearchCandidatesResponse,
  PickCandidateRequest,
  PickCandidateResponse,
} from '../messaging/types';
```

In `activate()`, after the `panel.onOffsetNudge(...)` callback registration (from Task 3), add:

```typescript
  panel.onCorrectRequest(() => {
    // Pre-fill with the currently displayed track + artist, if we have them.
    const prefilledQuery =
      currentRecord !== null
        ? [currentRecord.trackName, currentRecord.artistName].filter(Boolean).join(' ')
        : '';
    panel!.enterSearchMode(prefilledQuery);
  });

  panel.onSearch(async (query) => {
    panel!.setStatus('Searching…');
    let resp: SearchCandidatesResponse;
    try {
      resp = await chrome.runtime.sendMessage<SearchCandidatesRequest, SearchCandidatesResponse>({
        type: 'SEARCH_CANDIDATES',
        query,
      });
    } catch {
      panel!.setStatus('Search failed. Is the extension worker running?');
      return;
    }
    if (!resp.ok) {
      panel!.setStatus(resp.message);
      panel!.exitSearchMode();
      return;
    }
    if (resp.candidates.length === 0) {
      panel!.setStatus('No results found. Try different keywords.');
      return;
    }
    panel!.setStatus('');
    panel!.showCandidates(resp.candidates);
  });

  panel.onCandidatePick((record) => {
    panel!.exitSearchMode();
    panel!.showCorrectBar(true);
    panel!.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);
    disposeAll();
    panel!.setStatus(plan.status);
    panel!.setLines(plan.lines);

    currentLrclibId = record.id;
    currentRecord = record;
    currentOffsetSec = 0; // reset offset when user manually picks a different song

    if (plan.synced) {
      panel!.setOffsetControls(true, 0);
      const video = document.querySelector('video');
      if (video) {
        const loop = startSyncLoop(video, panel!, plan.lines, 0);
        currentSyncLoop = loop;
        addDisposer(() => { loop.stop(); currentSyncLoop = null; });
      }
    } else {
      panel!.setOffsetControls(false);
    }

    if (currentVideoId !== null) {
      void chrome.runtime.sendMessage<PickCandidateRequest, PickCandidateResponse>({
        type: 'PICK_CANDIDATE',
        videoId: currentVideoId,
        record,
      });
    }
  });
```

You also need to add a module-scope variable for the currently displayed record:

```typescript
/** The LrclibRecord currently shown; null while no lyrics are loaded. */
let currentRecord: import('../core/types').LrclibRecord | null = null;
```

And clear it in `teardown()`:

```typescript
  currentRecord = null;
```

And set it in `load()`, right after `currentLrclibId = response.lrclibId`:

```typescript
    currentRecord = response.record;
```

Also, after the `FetchLyricsResponse` success branch that renders lyrics, add:

```typescript
    panel.showCorrectBar(true);
```

(So "Not this one?" appears whenever lyrics are successfully displayed.)

And remove `panel.showCorrectBar(false)` is not needed in teardown since `mountPanel` always creates a fresh panel.

- [ ] **Step 11: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: both pass cleanly.

- [ ] **Step 12: Run full test suite**

```
npm test
```

Expected: all tests pass. Verify the total count — Task 1 adds ~8, Task 2 adds ~4, Task 3 adds ~7, Task 4 adds ~6, Task 5 adds ~7 tests (approximate).

- [ ] **Step 13: Commit**

```
git add src/content/panel.ts src/content/panel-styles.ts src/content/index.ts tests/content/panel.test.ts tests/content/sync-loop.test.ts
git commit -m "feat: manual search — Not this one? button, search form, candidate picker"
```

---

## Sprint 4 acceptance check

*Verify in Opera GX after `npm run build` and reloading the extension at `opera://extensions`:*

1. **Offset nudge:** Open a music video where the lyrics are slightly out of sync. Click ▶ a few times to shift them later. The highlighted line should shift accordingly in real time. Navigate to another video and back — the offset should be restored to the adjusted value.

2. **Correct controls visible:** After lyrics load, the "Not this one?" button and the ◀ ▶ offset controls should both be visible in the panel.

3. **Manual search:** Click "Not this one?" — the search form should appear pre-filled with the current song's name. Type a different query and submit. A list of up to 10 candidates should appear. Click one — the lyrics panel should update to show that song's lyrics.

4. **Cache:** Open a song for the first time (watch the service worker console for the LRCLIB network request). Navigate away and back. The worker console should show **no** new LRCLIB request — lyrics came from cache. Reload should also use the cache.

5. **Offset persistence after manual pick:** After manually picking a different song in step 3, navigate away and return. The manually chosen song should still be shown (not the auto-detected one).

---

## Execution options

**Plan complete and saved to `docs/superpowers/plans/2026-08-16-karaoke-sprint-4-fix-it-controls.md`.**

**Option 1 — Subagent-Driven (this session):** I dispatch a fresh subagent per task, review between tasks, and proceed in fast iteration. Tasks are mostly independent, so this works well here.

**Option 2 — Parallel Session:** Open a new session in this worktree, use the `executing-plans` skill, and execute in batches with review checkpoints.

**Which approach?**
