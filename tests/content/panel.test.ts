// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountPanel, PANEL_HOST_ID } from '../../src/content/panel';
import type { LyricLine, LrclibRecord } from '../../src/core/types';

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

/** A controllable fake rAF: captures the callback instead of scheduling it,
 * so the test decides exactly when a frame runs. Mirrors the helper in
 * sync-loop.test.ts — setActiveLine's scroll-slide animation drives itself
 * via requestAnimationFrame rather than scrollTo({behavior: 'smooth'}). */
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

describe('mountPanel', () => {
  let host: HTMLElement;
  let raf: ReturnType<typeof fakeRaf>;
  beforeEach(() => {
    host = container();
    // jsdom does not implement scrollIntoView on elements.
    Element.prototype.scrollIntoView = vi.fn();
    raf = fakeRaf();
    vi.stubGlobal('requestAnimationFrame', raf.requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', raf.cancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('defaults to the dimmed style, requiring setActiveLine to highlight a line', () => {
    const panel = mountPanel(host);
    panel.setLines(lines('a', 'b'));
    const items = shadowOf(host).querySelectorAll('.kx-line');
    expect(items[0]!.classList.contains('kx-line-active')).toBe(false);
    expect(items[1]!.classList.contains('kx-line-active')).toBe(false);
  });

  it('renders every line pre-highlighted when synced=false (no timestamps to sync against)', () => {
    const panel = mountPanel(host);
    panel.setLines(lines('a', 'b'), false);
    const items = shadowOf(host).querySelectorAll('.kx-line');
    expect(items[0]!.classList.contains('kx-line-active')).toBe(true);
    expect(items[1]!.classList.contains('kx-line-active')).toBe(true);
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

    it('slides the lyrics container (not the page) toward the active line when autoScroll is true', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      Object.defineProperty(linesContainer.children[1]!, 'clientHeight', { value: 40, configurable: true });
      const before = performance.now();
      panel.setActiveLine(1, true);
      // The slide is driven by our own rAF loop, not scrollTo({behavior: 'smooth'})
      // — that has no controllable duration and some browsers (Firefox with
      // the OS "reduce motion" setting) silently turn it into an instant jump.
      expect(raf.pendingCount()).toBe(1);
      raf.runFrame(before + 100000); // far past the animation's duration
      expect(linesContainer.scrollTop).not.toBe(0);
    });

    it('does not scroll when autoScroll is false', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'));
      panel.setActiveLine(1, false);
      expect(raf.pendingCount()).toBe(0);
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

  describe('setScrollTop / getScrollExtentPx', () => {
    it('sets scrollTop on the lyrics container', () => {
      const panel = mountPanel(host);
      panel.setLines(lines('a', 'b'), false);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      panel.setScrollTop(42);
      expect(linesContainer.scrollTop).toBe(42);
    });

    it('reports scrollHeight minus clientHeight as the scrollable extent', () => {
      const panel = mountPanel(host);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      Object.defineProperty(linesContainer, 'scrollHeight', { value: 500, configurable: true });
      Object.defineProperty(linesContainer, 'clientHeight', { value: 200, configurable: true });
      expect(panel.getScrollExtentPx()).toBe(300);
    });

    it('floors the extent at 0 when content is shorter than the container', () => {
      const panel = mountPanel(host);
      const linesContainer = shadowOf(host).querySelector<HTMLElement>('.kx-lines')!;
      Object.defineProperty(linesContainer, 'scrollHeight', { value: 100, configurable: true });
      Object.defineProperty(linesContainer, 'clientHeight', { value: 200, configurable: true });
      expect(panel.getScrollExtentPx()).toBe(0);
    });
  });

  describe('setSpeedControls', () => {
    it('hides the speed bar by default', () => {
      mountPanel(host);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-speed')!;
      expect(el.classList.contains('kx-hidden')).toBe(true);
    });

    it('shows the speed bar with a formatted multiplier when visible=true', () => {
      const panel = mountPanel(host);
      panel.setSpeedControls(true, 1.4);
      const el = shadowOf(host).querySelector<HTMLElement>('.kx-speed')!;
      expect(el.classList.contains('kx-hidden')).toBe(false);
      expect(shadowOf(host).querySelector('.kx-speed-value')!.textContent).toBe('1.4x');
    });

    it('hides the bar again when called with visible=false', () => {
      const panel = mountPanel(host);
      panel.setSpeedControls(true, 1.0);
      panel.setSpeedControls(false);
      expect(shadowOf(host).querySelector<HTMLElement>('.kx-speed')!.classList.contains('kx-hidden')).toBe(true);
    });
  });

  describe('onSpeedNudge', () => {
    it('fires the callback with -0.1 when ▼ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onSpeedNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-speed-down')!.click();
      expect(cb).toHaveBeenCalledWith(-0.1);
    });

    it('fires the callback with +0.1 when ▲ is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onSpeedNudge(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-speed-up')!.click();
      expect(cb).toHaveBeenCalledWith(0.1);
    });
  });

  describe('onScrollPauseToggle', () => {
    it('fires the callback with true on first click, and flips the button to ▶', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onScrollPauseToggle(cb);
      const btn = shadowOf(host).querySelector<HTMLElement>('.kx-scroll-pause')!;
      btn.click();
      expect(cb).toHaveBeenCalledWith(true);
      expect(btn.textContent).toBe('▶');
    });

    it('fires the callback with false on the second click, and flips the button back to ⏸', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onScrollPauseToggle(cb);
      const btn = shadowOf(host).querySelector<HTMLElement>('.kx-scroll-pause')!;
      btn.click();
      btn.click();
      expect(cb).toHaveBeenLastCalledWith(false);
      expect(btn.textContent).toBe('⏸');
    });

    it('setSpeedControls resets an already-paused button back to ⏸', () => {
      const panel = mountPanel(host);
      const btn = shadowOf(host).querySelector<HTMLElement>('.kx-scroll-pause')!;
      btn.click();
      expect(btn.textContent).toBe('▶');
      panel.setSpeedControls(true, 1.0);
      expect(btn.textContent).toBe('⏸');
    });
  });

  describe('onTapSync', () => {
    it('fires the callback when "Sync here" is clicked', () => {
      const panel = mountPanel(host);
      const cb = vi.fn();
      panel.onTapSync(cb);
      shadowOf(host).querySelector<HTMLElement>('.kx-sync-here')!.click();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

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

    it('enterSearchMode pre-fills the input, shows the form, and hides the candidate list', () => {
      const panel = mountPanel(host);
      panel.enterSearchMode('Wonderwall Oasis');
      const shadow = shadowOf(host);
      expect(shadow.querySelector<HTMLInputElement>('.kx-search-input')!.value).toBe('Wonderwall Oasis');
      expect(shadow.querySelector<HTMLElement>('.kx-search-form')!.classList.contains('kx-hidden')).toBe(false);
      expect(shadow.querySelector<HTMLElement>('.kx-candidates')!.classList.contains('kx-hidden')).toBe(true);
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

    it('showCandidates renders one list item per record and hides the search form', () => {
      const panel = mountPanel(host);
      panel.enterSearchMode('test');
      const records: LrclibRecord[] = [
        { id: 1, trackName: 'Wonderwall', artistName: 'Oasis', albumName: null, duration: 258, instrumental: false, plainLyrics: null, syncedLyrics: '[00:01.00]x' },
        { id: 2, trackName: 'Champagne Supernova', artistName: 'Oasis', albumName: null, duration: 400, instrumental: false, plainLyrics: null, syncedLyrics: '[00:01.00]x' },
      ];
      panel.showCandidates(records);
      const shadow = shadowOf(host);
      expect(shadow.querySelectorAll('.kx-candidate')).toHaveLength(2);
      expect(shadow.querySelector<HTMLElement>('.kx-search-form')!.classList.contains('kx-hidden')).toBe(true);
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
});
