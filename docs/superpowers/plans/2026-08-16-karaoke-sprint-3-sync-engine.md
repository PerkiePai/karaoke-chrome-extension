# Sprint 3 — Sync Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lyrics panel sync to video playback — the current line highlights and auto-scrolls into view as the song plays, with a Spotify-style look (large bright current line, dimmed surrounding lines, smooth transitions), and manual scrolling suspends auto-scroll for 3 seconds so reading ahead stays possible.

**Architecture:** A pure `sync-engine.ts` holds all the index/timing math (binary search for the active line, scroll-suspension timing) as plain functions over explicit numbers — no clock, no DOM, fully deterministic in tests. An impure `sync-loop.ts` is the only thing that touches a real `<video>` and `requestAnimationFrame`; it is a thin adapter that calls into the pure engine and forwards results to the panel. Two existing files change shape to carry real timestamps end-to-end: `panel.ts`'s `setLines` now takes `LyricLine[]` instead of `string[]` and gains `setActiveLine`/`onManualScroll`, and `render-plan.ts` now says whether its lines are really timed (`synced: boolean`) alongside them. `content/index.ts` gets a small disposer registry so the one stateful resource this sprint adds (the running sync loop) cannot be left running past its video the way an ad-hoc nullable variable could.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom. Unchanged.

**Spec:** `docs/superpowers/specs/2026-08-15-youtube-karaoke-lyrics-design.md` — see "Sync engine" and the Sprint 3 entry under "Delivery sprints".

## Global Constraints

Every task's requirements implicitly include this section.

- `src/core/` is PURE: never import `chrome.*`, never reference `document`, `window`, or `location`. `src/content/sync-engine.ts` follows the same purity rule even though it lives under `content/` (matching `reconcile.ts` and `render-plan.ts`, which are already pure files that live there because they are content-script-specific, not because they touch the DOM) — this is what makes it testable with plain numbers instead of a fake clock.
- ALL network access lives in the service worker; the content script never calls `fetch`. Unaffected by this sprint.
- The content script bundle must contain NO ES module syntax (MV3 content scripts are classic scripts). Enforced by `tests/build.test.ts` — run it as part of `npm test`, not separately.
- Lyrics are UNTRUSTED third-party content: `textContent` only, never `innerHTML`. `setLines` continues to build `<li>` elements with `textContent`.
- Thai text: Unicode NFC where normalized; NEVER fold tone marks. Unaffected by this sprint.
- TypeScript `strict: true` with `noUncheckedIndexedAccess: true`.
- `npm test` carries `NODE_OPTIONS=--experimental-require-module` via `cross-env` (Node v22.11.0; jsdom 27 needs `require(esm)`, unflagged only in 22.12.0+). Do not remove it, and never invoke `npx vitest` directly — run `npm test`, or `npm test -- <path>` to scope to one file.
- **`SCROLL_SUSPEND_MS = 3000`** — the spec's own number ("suspends for 3 seconds after any manual scroll"). This is the one behavioral constant this sprint introduces; do not change it without updating the spec.
- The rAF chain runs only while the video is playing (per spec) — no `requestAnimationFrame` may be scheduled while `<video>` is paused. A `seeked` event still recomputes the active line once even while paused, so scrubbing while paused is not silently ignored.
- The DOM is touched only when the active index actually changes, never once per frame — this is the reason `sync-engine.tick` returns `null` on an unchanged index rather than always returning a result.
- Existing tests may be updated only where this plan's interface changes require it — `panel.test.ts`'s `setLines` calls and `render-plan.test.ts`'s `lines` assertions change shape because `PanelHandle.setLines` and `RenderPlan.lines` change type in Tasks 1–2. Never loosen an assertion to hide a bug.
- Commit after every task.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/content/panel.ts` | Adds `setActiveLine`, `onManualScroll`; `setLines` takes `LyricLine[]` | 1 |
| `src/content/panel-styles.ts` | Spotify-style active/inactive line styling | 1 |
| `src/content/render-plan.ts` | Adds `synced: boolean`; `lines` becomes `LyricLine[]` | 2 |
| `src/content/sync-engine.ts` (new) | PURE: active-line index math, scroll-suspension timing | 3 |
| `src/content/sync-loop.ts` (new) | Wires a real `<video>` + `requestAnimationFrame` to the engine | 4 |
| `src/content/index.ts` | Disposer registry; starts/stops the sync loop per load | 5 |

---

### Task 1: Panel seam — typed lines, active-line highlighting, manual-scroll detection

The panel currently throws away the `timeMs` that `parseLrc` produces (`setLines(lines: string[])`) and has no way to highlight a line or learn that the user scrolled by hand. Both are needed before the sync engine has anywhere to report to. This task also gives the panel its Spotify look: the active line is large, bold-white, and everything else is dimmed and smaller, with a soft fade at the top and bottom of the list and a smooth CSS transition between states.

**Files:**
- Modify: `src/content/panel.ts`
- Modify: `src/content/panel-styles.ts`
- Test: `tests/content/panel.test.ts`

**Interfaces:**
- Consumes: `LyricLine` from `../core/types` (`{ timeMs: number; text: string }`).
- Produces:
  ```ts
  interface PanelHandle {
    setHeader(title: string, subtitle: string): void;
    setStatus(message: string): void;
    setLines(lines: LyricLine[]): void;
    setActiveLine(index: number | null, autoScroll: boolean): void;
    onManualScroll(callback: () => void): void;
    destroy(): void;
  }
  ```
  `setActiveLine(null, ...)` clears all highlighting. `autoScroll` gates only the scroll-into-view call, not the highlight itself. `onManualScroll` replaces the previously-registered callback rather than stacking — only one sync loop is ever active for a panel at a time, so there is nothing to leak.

- [ ] **Step 1: Write the failing/updated test file**

Replace `tests/content/panel.test.ts` in full:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountPanel, PANEL_HOST_ID } from '../../src/content/panel';
import type { LyricLine } from '../../src/core/types';

function container(): HTMLElement {
  document.body.innerHTML = '<div id="secondary"></div>';
  return document.querySelector<HTMLElement>('#secondary')!;
}

function shadowOf(host: HTMLElement): ShadowRoot {
  const el = host.querySelector(`#${PANEL_HOST_ID}`)!;
  return (el as HTMLElement).shadowRoot!;
}

function lines(...texts: string[]): LyricLine[] {
  return texts.map((text, i) => ({ timeMs: i * 1000, text }));
}

describe('mountPanel', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = container();
    // jsdom does not implement scrollIntoView (real Chromium always does);
    // setActiveLine's autoScroll path calls it directly, so tests supply it.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('attaches a host element with an open shadow root', () => {
    mountPanel(host);
    const el = host.querySelector(`#${PANEL_HOST_ID}`) as HTMLElement | null;
    expect(el).not.toBeNull();
    expect(el!.shadowRoot).not.toBeNull();
  });

  it('renders one list item per lyric line', () => {
    const panel = mountPanel(host);
    panel.setLines(lines('line one', 'line two', 'line three'));
    expect(shadowOf(host).querySelectorAll('.kx-line')).toHaveLength(3);
  });

  it('renders lyric text literally, never as markup', () => {
    // Lyrics come from a third-party API, so they are untrusted input.
    const panel = mountPanel(host);
    panel.setLines(lines('<img src=x onerror=alert(1)>'));
    const line = shadowOf(host).querySelector('.kx-line')!;
    expect(line.querySelector('img')).toBeNull();
    expect(line.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('preserves Thai text unchanged', () => {
    const panel = mountPanel(host);
    panel.setLines(lines('ฉันคนไม่จำเป็น'));
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

  it('shows the status element and sets its text for a non-empty message', () => {
    const panel = mountPanel(host);
    panel.setStatus('Looking up lyrics…');
    const el = shadowOf(host).querySelector<HTMLElement>('.kx-status')!;
    expect(el.textContent).toBe('Looking up lyrics…');
    expect(el.style.display).toBe('block');
  });

  it('hides the status element for an empty message', () => {
    const panel = mountPanel(host);
    panel.setStatus('Looking up lyrics…');
    panel.setStatus('');
    const el = shadowOf(host).querySelector<HTMLElement>('.kx-status')!;
    expect(el.textContent).toBe('');
    expect(el.style.display).toBe('none');
  });

  it('sets header text', () => {
    const panel = mountPanel(host);
    panel.setHeader('คนไม่จำเป็น', 'Three Man Down');
    const shadow = shadowOf(host);
    expect(shadow.querySelector('.kx-title')!.textContent).toBe('คนไม่จำเป็น');
    expect(shadow.querySelector('.kx-subtitle')!.textContent).toBe('Three Man Down');
  });

  describe('setActiveLine', () => {
    it('marks exactly the line at the given index as active', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b', 'c'));
      panel.setActiveLine(1, false);
      const items = shadowOf(host).querySelectorAll('.kx-line');
      expect(items[0]!.classList.contains('kx-line-active')).toBe(false);
      expect(items[1]!.classList.contains('kx-line-active')).toBe(true);
      expect(items[2]!.classList.contains('kx-line-active')).toBe(false);
    });

    it('moves the active class when called again with a different index', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b', 'c'));
      panel.setActiveLine(0, false);
      panel.setActiveLine(2, false);
      const items = shadowOf(host).querySelectorAll('.kx-line');
      expect(items[0]!.classList.contains('kx-line-active')).toBe(false);
      expect(items[2]!.classList.contains('kx-line-active')).toBe(true);
    });

    it('clears all highlighting when index is null', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      panel.setActiveLine(0, false);
      panel.setActiveLine(null, false);
      const items = shadowOf(host).querySelectorAll('.kx-line');
      expect(items[0]!.classList.contains('kx-line-active')).toBe(false);
      expect(items[1]!.classList.contains('kx-line-active')).toBe(false);
    });

    it('scrolls the active line into view when autoScroll is true', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      panel.setActiveLine(1, true);
      const items = shadowOf(host).querySelectorAll('.kx-line');
      expect(items[1]!.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    });

    it('does not scroll when autoScroll is false', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      panel.setActiveLine(1, false);
      const items = shadowOf(host).querySelectorAll('.kx-line');
      expect(items[1]!.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('onManualScroll', () => {
    it('fires the registered callback on a wheel event over the lyric list', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      const callback = vi.fn();
      panel.onManualScroll(callback);
      shadowOf(host).querySelector('.kx-lines')!.dispatchEvent(new Event('wheel'));
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('fires the registered callback on a touchmove event over the lyric list', () => {
      const panel = mountPanel(host);
      const callback = vi.fn();
      panel.onManualScroll(callback);
      shadowOf(host).querySelector('.kx-lines')!.dispatchEvent(new Event('touchmove'));
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('replaces rather than stacks the callback on repeated registration', () => {
      const panel = mountPanel(host);
      const first = vi.fn();
      const second = vi.fn();
      panel.onManualScroll(first);
      panel.onManualScroll(second);
      shadowOf(host).querySelector('.kx-lines')!.dispatchEvent(new Event('wheel'));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/content/panel.test.ts`
Expected: FAIL — `setActiveLine`/`onManualScroll` do not exist on the object returned by `mountPanel`, and `setLines` type errors are ignored at runtime (TS is not enforced by Vitest at test time) but the new `describe` blocks fail outright.

- [ ] **Step 3: Rewrite `src/content/panel.ts`**

```ts
import { PANEL_STYLES } from './panel-styles';
import type { LyricLine } from '../core/types';

export const PANEL_HOST_ID = 'karaoke-lyrics-panel-host';

export interface PanelHandle {
  setHeader(title: string, subtitle: string): void;
  setStatus(message: string): void;
  setLines(lines: LyricLine[]): void;
  /** Highlights the line at `index` (null clears highlighting). Scrolls it
   * into view, centered, only when `autoScroll` is true. */
  setActiveLine(index: number | null, autoScroll: boolean): void;
  /** Replaces the callback fired when the user scrolls the lyric list by
   * hand (wheel or touch) — not additive, since only one sync loop is ever
   * active for a panel at a time. */
  onManualScroll(callback: () => void): void;
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

  const linesEl = find<HTMLElement>('.kx-lines');

  // A single replaceable slot, not an event-target list: only one sync loop
  // drives a panel at a time, so there is nothing to leak across restarts.
  let manualScrollListener: (() => void) | null = null;
  linesEl.addEventListener('wheel', () => manualScrollListener?.(), { passive: true });
  linesEl.addEventListener('touchmove', () => manualScrollListener?.(), { passive: true });

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
        ...lines.map((line) => {
          const li = document.createElement('li');
          li.className = 'kx-line';
          li.textContent = line.text;
          return li;
        }),
      );
    },
    setActiveLine(index, autoScroll) {
      const items = find<HTMLElement>('.kx-lines').children;
      for (let i = 0; i < items.length; i++) {
        items[i]!.classList.toggle('kx-line-active', i === index);
      }
      if (index !== null && autoScroll) {
        const active = items[index] as HTMLElement | undefined;
        active?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    onManualScroll(callback) {
      manualScrollListener = callback;
    },
    destroy() {
      host.remove();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/content/panel.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Give the panel its Spotify-style look**

Replace `src/content/panel-styles.ts` in full:

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
    /* Generous top/bottom padding lets scrollIntoView({block:'center'})
       actually center lines near the start or end of the list, not just
       ones in the middle — the scroll container needs room to move past
       its own content bounds. */
    padding: 40% 0;
    overflow-y: auto;
    scroll-behavior: smooth;
    font-size: 14px;
    line-height: 1.9;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
  }
  .kx-line {
    color: #a7a7a7;
    padding: 6px 0;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.55;
    transition: color 0.25s ease, opacity 0.25s ease, font-size 0.25s ease;
  }
  .kx-line-active {
    color: #ffffff;
    opacity: 1;
    font-size: 20px;
  }
`;
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests PASS (the panel test count grew; nothing else should have changed).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/content/panel.ts src/content/panel-styles.ts tests/content/panel.test.ts
git commit -m "feat: panel seam — typed lyric lines, active-line highlight, manual-scroll detection"
```

---

### Task 2: Render plan carries real timestamps and a `synced` flag

`planRender` currently discards the `timeMs` values `parseLrc` produces by mapping straight to `string[]`. It now returns `LyricLine[]` (so Task 1's `setLines` has something typed to receive) plus a `synced` flag the sync loop uses to decide whether it's safe to run at all — plain-text lyrics have no real timestamps, only placeholder indices, and driving the sync engine off those would silently "sync" nonsense.

**Files:**
- Modify: `src/content/render-plan.ts`
- Test: `tests/content/render-plan.test.ts`

**Interfaces:**
- Consumes: `parseLrc` from `../core/lrc-parser`; `LrclibRecord`, `LyricLine` from `../core/types`.
- Produces:
  ```ts
  interface RenderPlan {
    status: string;
    lines: LyricLine[];
    synced: boolean;
  }
  function planRender(record: LrclibRecord): RenderPlan;
  ```
  `synced: true` only when `lines` carries real per-line timestamps from `parseLrc`. Plain-text fallback lines get a placeholder `timeMs` (their index) purely so the array is typed `LyricLine[]`; `synced: false` is the signal that those timestamps must not be used.

- [ ] **Step 1: Write the failing/updated test file**

Replace `tests/content/render-plan.test.ts` in full:

```ts
import { describe, it, expect } from 'vitest';
import { planRender } from '../../src/content/render-plan';
import type { LrclibRecord } from '../../src/core/types';

function record(over: Partial<LrclibRecord>): LrclibRecord {
  return {
    id: 1,
    trackName: 'Track',
    artistName: 'Artist',
    albumName: null,
    duration: 200,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...over,
  };
}

describe('planRender', () => {
  it('renders synced lyrics with the status hidden and real timestamps', () => {
    const plan = planRender(
      record({ syncedLyrics: '[00:01.00]first\n[00:02.00]second', plainLyrics: 'first\nsecond' }),
    );
    expect(plan.status).toBe('');
    expect(plan.synced).toBe(true);
    expect(plan.lines).toEqual([
      { timeMs: 1000, text: 'first' },
      { timeMs: 2000, text: 'second' },
    ]);
  });

  // A non-empty LRC body that parses to nothing used to render a hidden status
  // over an empty list: no lyrics, no fallback, and no way to tell why.
  it('falls back to plain lyrics when synced lyrics parse to no timed lines', () => {
    const plan = planRender(
      record({
        syncedLyrics: '[ar:Someone]\n[ti:Track]\n[by:uploader]',
        plainLyrics: 'first\nsecond',
      }),
    );
    expect(plan.status).toBe('No timings available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines.map((l) => l.text)).toEqual(['first', 'second']);
  });

  it('reports no lyrics when synced lyrics parse to nothing and there is no plain text', () => {
    const plan = planRender(record({ syncedLyrics: '[ar:Someone]' }));
    expect(plan.status).not.toBe('');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it('renders plain lyrics when there are no synced ones', () => {
    const plan = planRender(record({ plainLyrics: 'one\r\ntwo' }));
    expect(plan.status).toBe('No timings available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines.map((l) => l.text)).toEqual(['one', 'two']);
  });

  it('says instrumental only when the record is marked instrumental', () => {
    const plan = planRender(record({ instrumental: true }));
    expect(plan.status).toBe('This track is marked instrumental.');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it('does not claim a record is instrumental when its lyrics are merely missing', () => {
    const plan = planRender(record({ instrumental: false }));
    expect(plan.status).toBe('No lyrics available for this track.');
    expect(plan.synced).toBe(false);
    expect(plan.lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/content/render-plan.test.ts`
Expected: FAIL — `plan.synced` is `undefined`, `plan.lines` is `string[]` not matching the object-shape assertions.

- [ ] **Step 3: Rewrite `src/content/render-plan.ts`**

```ts
import { parseLrc } from '../core/lrc-parser';
import type { LrclibRecord, LyricLine } from '../core/types';

export interface RenderPlan {
  /** Empty string means "hide the status element" — see PanelHandle.setStatus. */
  status: string;
  lines: LyricLine[];
  /**
   * True when `lines` carries real per-line timestamps the sync engine can
   * drive off. False for plain-text lyrics (`timeMs` is a placeholder index,
   * not a real time) and for the no-lyrics/instrumental cases.
   */
  synced: boolean;
}

/**
 * Decides what the panel shows for a record. Pure, so the branch order is
 * testable without a DOM.
 *
 * Synced lyrics are only preferred once they PARSE to at least one timed line:
 * a non-empty LRC body of nothing but metadata tags yields zero lines, and
 * rendering that leaves a blank status over a blank list with no fallback and
 * no explanation.
 */
export function planRender(record: LrclibRecord): RenderPlan {
  const syncedLines = parseLrc(record.syncedLyrics ?? '');
  if (syncedLines.length > 0) {
    return { status: '', lines: syncedLines, synced: true };
  }

  if (record.plainLyrics?.trim()) {
    return {
      status: 'No timings available for this track.',
      lines: record.plainLyrics.split(/\r?\n/).map((text, index) => ({ timeMs: index, text })),
      synced: false,
    };
  }

  // Absent lyrics and a declared instrumental are different facts about the
  // record, so they must not share one confidently-wrong message.
  return {
    status: record.instrumental
      ? 'This track is marked instrumental.'
      : 'No lyrics available for this track.',
    lines: [],
    synced: false,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/content/render-plan.test.ts`
Expected: all six tests PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests PASS. `src/content/index.ts` still calls `panel.setLines(plan.lines)` with the old `string[]`-shaped assumption baked into nothing explicit — it will now receive `LyricLine[]`, which matches Task 1's new `setLines` signature, so this should already be consistent. If `npm run typecheck` (next) disagrees, do not paper over it — Task 5 is where `content/index.ts` is deliberately revisited.

Run: `npm run typecheck`
Expected: no errors. (`content/index.ts`'s `panel.setLines(plan.lines)` call was already passing whatever `plan.lines` was typed as; both sides changed together in this task and Task 1, so this should be clean without touching `content/index.ts` yet.)

- [ ] **Step 6: Commit**

```bash
git add src/content/render-plan.ts tests/content/render-plan.test.ts
git commit -m "feat: render plan carries real per-line timestamps and a synced flag"
```

---

### Task 3: Pure sync engine — active-line index and scroll-suspension math

This is the module the spec means by "the engine consumes a `{ currentTime, paused }` source rather than a `<video>` element directly, so it can be driven by a fake clock in tests" — except paused-ness turns out not to belong here (see the docblock below): a caller wants a recompute from a `seeked` event even while genuinely paused, so the play/pause decision belongs to the impure driver in Task 4, not to this pure index math. Everything here is plain functions over explicit numbers; no test needs a real timer.

**Files:**
- Create: `src/content/sync-engine.ts`
- Test: `tests/content/sync-engine.test.ts`

**Interfaces:**
- Consumes: `LyricLine` from `../core/types`.
- Produces:
  ```ts
  const SCROLL_SUSPEND_MS: number; // 3000
  interface SyncEngineState { activeIndex: number | null; lastManualScrollAtMs: number | null; }
  function createSyncEngineState(): SyncEngineState;
  function findActiveLineIndex(lines: LyricLine[], currentTimeMs: number): number | null;
  function isScrollSuspended(lastManualScrollAtMs: number | null, nowMs: number): boolean;
  interface SyncTick { index: number | null; autoScroll: boolean; }
  function tick(state: SyncEngineState, lines: LyricLine[], currentTimeMs: number, nowMs: number): SyncTick | null;
  function notifyManualScroll(state: SyncEngineState, nowMs: number): void;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/content/sync-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  findActiveLineIndex,
  isScrollSuspended,
  createSyncEngineState,
  tick,
  notifyManualScroll,
  SCROLL_SUSPEND_MS,
} from '../../src/content/sync-engine';
import type { LyricLine } from '../../src/core/types';

const LINES: LyricLine[] = [
  { timeMs: 0, text: 'first' },
  { timeMs: 1000, text: 'second' },
  { timeMs: 2500, text: 'third' },
];

describe('findActiveLineIndex', () => {
  it('returns null for an empty line list', () => {
    expect(findActiveLineIndex([], 5000)).toBeNull();
  });

  it('returns null before the first line timestamp', () => {
    expect(findActiveLineIndex(LINES, -1)).toBeNull();
  });

  it('returns the first index exactly at its own timestamp', () => {
    expect(findActiveLineIndex(LINES, 0)).toBe(0);
  });

  it('returns the index whose timestamp is the latest one not exceeding the given time', () => {
    expect(findActiveLineIndex(LINES, 999)).toBe(0);
    expect(findActiveLineIndex(LINES, 1000)).toBe(1);
    expect(findActiveLineIndex(LINES, 2499)).toBe(1);
  });

  it('returns the last index once time reaches or passes it', () => {
    expect(findActiveLineIndex(LINES, 2500)).toBe(2);
    expect(findActiveLineIndex(LINES, 999_999)).toBe(2);
  });
});

describe('isScrollSuspended', () => {
  it('is not suspended when there has been no manual scroll', () => {
    expect(isScrollSuspended(null, 10_000)).toBe(false);
  });

  it('is suspended immediately after a manual scroll', () => {
    expect(isScrollSuspended(1000, 1000)).toBe(true);
  });

  it('is suspended right up to the threshold', () => {
    expect(isScrollSuspended(1000, 1000 + SCROLL_SUSPEND_MS - 1)).toBe(true);
  });

  it('is no longer suspended once the threshold has elapsed', () => {
    expect(isScrollSuspended(1000, 1000 + SCROLL_SUSPEND_MS)).toBe(false);
  });
});

describe('tick', () => {
  it('returns the active index on the first call', () => {
    const state = createSyncEngineState();
    expect(tick(state, LINES, 500, 0)).toEqual({ index: 0, autoScroll: true });
  });

  it('returns null when the active index has not changed', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    expect(tick(state, LINES, 900, 100)).toBeNull();
  });

  it('returns a new tick when the active index changes', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    expect(tick(state, LINES, 1200, 700)).toEqual({ index: 1, autoScroll: true });
  });

  it('reports autoScroll false while a manual scroll is still suspending it', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    notifyManualScroll(state, 600);
    expect(tick(state, LINES, 1200, 1000)).toEqual({ index: 1, autoScroll: false });
  });

  it('reports autoScroll true again once the suspension window has passed', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 500, 0);
    notifyManualScroll(state, 600);
    expect(tick(state, LINES, 2600, 600 + SCROLL_SUSPEND_MS)).toEqual({ index: 2, autoScroll: true });
  });

  it('still updates the index on a rewind to an earlier time', () => {
    const state = createSyncEngineState();
    tick(state, LINES, 2600, 0);
    expect(tick(state, LINES, 500, 100)).toEqual({ index: 0, autoScroll: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/content/sync-engine.test.ts`
Expected: FAIL — cannot resolve `../../src/content/sync-engine`.

- [ ] **Step 3: Write `src/content/sync-engine.ts`**

```ts
import type { LyricLine } from '../core/types';

/** How long, in ms, auto-scroll stays suspended after a manual scroll. */
export const SCROLL_SUSPEND_MS = 3000;

export interface SyncEngineState {
  activeIndex: number | null;
  lastManualScrollAtMs: number | null;
}

export function createSyncEngineState(): SyncEngineState {
  return { activeIndex: null, lastManualScrollAtMs: null };
}

/**
 * Index of the line active at `currentTimeMs`, or null before the first
 * line's timestamp (or if there are no lines).
 *
 * Binary search over `lines`, which parseLrc guarantees are sorted ascending
 * by timeMs. Finds the last line whose timeMs does not exceed currentTimeMs.
 */
export function findActiveLineIndex(lines: LyricLine[], currentTimeMs: number): number | null {
  if (lines.length === 0 || currentTimeMs < lines[0]!.timeMs) return null;

  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lines[mid]!.timeMs <= currentTimeMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** True while auto-scroll should stay suspended after a manual scroll. */
export function isScrollSuspended(lastManualScrollAtMs: number | null, nowMs: number): boolean {
  return lastManualScrollAtMs !== null && nowMs - lastManualScrollAtMs < SCROLL_SUSPEND_MS;
}

export interface SyncTick {
  index: number | null;
  autoScroll: boolean;
}

/**
 * Recomputes the active index for `currentTimeMs` and returns the tick the
 * panel should apply, or null if the index has not changed since the last
 * call — the caller must not touch the panel in that case, since the DOM
 * should update only when the active line actually moves.
 *
 * Mutates `state` in place: `state.activeIndex` tracks what the panel was
 * last told, and `state.lastManualScrollAtMs` is set by `notifyManualScroll`.
 * Deliberately takes no opinion on play/pause — a caller wants a tick from a
 * scrub (`seeked`) even while paused, so that decision belongs to the caller,
 * not this function.
 */
export function tick(
  state: SyncEngineState,
  lines: LyricLine[],
  currentTimeMs: number,
  nowMs: number,
): SyncTick | null {
  const index = findActiveLineIndex(lines, currentTimeMs);
  if (index === state.activeIndex) return null;
  state.activeIndex = index;
  return { index, autoScroll: !isScrollSuspended(state.lastManualScrollAtMs, nowMs) };
}

/** Records that the user just scrolled the lyric list by hand. */
export function notifyManualScroll(state: SyncEngineState, nowMs: number): void {
  state.lastManualScrollAtMs = nowMs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/content/sync-engine.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Run: `npm run typecheck`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/content/sync-engine.ts tests/content/sync-engine.test.ts
git commit -m "feat: pure sync engine for active-line index and scroll-suspension timing"
```

---

### Task 4: Sync loop — wires a real `<video>` to the engine via `requestAnimationFrame`

The only impure piece: listens to the video's `play`/`pause`/`seeked` events, drives `sync-engine.tick` from a `requestAnimationFrame` chain that only runs while playing, and forwards the panel's manual-scroll callback into `notifyManualScroll`.

**Files:**
- Create: `src/content/sync-loop.ts`
- Test: `tests/content/sync-loop.test.ts`

**Interfaces:**
- Consumes: `LyricLine` from `../core/types`; `PanelHandle` from `./panel`; `createSyncEngineState`, `tick`, `notifyManualScroll` from `./sync-engine`.
- Produces:
  ```ts
  interface SyncLoopHandle { stop(): void; }
  function startSyncLoop(video: HTMLVideoElement, panel: PanelHandle, lines: LyricLine[]): SyncLoopHandle;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/content/sync-loop.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startSyncLoop } from '../../src/content/sync-loop';
import type { PanelHandle } from '../../src/content/panel';
import type { LyricLine } from '../../src/core/types';

const LINES: LyricLine[] = [
  { timeMs: 0, text: 'first' },
  { timeMs: 1000, text: 'second' },
];

function mockPanel(): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    destroy: vi.fn(),
  };
}

/** A controllable fake rAF: captures the callback instead of scheduling it,
 * so the test decides exactly when a frame runs. */
function fakeRaf() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      pending.delete(id);
    }),
    runFrame(now = 0) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb(now);
    },
    pendingCount() {
      return pending.size;
    },
  };
}

function video(): HTMLVideoElement {
  return document.createElement('video');
}

describe('startSyncLoop', () => {
  let raf: ReturnType<typeof fakeRaf>;

  beforeEach(() => {
    raf = fakeRaf();
    vi.stubGlobal('requestAnimationFrame', raf.requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', raf.cancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule a frame for a paused video until it plays', () => {
    const v = video();
    startSyncLoop(v, mockPanel(), LINES);
    expect(raf.pendingCount()).toBe(0);
  });

  it('schedules a frame immediately for a video already playing', () => {
    const v = video();
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    startSyncLoop(v, mockPanel(), LINES);
    expect(raf.pendingCount()).toBe(1);
  });

  it('updates the panel active line as currentTime advances across frames', () => {
    const v = video();
    const panel = mockPanel();
    startSyncLoop(v, panel, LINES);
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 0.5, configurable: true });
    raf.runFrame();
    expect(panel.setActiveLine).toHaveBeenCalledWith(0, true);

    Object.defineProperty(v, 'currentTime', { value: 1.2, configurable: true });
    raf.runFrame();
    expect(panel.setActiveLine).toHaveBeenCalledWith(1, true);
  });

  it('does not call the panel again while the index is unchanged', () => {
    const v = video();
    const panel = mockPanel();
    startSyncLoop(v, panel, LINES);
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 0.1, configurable: true });
    raf.runFrame();
    Object.defineProperty(v, 'currentTime', { value: 0.2, configurable: true });
    raf.runFrame();
    expect(panel.setActiveLine).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling frames on pause and resumes on play', () => {
    const v = video();
    startSyncLoop(v, mockPanel(), LINES);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
    v.dispatchEvent(new Event('pause'));
    expect(raf.pendingCount()).toBe(0);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
  });

  it('recomputes the active line on seeked even while paused', () => {
    const v = video();
    const panel = mockPanel();
    startSyncLoop(v, panel, LINES);

    Object.defineProperty(v, 'currentTime', { value: 1.5, configurable: true });
    v.dispatchEvent(new Event('seeked'));
    expect(panel.setActiveLine).toHaveBeenCalledWith(1, true);
  });

  it('routes a manual scroll from the panel into the engine, suppressing the next autoScroll', () => {
    const v = video();
    const panel = mockPanel();
    startSyncLoop(v, panel, LINES);
    const manualScrollHandler = (panel.onManualScroll as ReturnType<typeof vi.fn>).mock.calls[0]![0] as () => void;

    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'currentTime', { value: 0.1, configurable: true });
    raf.runFrame();

    manualScrollHandler();

    Object.defineProperty(v, 'currentTime', { value: 1.1, configurable: true });
    raf.runFrame();
    expect(panel.setActiveLine).toHaveBeenLastCalledWith(1, false);
  });

  it('stop() cancels any pending frame and removes listeners', () => {
    const v = video();
    const panel = mockPanel();
    const handle = startSyncLoop(v, panel, LINES);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);

    handle.stop();
    expect(raf.pendingCount()).toBe(0);

    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/content/sync-loop.test.ts`
Expected: FAIL — cannot resolve `../../src/content/sync-loop`.

- [ ] **Step 3: Write `src/content/sync-loop.ts`**

```ts
import type { LyricLine } from '../core/types';
import type { PanelHandle } from './panel';
import { createSyncEngineState, tick, notifyManualScroll } from './sync-engine';

export interface SyncLoopHandle {
  stop(): void;
}

/**
 * Drives `panel.setActiveLine` from `video`'s playback, via the pure
 * sync-engine. The rAF chain only runs while the video is playing — a spec
 * requirement, and it avoids burning CPU on a paused tab. A `seeked` event
 * (a manual scrub, which can happen while paused) forces one recompute even
 * when no rAF chain is running.
 */
export function startSyncLoop(video: HTMLVideoElement, panel: PanelHandle, lines: LyricLine[]): SyncLoopHandle {
  const state = createSyncEngineState();
  let rafId: number | null = null;

  function apply(): void {
    const result = tick(state, lines, video.currentTime * 1000, Date.now());
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

  if (!video.paused) handlePlay();

  return {
    stop() {
      handlePause();
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', apply);
      panel.onManualScroll(() => {});
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/content/sync-loop.test.ts`
Expected: all eight tests PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Run: `npm run typecheck`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/content/sync-loop.ts tests/content/sync-loop.test.ts
git commit -m "feat: sync loop wires video playback to the sync engine via requestAnimationFrame"
```

---

### Task 5: Wire the sync loop into the content script lifecycle

The last piece: start a sync loop when a load produces synced lyrics, and guarantee it stops — both on navigation (`teardown`) and on a same-video reload (when YouTube's title swap triggers `load` again without a `teardown` in between; see `reconcile.ts`'s `reload` action). A bare nullable variable mirroring `panel`'s pattern would work for exactly one resource, but this codebase has a demonstrated history of exactly this kind of bug (see SESSION.md's "Hard-won lessons" and the Sprint 2.5 whole-branch review) — a resource created in one place and only *sometimes* remembered to be cleaned up in the two places that need it. A small disposer registry makes that structurally impossible instead of relying on remembering it.

`content/index.ts` has no dedicated test file — consistent with the rest of this file, which is DOM/chrome-touching orchestration whose *decisions* are delegated to tested pure functions (`decideReconcile`, `planRender`) and whose *wiring* is verified manually, per the spec's own testing section ("everything that reads YouTube's DOM" is manual-only).

**Files:**
- Modify: `src/content/index.ts`

**Interfaces:**
- Consumes: `startSyncLoop`, `SyncLoopHandle` from `./sync-loop`; everything this file already imports.
- Produces: nothing new for other modules — this is the top of the dependency graph.

- [ ] **Step 1: Read the existing file**

Read `src/content/index.ts` in full before editing. This rewrite adds a disposer registry and starts/stops the sync loop; it must not otherwise change `waitForSecondary`, `waitForSong`'s duration-polling docblock, the `generation` counter, or `reconcile`'s switch — all came from earlier fix rounds and are load-bearing.

- [ ] **Step 2: Rewrite `src/content/index.ts`**

```ts
import { mountPanel, type PanelHandle } from './panel';
import { detectSong, type DetectedSong } from './song-detector';
import { decideReconcile } from './reconcile';
import { planRender } from './render-plan';
import { startSyncLoop, type SyncLoopHandle } from './sync-loop';
import { parseVideoId } from '../core/youtube-url';
import { normalizeTitleCandidates } from '../core/title-normalizer';
import type { FetchLyricsRequest, FetchLyricsResponse } from '../messaging/types';

const SECONDARY_SELECTOR = '#secondary';
const SECONDARY_POLL_MS = 200;
const SECONDARY_TIMEOUT_MS = 10_000;
const NAVIGATION_POLL_MS = 1000;
const TITLE_TIMEOUT_MS = 10_000;

let panel: PanelHandle | null = null;
let currentVideoId: string | null = null;
/** Raw title the displayed lyrics were fetched for; null while nothing is shown. */
let renderedTitle: string | null = null;
let isLoading = false;
/**
 * Bumped on every teardown and every load so in-flight async work can tell that
 * it has been superseded. Replaces comparing against currentVideoId, which could
 * not distinguish "same video, but we have started a fresh load".
 */
let generation = 0;

/**
 * Cleanup for resources tied to whatever is currently displayed (today, just
 * the sync loop). Registered where the resource is created; run wherever that
 * display is about to be replaced — `teardown` (navigation) and `load` (a
 * same-video reload) both qualify, so this is centralized rather than
 * duplicated as an ad-hoc nullable variable at each call site.
 */
let disposers: Array<() => void> = [];

function addDisposer(dispose: () => void): void {
  disposers.push(dispose);
}

function disposeAll(): void {
  for (const dispose of disposers) dispose();
  disposers = [];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function teardown(): void {
  disposeAll();
  panel?.destroy();
  panel = null;
  renderedTitle = null;
  isLoading = false;
  generation += 1;
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
 * The heading and the video's duration both appear after navigation settles, so
 * poll rather than reading once and giving up.
 *
 * INVARIANT: the navigation poll may fire before the DOM updates — YouTube
 * pushes the new URL while the heading and the reused <video> element still
 * hold the PREVIOUS video's data. So detection must verify the page's own video
 * id, and a title alone is not enough to stop polling: keep going until the
 * duration is readable too, since a missing duration silently costs the scorer
 * its main disambiguator. The timeout is the guard for both.
 */
async function waitForSong(videoId: string): Promise<DetectedSong | null> {
  const deadline = Date.now() + TITLE_TIMEOUT_MS;
  let withoutDuration: DetectedSong | null = null;

  while (Date.now() < deadline) {
    const song = detectSong(document, videoId);
    if (song) {
      if (song.durationSec !== null) return song;
      withoutDuration = song;
    }
    await delay(SECONDARY_POLL_MS);
  }

  return withoutDuration;
}

/** Mounts the panel for a newly-opened video, then loads its lyrics. */
async function activate(videoId: string): Promise<void> {
  const gen = generation;
  const container = await waitForSecondary();
  if (!container || gen !== generation) return;

  panel = mountPanel(container);
  panel.setHeader('Karaoke Lyrics', 'identifying song…');
  panel.setStatus('Looking up lyrics…');

  await load(videoId, gen);
}

/** Fetches and renders lyrics. Safe to call again when the title changes. */
async function load(videoId: string, gen: number): Promise<void> {
  isLoading = true;
  try {
    const song = await waitForSong(videoId);
    if (gen !== generation || !panel) return;

    if (!song) {
      panel.setStatus('Could not read the video title.');
      return;
    }

    // Recorded before any further await so that a later heading swap registers
    // as a change and triggers a reload.
    renderedTitle = song.rawTitle;

    const readings = normalizeTitleCandidates(song.rawTitle);
    const primary = readings[0]!;
    panel.setHeader(primary.track, primary.artist ?? 'unknown artist');

    const request: FetchLyricsRequest = {
      type: 'FETCH_LYRICS',
      videoId,
      artist: primary.artist,
      track: primary.track,
      durationSec: song.durationSec,
      alternates: readings.slice(1),
    };

    let response: FetchLyricsResponse;
    try {
      response = await chrome.runtime.sendMessage<FetchLyricsRequest, FetchLyricsResponse>(request);
    } catch (error) {
      console.error('[karaoke] message failed', error);
      if (gen === generation && panel) {
        panel.setStatus('Extension worker unavailable. Reload the page.');
      }
      return;
    }

    if (gen !== generation || !panel) return;

    if (!response.ok) {
      panel.setStatus(response.message);
      panel.setLines([]);
      return;
    }

    const { record } = response;
    panel.setHeader(record.trackName, record.artistName);

    const plan = planRender(record);

    // A previous load's sync loop (if any) is tied to lyrics we are about to
    // replace — stop it exactly when the content it drove stops being shown.
    disposeAll();
    panel.setStatus(plan.status);
    panel.setLines(plan.lines);

    if (plan.synced) {
      const video = document.querySelector('video');
      if (video) {
        const syncLoop: SyncLoopHandle = startSyncLoop(video, panel, plan.lines);
        addDisposer(syncLoop.stop);
      }
    }
  } finally {
    if (gen === generation) isLoading = false;
  }
}

function reconcile(): void {
  const urlVideoId = parseVideoId(location.href);
  const detectedTitle = urlVideoId ? (detectSong(document, urlVideoId)?.rawTitle ?? null) : null;

  const action = decideReconcile({
    urlVideoId,
    currentVideoId,
    detectedTitle,
    renderedTitle,
    hasPanel: panel !== null,
    isLoading,
  });

  switch (action.kind) {
    case 'idle':
      return;
    case 'clear':
      currentVideoId = null;
      teardown();
      return;
    case 'activate':
      currentVideoId = action.videoId;
      teardown();
      void activate(action.videoId).catch((error) => {
        console.error('[karaoke] activate failed', error);
      });
      return;
    case 'reload': {
      // A fresh generation invalidates whatever the previous load was awaiting.
      generation += 1;
      const gen = generation;
      void load(action.videoId, gen).catch((error) => {
        console.error('[karaoke] reload failed', error);
      });
      return;
    }
  }
}

// Primary signal; YouTube fires this on its own SPA navigations.
document.addEventListener('yt-navigate-finish', reconcile);
// Backup signal, and the mechanism that self-corrects a stale title read.
setInterval(reconcile, NAVIGATION_POLL_MS);

reconcile();
```

- [ ] **Step 3: Run the full suite, typecheck, and build**

Run: `npm test`
Expected: all tests PASS (this file has no dedicated test, so the count should match Task 4's end state exactly).

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: both `dist/content.js` and `dist/background.js` build cleanly. `tests/build.test.ts` (part of `npm test`) already asserts the content bundle has no ES module syntax; this task adds no new imports across that boundary.

- [ ] **Step 4: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: wire the sync loop into the content script lifecycle via a disposer registry"
```

---

## Manual verification (cannot be automated — see spec's Testing section)

Rebuild (`npm run build`) and reload at `opera://extensions` before starting.

1. Open a song with synced lyrics on LRCLIB (any of the English titles that passed the Sprint 2.5 ten-song check are good candidates). Press play.
   - The current line should be white, bold, and larger than the rest; other lines dimmed.
   - As playback proceeds, highlighting should move line-by-line at the right moments, and the list should auto-scroll to keep the current line roughly centered, smoothly (not a hard jump).
2. While it's playing, scroll the lyric list by hand (mouse wheel).
   - Auto-scroll should stop moving the list even as the highlight keeps advancing underneath your scroll position.
   - After about 3 seconds without touching it again, auto-scroll should resume and snap back to following the current line.
3. Pause the video.
   - Highlighting should freeze in place (no more index changes).
   - Open the DevTools Performance tab or just watch CPU: there should be no ongoing `requestAnimationFrame` churn while paused.
4. While paused, drag the YouTube scrubber to a different point in the song.
   - The highlighted line should jump immediately to match the new position, without needing to press play first.
5. Click through to a different video (song-to-song navigation, not a reload).
   - The previous video's highlighting must not continue to update. Confirm by watching that no stray highlight changes happen after the new panel mounts, and that pausing/scrolling on the new video behaves independently of whatever you did on the old one.
6. Open a song that has only plain (unsynced) lyrics.
   - No highlighting or auto-scroll should activate — this is `plan.synced === false`, and Task 5's `if (plan.synced)` gate is what's supposed to prevent starting a sync loop against placeholder timestamps.

Record anything that doesn't match — real failing behavior is worth more than any invented fixture, same as the existing Sprint 2.5 exit criterion.
