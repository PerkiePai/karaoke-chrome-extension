# YouTube Karaoke Lyrics — Sprints 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 browser extension that loads unpacked in Opera GX, mounts a panel beside YouTube videos, identifies the song playing, and displays its lyrics as static text.

**Architecture:** A content script owns the DOM, the panel, and song detection. A service worker owns all network access to LRCLIB and answers the content script over `chrome.runtime` messages. Three pure modules — LRC parser, title normalizer, match scorer — hold the real logic, import nothing from `chrome.*` or the DOM, and carry all the automated tests.

**Tech Stack:** TypeScript, Vite (two IIFE builds), Vitest, jsdom. No UI framework.

**Spec:** `docs/superpowers/specs/2026-08-15-youtube-karaoke-lyrics-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Manifest V3.** Target browser is Opera GX (Chromium), loaded unpacked from `dist/` via `opera://extensions` with Developer mode on.
- **`src/core/` is pure.** Files there must never import `chrome.*` and never reference `document`, `window`, or `location`. This is what makes them testable and it is the single most important structural rule in the project.
- **All network access lives in the service worker.** The content script never calls `fetch` directly.
- **Content script output must contain no ES module syntax.** MV3 content scripts are classic scripts; a stray `import`/`export` makes injection fail silently. Task 1 adds a test that enforces this.
- **Lyrics are third-party content.** Render them with `textContent` only. Never `innerHTML` with any string that came from LRCLIB.
- **Thai text:** normalize with Unicode NFC and collapse whitespace/punctuation. Never fold tone marks.
- **LRCLIB API base:** `https://lrclib.net/api`. Send a `Lrclib-Client` header identifying this extension. Honor `retry-after` on HTTP 429.
- **`minify: false`** in all builds — debuggability in Opera GX devtools matters more than bundle size for a personal extension.
- **TypeScript `strict: true`** with `noUncheckedIndexedAccess: true`.
- **Commit after every task.**

---

# Sprint 1 — Loads and lives

Goal: a build that installs in Opera GX, proves LRCLIB is reachable from the service worker, and mounts a panel that survives YouTube's SPA navigation.

---

### Task 1: Project scaffold and verified build output

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `public/manifest.json`
- Create: `src/content/index.ts`, `src/background/index.ts`
- Test: `tests/build.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` emitting `dist/content.js`, `dist/background.js`, `dist/manifest.json`. `npm test` running Vitest. `npm run typecheck` running `tsc --noEmit`.

- [ ] **Step 1: Initialize the package and install dependencies**

Run in the project root:

```bash
npm init -y
npm install -D vite typescript vitest jsdom cross-env @types/chrome @types/node
```

`cross-env` is required because the build passes a `TARGET` environment variable, and `TARGET=x command` is Bash syntax that does not work in PowerShell.

`@types/node` is required because `vite.config.ts` and the build test use `node:path`, `node:fs`, `process` and `__dirname`. Without it `tsc --noEmit` fails even though the build itself succeeds.

- [ ] **Step 2: Write `package.json`**

Replace the generated file with:

```json
{
  "name": "karaoke-chrome-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:content": "cross-env TARGET=content vite build",
    "build:background": "cross-env TARGET=background vite build",
    "build": "npm run build:content && npm run build:background",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Leave the `devDependencies` block that `npm install` generated exactly as it is.

The two builds run in order on purpose: the content build wipes `dist/` and copies `public/`, then the background build adds to it without wiping. That ordering is enforced in `vite.config.ts` in the next step.

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const target = process.env.TARGET;

if (target !== 'content' && target !== 'background') {
  throw new Error(`TARGET must be "content" or "background", got: ${String(target)}`);
}

export default defineConfig({
  // Only the content build copies public/ and clears dist/, so the
  // background build that runs after it does not wipe the output.
  publicDir: target === 'content' ? 'public' : false,
  build: {
    outDir: 'dist',
    emptyOutDir: target === 'content',
    // Readable output in Opera GX devtools is worth more than bytes here.
    minify: false,
    target: 'chrome110',
    lib: {
      entry: resolve(__dirname, `src/${target}/index.ts`),
      // IIFE guarantees no import/export survives into the bundle, which
      // is mandatory for MV3 content scripts.
      formats: ['iife'],
      name: target === 'content' ? 'KaraokeContent' : 'KaraokeBackground',
      fileName: () => `${target}.js`,
    },
  },
});
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

This file must exist. Vitest prefers `vitest.config.ts` over `vite.config.ts`, and `vite.config.ts` throws when `TARGET` is unset — so without this file, every test run would fail.

- [ ] **Step 5: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["chrome", "node"],
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6: Write `.gitignore`**

```gitignore
node_modules/
dist/
```

- [ ] **Step 7: Write the failing build test**

Create `tests/build.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (file: string) => resolve(process.cwd(), 'dist', file);

describe('extension build output', () => {
  it('emits content.js, background.js and manifest.json', () => {
    expect(existsSync(dist('content.js'))).toBe(true);
    expect(existsSync(dist('background.js'))).toBe(true);
    expect(existsSync(dist('manifest.json'))).toBe(true);
  });

  it('emits a content script free of ES module syntax', () => {
    // MV3 content scripts are classic scripts. A stray import/export makes
    // Chromium refuse to inject them, with no useful error in the console.
    const code = readFileSync(dist('content.js'), 'utf8');
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/^\s*export\s/m);
  });

  it('declares manifest v3 and the lrclib host permission', () => {
    const manifest = JSON.parse(readFileSync(dist('manifest.json'), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toContain('https://lrclib.net/*');
    expect(manifest.background.service_worker).toBe('background.js');
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `dist/` does not exist yet, so `existsSync` returns `false`.

- [ ] **Step 9: Write `public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "YouTube Karaoke Lyrics",
  "version": "0.1.0",
  "description": "Time-synced lyrics beside YouTube music videos.",
  "permissions": ["storage"],
  "host_permissions": ["https://lrclib.net/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Note there is no `"type": "module"` on the background entry. The worker is built as IIFE, so it must be registered as a classic script.

- [ ] **Step 10: Write the two entry stubs**

Create `src/content/index.ts`:

```ts
console.log('[karaoke] content script loaded on', location.href);
```

Create `src/background/index.ts`:

```ts
console.log('[karaoke] service worker started');
```

- [ ] **Step 11: Build, test, and typecheck**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds; all three tests PASS; `tsc --noEmit` reports no errors.

All three must pass. A green build with a failing `typecheck` is a failed step — the build tool does not typecheck, so `tsc` is the only thing checking the types this project relies on.

- [ ] **Step 12: Verify it loads in Opera GX**

Manual check — do not skip, this is the point of the sprint:

1. Open `opera://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
4. The extension appears with no red error badge.
5. Open any YouTube video page.
6. Open devtools console (F12) and confirm `[karaoke] content script loaded on ...` appears.

If the extension shows an error badge, click it — Chromium reports manifest problems there.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold MV3 extension with verified build output"
```

---

### Task 2: LRCLIB client and live smoke call

This task answers the project's biggest open question: does network access actually work from a service worker inside Opera GX?

**Files:**
- Create: `src/core/types.ts`, `src/lrclib/client.ts`
- Modify: `src/background/index.ts`
- Test: `tests/lrclib/client.test.ts`

**Interfaces:**
- Consumes: the build from Task 1.
- Produces:
  - `interface LrclibRecord` in `src/core/types.ts`
  - `searchLyrics(query: string, fetchImpl?: typeof fetch): Promise<LrclibRecord[]>`
  - `class LrclibRateLimitError extends Error` with a `retryAfterSec: number` field

- [ ] **Step 1: Write the failing test**

Create `tests/lrclib/client.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { searchLyrics, LrclibRateLimitError } from '../../src/lrclib/client';
import type { LrclibRecord } from '../../src/core/types';

const record: LrclibRecord = {
  id: 1,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: '(Whats The Story) Morning Glory?',
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('searchLyrics', () => {
  it('returns parsed records on success', async () => {
    const { impl } = fakeFetch(200, [record]);
    const result = await searchLyrics('oasis wonderwall', impl);
    expect(result).toHaveLength(1);
    expect(result[0]?.trackName).toBe('Wonderwall');
  });

  it('url-encodes the query, including Thai text', async () => {
    const { impl, calls } = fakeFetch(200, []);
    await searchLyrics('Bodyslam ครั้งหนึ่ง', impl);
    expect(calls[0]).toBe(
      'https://lrclib.net/api/search?q=' + encodeURIComponent('Bodyslam ครั้งหนึ่ง'),
    );
  });

  it('throws LrclibRateLimitError carrying retry-after on 429', async () => {
    const { impl } = fakeFetch(429, {}, { 'retry-after': '30' });
    await expect(searchLyrics('x', impl)).rejects.toBeInstanceOf(LrclibRateLimitError);
    await expect(searchLyrics('x', impl)).rejects.toMatchObject({ retryAfterSec: 30 });
  });

  it('defaults retry-after to 60 seconds when the header is missing', async () => {
    const { impl } = fakeFetch(429, {});
    await expect(searchLyrics('x', impl)).rejects.toMatchObject({ retryAfterSec: 60 });
  });

  it('throws a plain error on server failure', async () => {
    const { impl } = fakeFetch(500, {});
    await expect(searchLyrics('x', impl)).rejects.toThrow('HTTP 500');
  });
});
```

The `fetchImpl` parameter exists specifically so these tests never touch the network and never patch globals. Every module in this project that does I/O takes its dependency as an argument for the same reason.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lrclib/client.test.ts`
Expected: FAIL — cannot resolve `../../src/lrclib/client`.

- [ ] **Step 3: Write `src/core/types.ts`**

```ts
/** One record as returned by the LRCLIB search API. */
export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}
```

- [ ] **Step 4: Write `src/lrclib/client.ts`**

```ts
import type { LrclibRecord } from '../core/types';

const API_BASE = 'https://lrclib.net/api';

// Browsers forbid setting User-Agent from fetch, so LRCLIB reads this instead.
const CLIENT_HEADER = 'karaoke-chrome-extension v0.1.0 (personal use)';

const DEFAULT_RETRY_AFTER_SEC = 60;

export class LrclibRateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`lrclib rate limited; retry after ${retryAfterSec}s`);
    this.name = 'LrclibRateLimitError';
  }
}

export async function searchLyrics(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LrclibRecord[]> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, { headers: { 'Lrclib-Client': CLIENT_HEADER } });

  if (res.status === 429) {
    const header = res.headers.get('retry-after');
    const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
    throw new LrclibRateLimitError(
      Number.isFinite(parsed) ? parsed : DEFAULT_RETRY_AFTER_SEC,
    );
  }

  if (!res.ok) {
    throw new Error(`lrclib search failed: HTTP ${res.status}`);
  }

  return (await res.json()) as LrclibRecord[];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lrclib/client.test.ts`
Expected: all five tests PASS.

- [ ] **Step 6: Add the smoke call to the service worker**

Replace `src/background/index.ts` with:

```ts
import { searchLyrics } from '../lrclib/client';

console.log('[karaoke] service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

/**
 * Proves at install time that this browser can reach LRCLIB from a service
 * worker. Exists so platform problems surface immediately rather than being
 * mistaken for bugs in song matching later.
 */
async function runSmokeTest(): Promise<void> {
  try {
    const results = await searchLyrics('oasis wonderwall');
    const syncedCount = results.filter((r) => r.syncedLyrics).length;
    console.log(
      `[karaoke] SMOKE OK — ${results.length} results, ${syncedCount} with synced lyrics`,
    );
    console.log('[karaoke] first result:', results[0]);
  } catch (error) {
    console.error('[karaoke] SMOKE FAILED —', error);
  }
}
```

- [ ] **Step 7: Rebuild and verify the smoke test in Opera GX**

Run: `npm run build`

Then, manually:

1. Go to `opera://extensions`.
2. Click the **reload** (circular arrow) icon on the extension card.
3. Click the **service worker** link on the card to open its devtools console.
4. Confirm you see `[karaoke] SMOKE OK — 20 results, 20 with synced lyrics` (counts may differ) followed by a logged record object.

`onInstalled` fires on reload of an unpacked extension, so the reload in step 2 is what triggers the call. If the worker console shows "inactive", click reload again — MV3 workers sleep aggressively.

**If this step fails, stop and report it.** Everything downstream assumes network access works.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add lrclib client with install-time smoke check"
```

---

### Task 3: Shadow DOM panel

**Files:**
- Create: `src/content/panel-styles.ts`, `src/content/panel.ts`
- Test: `tests/content/panel.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `const PANEL_HOST_ID = 'karaoke-lyrics-panel-host'`
  - `interface PanelHandle { setHeader(title: string, subtitle: string): void; setStatus(message: string): void; setLines(lines: string[]): void; destroy(): void }`
  - `mountPanel(container: HTMLElement): PanelHandle`

- [ ] **Step 1: Write the failing test**

Create `tests/content/panel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mountPanel, PANEL_HOST_ID } from '../../src/content/panel';

function container(): HTMLElement {
  document.body.innerHTML = '<div id="secondary"></div>';
  return document.querySelector<HTMLElement>('#secondary')!;
}

function shadowOf(host: HTMLElement): ShadowRoot {
  const el = host.querySelector(`#${PANEL_HOST_ID}`)!;
  return (el as HTMLElement).shadowRoot!;
}

describe('mountPanel', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = container();
  });

  it('attaches a host element with an open shadow root', () => {
    mountPanel(host);
    const el = host.querySelector(`#${PANEL_HOST_ID}`) as HTMLElement | null;
    expect(el).not.toBeNull();
    expect(el!.shadowRoot).not.toBeNull();
  });

  it('renders one list item per lyric line', () => {
    const panel = mountPanel(host);
    panel.setLines(['line one', 'line two', 'line three']);
    expect(shadowOf(host).querySelectorAll('.kx-line')).toHaveLength(3);
  });

  it('renders lyric text literally, never as markup', () => {
    // Lyrics come from a third-party API, so they are untrusted input.
    const panel = mountPanel(host);
    panel.setLines(['<img src=x onerror=alert(1)>']);
    const line = shadowOf(host).querySelector('.kx-line')!;
    expect(line.querySelector('img')).toBeNull();
    expect(line.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('preserves Thai text unchanged', () => {
    const panel = mountPanel(host);
    panel.setLines(['ฉันคนไม่จำเป็น']);
    expect(shadowOf(host).querySelector('.kx-line')!.textContent).toBe('ฉันคนไม่จำเป็น');
  });

  it('replaces rather than duplicates when mounted twice', () => {
    mountPanel(host);
    mountPanel(host);
    expect(host.querySelectorAll(`#${PANEL_HOST_ID}`)).toHaveLength(1);
  });

  it('removes the host on destroy', () => {
    const panel = mountPanel(host);
    panel.destroy();
    expect(host.querySelector(`#${PANEL_HOST_ID}`)).toBeNull();
  });

  it('sets header text', () => {
    const panel = mountPanel(host);
    panel.setHeader('คนไม่จำเป็น', 'Three Man Down');
    const shadow = shadowOf(host);
    expect(shadow.querySelector('.kx-title')!.textContent).toBe('คนไม่จำเป็น');
    expect(shadow.querySelector('.kx-subtitle')!.textContent).toBe('Three Man Down');
  });
});
```

The `// @vitest-environment jsdom` comment on line 1 is required — the global Vitest environment is `node`, which has no DOM.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/content/panel.test.ts`
Expected: FAIL — cannot resolve `../../src/content/panel`.

- [ ] **Step 3: Write `src/content/panel-styles.ts`**

Styles live in a TypeScript string rather than a `.css` file so the IIFE build has nothing to resolve and the text can be injected straight into the shadow root.

```ts
export const PANEL_STYLES = `
  :host { all: initial; }
  .kx-panel {
    font-family: "Roboto", "Noto Sans Thai", Arial, sans-serif;
    background: #0f0f0f;
    color: #f1f1f1;
    border: 1px solid #303030;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 16px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
  }
  .kx-header { border-bottom: 1px solid #303030; padding-bottom: 8px; }
  .kx-title { font-size: 15px; font-weight: 600; }
  .kx-subtitle { font-size: 12px; color: #aaa; margin-top: 2px; }
  .kx-status { font-size: 12px; color: #ffb86b; padding: 8px 0; }
  .kx-lines {
    list-style: none;
    margin: 0;
    padding: 8px 0 0;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.9;
  }
  .kx-line { color: #c8c8c8; padding: 1px 0; }
`;
```

`all: initial` on `:host` is the guard against YouTube's own stylesheet reaching into the panel.

- [ ] **Step 4: Write `src/content/panel.ts`**

```ts
import { PANEL_STYLES } from './panel-styles';

export const PANEL_HOST_ID = 'karaoke-lyrics-panel-host';

export interface PanelHandle {
  setHeader(title: string, subtitle: string): void;
  setStatus(message: string): void;
  setLines(lines: string[]): void;
  destroy(): void;
}

export function mountPanel(container: HTMLElement): PanelHandle {
  // Remove any panel left behind by a previous mount so navigation can never
  // stack two panels on top of each other.
  container.querySelector(`#${PANEL_HOST_ID}`)?.remove();

  const host = document.createElement('div');
  host.id = PANEL_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = PANEL_STYLES;

  const panel = document.createElement('div');
  panel.className = 'kx-panel';
  // Static skeleton only — no interpolated values, so this innerHTML is safe.
  panel.innerHTML = `
    <div class="kx-header">
      <div class="kx-title"></div>
      <div class="kx-subtitle"></div>
    </div>
    <div class="kx-status"></div>
    <ol class="kx-lines"></ol>
  `;

  shadow.append(style, panel);
  container.prepend(host);

  const find = <T extends Element>(selector: string): T => {
    const el = panel.querySelector<T>(selector);
    if (!el) throw new Error(`panel element missing: ${selector}`);
    return el;
  };

  return {
    setHeader(title, subtitle) {
      find('.kx-title').textContent = title;
      find('.kx-subtitle').textContent = subtitle;
    },
    setStatus(message) {
      const el = find<HTMLElement>('.kx-status');
      el.textContent = message;
      el.style.display = message ? 'block' : 'none';
    },
    setLines(lines) {
      // textContent per line: lyrics are untrusted third-party content.
      find('.kx-lines').replaceChildren(
        ...lines.map((text) => {
          const li = document.createElement('li');
          li.className = 'kx-line';
          li.textContent = text;
          return li;
        }),
      );
    },
    destroy() {
      host.remove();
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/content/panel.test.ts`
Expected: all seven tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add shadow DOM lyrics panel"
```

---

### Task 4: SPA lifecycle — mount and remount across navigation

**Files:**
- Create: `src/core/youtube-url.ts`
- Modify: `src/content/index.ts` (replace the stub entirely)
- Test: `tests/core/youtube-url.test.ts`

**Interfaces:**
- Consumes: `mountPanel`, `PanelHandle` from Task 3.
- Produces: `parseVideoId(url: string): string | null` in `src/core/youtube-url.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/youtube-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVideoId } from '../../src/core/youtube-url';

describe('parseVideoId', () => {
  it('extracts the id from a watch URL', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('ignores extra query parameters', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=abc123&t=42s&list=PL1')).toBe('abc123');
  });

  it('accepts the apex domain', () => {
    expect(parseVideoId('https://youtube.com/watch?v=abc123')).toBe('abc123');
  });

  it('returns null on the homepage', () => {
    expect(parseVideoId('https://www.youtube.com/')).toBeNull();
  });

  it('returns null for shorts', () => {
    expect(parseVideoId('https://www.youtube.com/shorts/abc123')).toBeNull();
  });

  it('returns null for a watch URL with no v parameter', () => {
    expect(parseVideoId('https://www.youtube.com/watch?list=PL1')).toBeNull();
  });

  it('returns null for a non-YouTube host', () => {
    expect(parseVideoId('https://evil.example.com/watch?v=abc123')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseVideoId('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/youtube-url.test.ts`
Expected: FAIL — cannot resolve `../../src/core/youtube-url`.

- [ ] **Step 3: Write `src/core/youtube-url.ts`**

```ts
const WATCH_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

/** Returns the video id for a YouTube watch URL, or null for anything else. */
export function parseVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!WATCH_HOSTS.has(parsed.hostname)) return null;
  if (parsed.pathname !== '/watch') return null;
  return parsed.searchParams.get('v');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/youtube-url.test.ts`
Expected: all eight tests PASS.

- [ ] **Step 5: Rewrite `src/content/index.ts`**

```ts
import { mountPanel, type PanelHandle } from './panel';
import { parseVideoId } from '../core/youtube-url';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;

function teardown(): void {
  panel?.destroy();
  panel = null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * YouTube builds #secondary after the initial document, and rebuilds it on
 * every SPA navigation, so it has to be waited for rather than queried once.
 */
async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    if (el) return el;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

async function activate(videoId: string): Promise<void> {
  const container = await waitForSecondary();
  if (!container) {
    console.warn('[karaoke] #secondary never appeared');
    return;
  }
  // The user may have navigated again while we were waiting.
  if (currentVideoId !== videoId) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', `video ${videoId}`);
  panel.setStatus('Panel mounted. Lyrics arrive in sprint 2.');
}

function onLocationChanged(): void {
  const videoId = parseVideoId(location.href);
  if (videoId === currentVideoId) return;
  currentVideoId = videoId;
  teardown();
  if (videoId) void activate(videoId);
}

// Primary signal. YouTube fires this on its own SPA navigations.
document.addEventListener('yt-navigate-finish', onLocationChanged);
// Backup: yt-navigate-finish is undocumented and does get missed.
setInterval(onLocationChanged, NAVIGATION_POLL_MS);

onLocationChanged();
```

- [ ] **Step 6: Rebuild and run the full test suite**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds, all tests PASS, no type errors.

- [ ] **Step 7: Verify SPA behaviour in Opera GX**

Manual checklist:

1. Reload the extension at `opera://extensions`.
2. Open a YouTube music video. The panel appears above the suggested-videos column, showing `video <id>`.
3. Click a suggested video **without reloading the page**. The panel disappears and reappears with the new video id.
4. Navigate to the YouTube homepage. The panel is gone.
5. Use the browser Back button to return to a video. The panel returns.
6. Confirm only ever one panel is on screen.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: mount panel and survive YouTube SPA navigation"
```

---

# Sprint 2 — Lyrics on screen, unsynced

Goal: identify the song from the page and render its lyrics as static text.

---

### Task 5: LRC parser

**Files:**
- Modify: `src/core/types.ts` (add `LyricLine`)
- Create: `src/core/lrc-parser.ts`
- Test: `tests/core/lrc-parser.test.ts`

**Interfaces:**
- Consumes: `src/core/types.ts` from Task 2.
- Produces:
  - `interface LyricLine { timeMs: number; text: string; chords?: { charIndex: number; symbol: string }[] }`
  - `parseLrc(lrc: string): LyricLine[]` — sorted ascending by `timeMs`

- [ ] **Step 1: Write the failing test**

Create `tests/core/lrc-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLrc } from '../../src/core/lrc-parser';

describe('parseLrc', () => {
  it('parses a two-digit fraction timestamp', () => {
    expect(parseLrc('[00:12.34]Today is gonna be the day')).toEqual([
      { timeMs: 12340, text: 'Today is gonna be the day' },
    ]);
  });

  it('treats .5, .50 and .500 as the same half second', () => {
    expect(parseLrc('[00:01.5]a')[0]?.timeMs).toBe(1500);
    expect(parseLrc('[00:01.50]a')[0]?.timeMs).toBe(1500);
    expect(parseLrc('[00:01.500]a')[0]?.timeMs).toBe(1500);
  });

  it('accepts a colon before the fraction', () => {
    expect(parseLrc('[00:12:34]x')[0]?.timeMs).toBe(12340);
  });

  it('handles minutes past 60', () => {
    expect(parseLrc('[75:30.00]x')[0]?.timeMs).toBe(75 * 60_000 + 30_000);
  });

  it('emits one line per timestamp when a line has several', () => {
    expect(parseLrc('[00:10.00][01:20.00]chorus')).toEqual([
      { timeMs: 10_000, text: 'chorus' },
      { timeMs: 80_000, text: 'chorus' },
    ]);
  });

  it('skips metadata tags', () => {
    const lrc = ['[ar:Bodyslam]', '[ti:ครั้งหนึ่ง]', '[offset:+500]', '[00:05.00]ถามใคร'].join('\n');
    expect(parseLrc(lrc)).toEqual([{ timeMs: 5000, text: 'ถามใคร' }]);
  });

  it('sorts out-of-order timestamps', () => {
    const lrc = '[00:30.00]second\n[00:10.00]first';
    expect(parseLrc(lrc).map((l) => l.text)).toEqual(['first', 'second']);
  });

  it('handles CRLF line endings', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]b')).toHaveLength(2);
  });

  it('keeps empty lines as timed gaps', () => {
    expect(parseLrc('[00:20.00]')).toEqual([{ timeMs: 20_000, text: '' }]);
  });

  it('skips lines with no leading timestamp', () => {
    expect(parseLrc('just some text\n[00:01.00]real')).toEqual([
      { timeMs: 1000, text: 'real' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });

  it('preserves Thai text exactly', () => {
    expect(parseLrc('[00:03.00]ฉันคนไม่จำเป็น')[0]?.text).toBe('ฉันคนไม่จำเป็น');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/lrc-parser.test.ts`
Expected: FAIL — cannot resolve `../../src/core/lrc-parser`.

- [ ] **Step 3: Add `LyricLine` to `src/core/types.ts`**

Append to the existing file:

```ts
/**
 * One timed lyric line. `chords` is reserved for a future sprint and is
 * always absent today — see the design doc's chord hook section.
 */
export interface LyricLine {
  timeMs: number;
  text: string;
  chords?: { charIndex: number; symbol: string }[];
}
```

- [ ] **Step 4: Write `src/core/lrc-parser.ts`**

```ts
import type { LyricLine } from './types';

// [mm:ss.xx] / [mm:ss.xxx] / [mm:ss:xx] / [mm:ss]
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parses LRC text into lines sorted ascending by timestamp. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    TIMESTAMP.lastIndex = 0;
    const timestamps: number[] = [];
    let consumed = 0;
    let match: RegExpExecArray | null;

    while ((match = TIMESTAMP.exec(raw)) !== null) {
      // Timestamps must form an unbroken prefix; anything later is lyric text.
      if (match.index !== consumed) break;
      consumed = match.index + match[0].length;
      timestamps.push(toMs(match[1]!, match[2]!, match[3]));
    }

    // Metadata tags such as [ar:...] contain no digits pair and yield nothing.
    if (timestamps.length === 0) continue;

    const text = raw.slice(consumed).trim();
    for (const timeMs of timestamps) lines.push({ timeMs, text });
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

function toMs(minutes: string, seconds: string, fraction: string | undefined): number {
  const fractionMs = fraction
    ? Math.round(Number.parseFloat(`0.${fraction}`) * 1000)
    : 0;
  return (
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1000 +
    fractionMs
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/core/lrc-parser.test.ts`
Expected: all twelve tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add LRC parser"
```

---

### Task 6: Title normalizer

**Files:**
- Create: `src/core/title-normalizer.ts`
- Test: `tests/core/title-normalizer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ParsedTitle { artist: string | null; track: string }`
  - `normalizeTitle(rawTitle: string): ParsedTitle`

**Design note the implementer must respect:** this module strips promotional noise but **deliberately keeps `(Live)`, `(Acoustic)`, `(Cover)` and `(Remix)`**. Task 7's scorer needs those words to avoid matching a live video against a studio recording. Removing them here would silently break matching there.

- [ ] **Step 1: Write the failing test**

Create `tests/core/title-normalizer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '../../src/core/title-normalizer';

describe('normalizeTitle', () => {
  it('splits artist and track on a hyphen and drops [Official MV]', () => {
    expect(normalizeTitle('BODYSLAM - ครั้งหนึ่งไม่ถึงตาย [Official MV]')).toEqual({
      artist: 'BODYSLAM',
      track: 'ครั้งหนึ่งไม่ถึงตาย',
    });
  });

  it('drops (Official Video)', () => {
    expect(normalizeTitle('Oasis - Wonderwall (Official Video)')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });

  it('handles an en dash separator and a trailing resolution tag', () => {
    expect(normalizeTitle('Taylor Swift – Blank Space (Official Music Video) 4K')).toEqual({
      artist: 'Taylor Swift',
      track: 'Blank Space',
    });
  });

  it('drops a pipe-delimited official suffix', () => {
    expect(normalizeTitle('Three Man Down - คนไม่จำเป็น | Official MV')).toEqual({
      artist: 'Three Man Down',
      track: 'คนไม่จำเป็น',
    });
  });

  it('drops a featured-artist clause', () => {
    expect(normalizeTitle('Scrubb - ทุกอย่าง (feat. Someone)')).toEqual({
      artist: 'Scrubb',
      track: 'ทุกอย่าง',
    });
  });

  it('keeps live markers so the scorer can use them', () => {
    expect(normalizeTitle('Cocktail - เรา (Live From COCKTAIL CLASSICS)')).toEqual({
      artist: 'Cocktail',
      track: 'เรา (Live From COCKTAIL CLASSICS)',
    });
  });

  it('returns a null artist when there is no separator', () => {
    expect(normalizeTitle('เพลงไม่มีศิลปิน')).toEqual({
      artist: null,
      track: 'เพลงไม่มีศิลปิน',
    });
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeTitle('Oasis  -   Wonderwall')).toEqual({
      artist: 'Oasis',
      track: 'Wonderwall',
    });
  });

  it('does not split on a hyphen at position zero', () => {
    expect(normalizeTitle('- Wonderwall').artist).toBeNull();
  });

  it('returns an empty track for empty input', () => {
    expect(normalizeTitle('')).toEqual({ artist: null, track: '' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: FAIL — cannot resolve `../../src/core/title-normalizer`.

- [ ] **Step 3: Write `src/core/title-normalizer.ts`**

```ts
export interface ParsedTitle {
  artist: string | null;
  track: string;
}

// Bracketed promo tags. Note the absence of live/acoustic/cover/remix:
// the match scorer relies on those surviving.
const BRACKETED_NOISE =
  /[([]\s*[^)\]]*\b(?:official|lyrics?|audio|m\/?v|visualizer|teaser|hd|4k|\d{3,4}p)\b[^)\]]*\s*[)\]]/gi;

const CJK_BRACKETED_NOISE = /【[^】]*】/g;

// The \b is load-bearing: without it, `ft` matches inside words like
// "Swift" or "Daft" (both \s* and [([]? can match zero-width), and the
// trailing [^)\]]* then eats the rest of the title. "Taylor Swift – Blank
// Space" normalizes to "Taylor Swi" without it.
const FEATURED = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi;

const BARE_NOISE = [
  /\|\s*official[^|]*$/gi,
  /\bofficial\s+(?:music\s+)?video\b/gi,
  /\bofficial\s+(?:audio|mv)\b/gi,
  /\b(?:hd|4k|1080p|720p)\b/gi,
];

const SEPARATORS = [' - ', ' – ', ' — ', ' | '];

const EDGE_JUNK = /^[-–—|:\s]+|[-–—|:\s]+$/g;

/** Turns a raw YouTube video title into a best-guess artist and track. */
export function normalizeTitle(rawTitle: string): ParsedTitle {
  let text = rawTitle.normalize('NFC');

  text = text.replace(CJK_BRACKETED_NOISE, ' ');
  text = text.replace(BRACKETED_NOISE, ' ');
  text = text.replace(FEATURED, ' ');
  for (const pattern of BARE_NOISE) text = text.replace(pattern, ' ');

  text = text.replace(/\s+/g, ' ').trim().replace(EDGE_JUNK, '').trim();

  for (const separator of SEPARATORS) {
    const index = text.indexOf(separator);
    // index > 0 so a leading separator never yields an empty artist.
    if (index <= 0) continue;
    const artist = text.slice(0, index).trim();
    const track = text.slice(index + separator.length).trim();
    if (artist && track) return { artist, track };
  }

  return { artist: null, track: text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/title-normalizer.test.ts`
Expected: all ten tests PASS.

If a regex needs adjusting to satisfy a case, change the regex — never the expectation. These fixtures are real YouTube titles.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add YouTube title normalizer"
```

---

### Task 7: Match scorer

**Files:**
- Create: `src/core/match-scorer.ts`
- Test: `tests/core/match-scorer.test.ts`

**Interfaces:**
- Consumes: `LrclibRecord` from Task 2.
- Produces:
  - `interface MatchInput { artist: string | null; track: string; durationSec: number | null }`
  - `interface ScoredCandidate { record: LrclibRecord; score: number }`
  - `similarity(a: string, b: string): number` — 0 to 1
  - `scoreCandidates(input: MatchInput, candidates: LrclibRecord[]): ScoredCandidate[]` — sorted best first
  - `pickBestMatch(input: MatchInput, candidates: LrclibRecord[]): LrclibRecord | null`
  - `const MATCH_THRESHOLD = 0.55`

- [ ] **Step 1: Write the failing test**

Create `tests/core/match-scorer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  similarity,
  scoreCandidates,
  pickBestMatch,
  MATCH_THRESHOLD,
} from '../../src/core/match-scorer';
import type { LrclibRecord } from '../../src/core/types';

function record(over: Partial<LrclibRecord>): LrclibRecord {
  return {
    id: 1,
    trackName: 'Track',
    artistName: 'Artist',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: 'words',
    syncedLyrics: '[00:01.00]words',
    ...over,
  };
}

describe('similarity', () => {
  it('scores identical strings as 1', () => {
    expect(similarity('Wonderwall', 'Wonderwall')).toBe(1);
  });

  it('ignores case and punctuation', () => {
    expect(similarity('Wonderwall!', 'wonderwall')).toBe(1);
  });

  it('scores unrelated strings low', () => {
    expect(similarity('Wonderwall', 'Blank Space')).toBeLessThan(0.4);
  });

  it('scores near-identical strings high', () => {
    expect(similarity('Wonderwal', 'Wonderwall')).toBeGreaterThan(0.85);
  });

  it('works on Thai text', () => {
    expect(similarity('คนไม่จำเป็น', 'คนไม่จำเป็น')).toBe(1);
    expect(similarity('คนไม่จำเป็น', 'เปิดตัวเขา')).toBeLessThan(0.5);
  });

  it('scores two empty strings as 1 and one empty string as 0', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', '')).toBe(0);
  });
});

describe('scoreCandidates', () => {
  it('ranks the exact title above a different song by the same artist', () => {
    const wanted = record({ id: 10, trackName: 'Wonderwall', artistName: 'Oasis' });
    const other = record({ id: 11, trackName: 'Champagne Supernova', artistName: 'Oasis' });
    const ranked = scoreCandidates(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [other, wanted],
    );
    expect(ranked[0]?.record.id).toBe(10);
  });

  it('uses duration to break a tie between identical titles', () => {
    const close = record({ id: 20, duration: 200 });
    const far = record({ id: 21, duration: 400 });
    const ranked = scoreCandidates(
      { artist: 'Artist', track: 'Track', durationSec: 202 },
      [far, close],
    );
    expect(ranked[0]?.record.id).toBe(20);
  });

  it('prefers a live candidate when the video title says live', () => {
    const studio = record({ id: 30, trackName: 'เรา', artistName: 'Cocktail' });
    const live = record({ id: 31, trackName: 'เรา (Live From COCKTAIL CLASSICS)', artistName: 'Cocktail' });
    const ranked = scoreCandidates(
      { artist: 'Cocktail', track: 'เรา (Live From COCKTAIL CLASSICS)', durationSec: 292 },
      [studio, live],
    );
    expect(ranked[0]?.record.id).toBe(31);
  });

  it('prefers the studio candidate when the video title has no live marker', () => {
    const studio = record({ id: 40, trackName: 'เรา', artistName: 'Cocktail', duration: 292 });
    const live = record({ id: 41, trackName: 'เรา (Live)', artistName: 'Cocktail', duration: 292 });
    const ranked = scoreCandidates(
      { artist: 'Cocktail', track: 'เรา', durationSec: 292 },
      [live, studio],
    );
    expect(ranked[0]?.record.id).toBe(40);
  });

  it('prefers a candidate that has synced lyrics over one that does not', () => {
    const plainOnly = record({ id: 50, syncedLyrics: null });
    const synced = record({ id: 51 });
    const ranked = scoreCandidates(
      { artist: 'Artist', track: 'Track', durationSec: 200 },
      [plainOnly, synced],
    );
    expect(ranked[0]?.record.id).toBe(51);
  });

  it('returns scores in descending order', () => {
    const ranked = scoreCandidates(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [record({ id: 60, trackName: 'Wonderwall', artistName: 'Oasis' }), record({ id: 61, trackName: 'Nonsense', artistName: 'Nobody' })],
    );
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });
});

describe('pickBestMatch', () => {
  it('returns the top candidate when it clears the threshold', () => {
    const match = pickBestMatch(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [record({ id: 70, trackName: 'Wonderwall', artistName: 'Oasis', duration: 258 })],
    );
    expect(match?.id).toBe(70);
  });

  it('returns null when nothing clears the threshold', () => {
    const match = pickBestMatch(
      { artist: 'Oasis', track: 'Wonderwall', durationSec: 258 },
      [record({ id: 71, trackName: 'Completely Different', artistName: 'Someone Else', duration: 90 })],
    );
    expect(match).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(pickBestMatch({ artist: 'a', track: 'b', durationSec: null }, [])).toBeNull();
  });

  it('exposes a threshold between 0 and 1', () => {
    expect(MATCH_THRESHOLD).toBeGreaterThan(0);
    expect(MATCH_THRESHOLD).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/match-scorer.test.ts`
Expected: FAIL — cannot resolve `../../src/core/match-scorer`.

- [ ] **Step 3: Write `src/core/match-scorer.ts`**

```ts
import type { LrclibRecord } from './types';

export interface MatchInput {
  artist: string | null;
  track: string;
  durationSec: number | null;
}

export interface ScoredCandidate {
  record: LrclibRecord;
  score: number;
}

export const MATCH_THRESHOLD = 0.55;

const WEIGHT_TRACK = 0.5;
const WEIGHT_ARTIST = 0.3;
const WEIGHT_DURATION = 0.2;
const VARIANT_PENALTY = 0.25;
const SYNCED_BONUS = 0.05;

/** Seconds of difference at which duration similarity reaches zero. */
const DURATION_TOLERANCE_SEC = 20;

/** Score used when a signal is unavailable — neither rewards nor punishes. */
const NEUTRAL = 0.5;

const VARIANT_WORDS = ['live', 'acoustic', 'cover', 'remix', 'instrumental'] as const;

// NFC per the Thai rule in the design; no tone-mark folding.
function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Normalized edit-distance similarity from 0 to 1. Script-agnostic. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// Word-boundary matching is load-bearing. Plain substring matching tags
// "Deliver", "Alive" and "Olive" as live, and "Discover" as a cover, which
// makes sameVariant() return true against a genuinely live candidate and
// silently suppresses VARIANT_PENALTY. Precompiled at module level, and
// deliberately without the `g` flag — `g` carries lastIndex state across
// .test() calls and would return alternating results.
const VARIANT_PATTERNS = VARIANT_WORDS.map(
  (word) => [word, new RegExp(`\\b${word}\\b`, 'i')] as const,
);

function variantTags(text: string): Set<string> {
  return new Set(
    VARIANT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([word]) => word),
  );
}

function sameVariant(a: string, b: string): boolean {
  const left = variantTags(a);
  const right = variantTags(b);
  if (left.size !== right.size) return false;
  for (const tag of left) if (!right.has(tag)) return false;
  return true;
}

function durationScore(wanted: number | null, candidate: number | null): number {
  if (wanted === null || candidate === null) return NEUTRAL;
  const diff = Math.abs(wanted - candidate);
  return 1 - Math.min(diff / DURATION_TOLERANCE_SEC, 1);
}

export function scoreCandidates(
  input: MatchInput,
  candidates: LrclibRecord[],
): ScoredCandidate[] {
  return candidates
    .map((record) => {
      let score =
        WEIGHT_TRACK * similarity(input.track, record.trackName) +
        WEIGHT_ARTIST *
          (input.artist === null ? NEUTRAL : similarity(input.artist, record.artistName)) +
        WEIGHT_DURATION * durationScore(input.durationSec, record.duration);

      if (!sameVariant(input.track, record.trackName)) score -= VARIANT_PENALTY;
      if (record.syncedLyrics) score += SYNCED_BONUS;

      return { record, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function pickBestMatch(
  input: MatchInput,
  candidates: LrclibRecord[],
): LrclibRecord | null {
  const best = scoreCandidates(input, candidates)[0];
  if (!best || best.score < MATCH_THRESHOLD) return null;
  return best.record;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/core/match-scorer.test.ts`
Expected: all sixteen tests PASS.

If the live-preference tests fail, check `sameVariant` before touching the weights — a variant mismatch must cost more than the title-similarity difference it causes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add candidate match scorer"
```

---

### Task 8: Message contract and worker request handler

**Files:**
- Create: `src/messaging/types.ts`, `src/background/handle-fetch-lyrics.ts`
- Modify: `src/background/index.ts`
- Test: `tests/background/handle-fetch-lyrics.test.ts`

**Interfaces:**
- Consumes: `searchLyrics`, `LrclibRateLimitError` (Task 2); `pickBestMatch` (Task 7); `LrclibRecord` (Task 2).
- Produces:
  - `interface FetchLyricsRequest { type: 'FETCH_LYRICS'; videoId: string; artist: string | null; track: string; durationSec: number | null }`
  - `type FetchLyricsResponse = { ok: true; record: LrclibRecord } | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string }`
  - `handleFetchLyrics(request: FetchLyricsRequest, search: (query: string) => Promise<LrclibRecord[]>): Promise<FetchLyricsResponse>`

- [ ] **Step 1: Write the failing test**

Create `tests/background/handle-fetch-lyrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { handleFetchLyrics } from '../../src/background/handle-fetch-lyrics';
import { LrclibRateLimitError } from '../../src/lrclib/client';
import type { FetchLyricsRequest } from '../../src/messaging/types';
import type { LrclibRecord } from '../../src/core/types';

const request: FetchLyricsRequest = {
  type: 'FETCH_LYRICS',
  videoId: 'abc123',
  artist: 'Oasis',
  track: 'Wonderwall',
  durationSec: 258,
};

const wonderwall: LrclibRecord = {
  id: 99,
  trackName: 'Wonderwall',
  artistName: 'Oasis',
  albumName: null,
  duration: 258,
  instrumental: false,
  plainLyrics: 'Today is gonna be the day',
  syncedLyrics: '[00:12.34]Today is gonna be the day',
};

describe('handleFetchLyrics', () => {
  it('returns the best matching record', async () => {
    const result = await handleFetchLyrics(request, async () => [wonderwall]);
    expect(result).toEqual({ ok: true, record: wonderwall });
  });

  it('searches using artist and track together', async () => {
    const queries: string[] = [];
    await handleFetchLyrics(request, async (q) => {
      queries.push(q);
      return [wonderwall];
    });
    expect(queries[0]).toBe('Oasis Wonderwall');
  });

  it('searches on track alone when the artist is unknown', async () => {
    const queries: string[] = [];
    await handleFetchLyrics({ ...request, artist: null }, async (q) => {
      queries.push(q);
      return [wonderwall];
    });
    expect(queries[0]).toBe('Wonderwall');
  });

  it('reports not-found when the search returns nothing', async () => {
    const result = await handleFetchLyrics(request, async () => []);
    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
      message: 'No lyrics found for this song.',
    });
  });

  it('reports not-found when no candidate clears the threshold', async () => {
    const unrelated: LrclibRecord = { ...wonderwall, id: 1, trackName: 'Zzz', artistName: 'Nobody', duration: 60 };
    const result = await handleFetchLyrics(request, async () => [unrelated]);
    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('reports rate-limited with the retry delay', async () => {
    const result = await handleFetchLyrics(request, async () => {
      throw new LrclibRateLimitError(45);
    });
    expect(result).toMatchObject({ ok: false, reason: 'rate-limited' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('45');
  });

  it('reports a network failure for any other error', async () => {
    const result = await handleFetchLyrics(request, async () => {
      throw new Error('offline');
    });
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/background/handle-fetch-lyrics.test.ts`
Expected: FAIL — cannot resolve `../../src/background/handle-fetch-lyrics`.

- [ ] **Step 3: Write `src/messaging/types.ts`**

```ts
import type { LrclibRecord } from '../core/types';

export interface FetchLyricsRequest {
  type: 'FETCH_LYRICS';
  videoId: string;
  artist: string | null;
  track: string;
  durationSec: number | null;
}

export type FetchLyricsResponse =
  | { ok: true; record: LrclibRecord }
  | { ok: false; reason: 'not-found' | 'rate-limited' | 'network'; message: string };
```

- [ ] **Step 4: Write `src/background/handle-fetch-lyrics.ts`**

```ts
import { LrclibRateLimitError } from '../lrclib/client';
import { pickBestMatch } from '../core/match-scorer';
import type { LrclibRecord } from '../core/types';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

/**
 * Takes its search function as an argument so it can be tested without a
 * network, a browser, or any chrome.* global.
 */
export async function handleFetchLyrics(
  request: FetchLyricsRequest,
  search: (query: string) => Promise<LrclibRecord[]>,
): Promise<FetchLyricsResponse> {
  const query = request.artist ? `${request.artist} ${request.track}` : request.track;

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

  const match = pickBestMatch(
    { artist: request.artist, track: request.track, durationSec: request.durationSec },
    candidates,
  );

  if (!match) {
    return { ok: false, reason: 'not-found', message: 'No lyrics found for this song.' };
  }

  return { ok: true, record: match };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/background/handle-fetch-lyrics.test.ts`
Expected: all seven tests PASS.

- [ ] **Step 6: Wire the handler into the service worker**

Replace `src/background/index.ts` with:

```ts
import { searchLyrics } from '../lrclib/client';
import { handleFetchLyrics } from './handle-fetch-lyrics';
import type { FetchLyricsRequest } from '../messaging/types';

console.log('[karaoke] service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

chrome.runtime.onMessage.addListener((message: FetchLyricsRequest, _sender, sendResponse) => {
  if (message?.type !== 'FETCH_LYRICS') return false;

  void handleFetchLyrics(message, (query) => searchLyrics(query)).then(sendResponse);

  // Returning true keeps the message channel open for the async sendResponse
  // above. Without it Chromium closes the channel and the caller gets
  // undefined. This is the single most common MV3 messaging bug.
  return true;
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

- [ ] **Step 7: Rebuild and run the full suite**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds, all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add lyrics fetch message handler"
```

---

### Task 9: Song detection and lyric rendering

**Files:**
- Create: `src/content/song-detector.ts`
- Modify: `src/content/index.ts`
- Test: `tests/content/song-detector.test.ts`

**Interfaces:**
- Consumes: `normalizeTitle` (Task 6), `parseLrc` (Task 5), `mountPanel` (Task 3), `FetchLyricsRequest` / `FetchLyricsResponse` (Task 8).
- Produces:
  - `interface DetectedSong { rawTitle: string; durationSec: number | null }`
  - `detectSong(doc?: Document): DetectedSong | null`

- [ ] **Step 1: Write the failing test**

Create `tests/content/song-detector.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectSong } from '../../src/content/song-detector';

function pageWith(html: string): Document {
  document.body.innerHTML = html;
  document.head.innerHTML = '';
  return document;
}

describe('detectSong', () => {
  it('reads the title from the watch metadata heading', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>Oasis - Wonderwall</yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('Oasis - Wonderwall');
  });

  it('falls back to the legacy title heading', () => {
    const doc = pageWith(
      '<h1 class="title"><yt-formatted-string>BODYSLAM - ครั้งหนึ่งไม่ถึงตาย</yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('BODYSLAM - ครั้งหนึ่งไม่ถึงตาย');
  });

  it('falls back to the title meta tag', () => {
    const doc = pageWith('');
    document.head.innerHTML = '<meta name="title" content="Scrubb - ลม">';
    expect(detectSong(doc)?.rawTitle).toBe('Scrubb - ลม');
  });

  it('trims surrounding whitespace', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>  Oasis - Wonderwall \n </yt-formatted-string></h1>',
    );
    expect(detectSong(doc)?.rawTitle).toBe('Oasis - Wonderwall');
  });

  it('returns null when no title is present', () => {
    expect(detectSong(pageWith('<div></div>'))).toBeNull();
  });

  it('returns a null duration when the video has not loaded metadata', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1><video></video>',
    );
    // jsdom leaves HTMLMediaElement.duration as NaN.
    expect(detectSong(doc)?.durationSec).toBeNull();
  });

  it('reports the duration when the video element exposes one', () => {
    const doc = pageWith(
      '<h1 class="ytd-watch-metadata"><yt-formatted-string>A - B</yt-formatted-string></h1><video></video>',
    );
    const video = doc.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 258, configurable: true });
    expect(detectSong(doc)?.durationSec).toBe(258);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/content/song-detector.test.ts`
Expected: FAIL — cannot resolve `../../src/content/song-detector`.

- [ ] **Step 3: Write `src/content/song-detector.ts`**

```ts
export interface DetectedSong {
  rawTitle: string;
  durationSec: number | null;
}

// Ordered most specific first. YouTube changes its markup often, so each
// selector is a fallback for the one before it.
const TITLE_SELECTORS = [
  'h1.ytd-watch-metadata yt-formatted-string',
  'h1.title yt-formatted-string',
  'meta[name="title"]',
] as const;

export function detectSong(doc: Document = document): DetectedSong | null {
  const rawTitle = readTitle(doc);
  if (!rawTitle) return null;

  const duration = doc.querySelector('video')?.duration;
  const durationSec =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : null;

  return { rawTitle, durationSec };
}

function readTitle(doc: Document): string | null {
  for (const selector of TITLE_SELECTORS) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    const text = el instanceof HTMLMetaElement ? el.content : el.textContent;
    if (text && text.trim()) return text.trim();
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/content/song-detector.test.ts`
Expected: all seven tests PASS.

- [ ] **Step 5: Rewrite `src/content/index.ts` to fetch and render lyrics**

```ts
import { mountPanel, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitle } from '../core/title-normalizer';
import { parseLrc } from '../core/lrc-parser';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  panel?.destroy();
  panel = null;
}

async function waitForSecondary(): Promise<HTMLElement | null> {
  const deadline = Date.now() + SECONDARY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(SECONDARY_SELECTOR);
    if (el) return el;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

/**
 * The heading and the video's duration both appear after navigation settles,
 * so poll until a title exists rather than reading once and giving up.
 */
async function waitForSong(): Promise<DetectedSong | null> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const song = detectSong();
    if (song) return song;
    await delay(SECONDARY_POLL_MS);
  }
  return null;
}

async function activate(videoId: string): Promise<void> {
  const container = await waitForSecondary();
  if (!container || currentVideoId !== videoId) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  const song = await waitForSong();
  if (currentVideoId !== videoId || !panel) return;

  if (!song) {
    panel.setStatus('Could not read the video title.');
    return;
  }

  const { artist, track } = normalizeTitle(song.rawTitle);
  panel.setHeader(track, artist ?? 'unknown artist');

  const request: FetchLyricsRequest = {
    type: 'FETCH_LYRICS',
    videoId,
    artist,
    track,
    durationSec: song.durationSec,
  };

  let response: FetchLyricsResponse;
  try {
    response = await chrome.runtime.sendMessage<FetchLyricsRequest, FetchLyricsResponse>(request);
  } catch (error) {
    console.error('[karaoke] message failed', error);
    if (currentVideoId === videoId && panel) {
      panel.setStatus('Extension worker unavailable. Reload the page.');
    }
    return;
  }

  if (currentVideoId !== videoId || !panel) return;

  if (!response.ok) {
    panel.setStatus(response.message);
    panel.setLines([]);
    return;
  }

  const { record } = response;
  panel.setHeader(record.trackName, record.artistName);

  if (record.syncedLyrics) {
    panel.setStatus('');
    panel.setLines(parseLrc(record.syncedLyrics).map((line) => line.text));
  } else if (record.plainLyrics) {
    panel.setStatus('No timings available for this track.');
    panel.setLines(record.plainLyrics.split(/\r?\n/));
  } else {
    panel.setStatus('This track is marked instrumental.');
    panel.setLines([]);
  }
}

function onLocationChanged(): void {
  const videoId = parseVideoId(location.href);
  if (videoId === currentVideoId) return;
  currentVideoId = videoId;
  teardown();
  if (videoId) void activate(videoId);
}

document.addEventListener('yt-navigate-finish', onLocationChanged);
setInterval(onLocationChanged, NAVIGATION_POLL_MS);

onLocationChanged();
```

- [ ] **Step 6: Rebuild and run the full suite**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds, all tests PASS, no type errors.

- [ ] **Step 7: Verify against real songs in Opera GX**

Manual checklist. Reload the extension, then open ten videos — five Thai, five English — and record for each whether the header shows the correct song and whether lyrics appeared:

| Video | Header correct? | Lyrics shown? |
|---|---|---|
| 1 | | |
| … | | |

Include at least one live version and at least one song you expect to fail. A hit rate around 7/10 is the expected outcome at this stage; Sprint 4 adds the manual search box that fixes the rest.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: detect song from page and render lyrics"
```

---

## Sprint 2 exit criteria

- `npm test` passes; `npm run typecheck` is clean.
- Opening an English music video shows the correct title, artist, and full lyric text in the panel.
- Opening a Thai music video shows Thai lyrics for the majority of tracks tried.
- A song with no match shows "No lyrics found for this song." rather than a blank panel or a hang.
- Navigating between videos replaces the lyrics rather than stacking panels.

## What comes next

Sprints 3–5 are described in the spec and get their own plans, written after this one is verified:

- **Sprint 3 — It syncs:** the `requestAnimationFrame` engine, current-line highlighting, auto-scroll with manual-scroll suspension.
- **Sprint 4 — Fix-it controls:** offset nudge with persistence, manual search box and candidate picker, `chrome.storage.local` caching.
- **Sprint 5 — Hardening:** the category gate, YouTube's own music metadata promoted to the primary detection signal, full error states, rate-limit backoff, LRU cache cap, visual polish.
