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
