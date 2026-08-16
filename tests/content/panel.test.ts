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
});
