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
