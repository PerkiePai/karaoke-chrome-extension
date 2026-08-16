import { PANEL_STYLES } from './panel-styles';
import type { LyricLine, LrclibRecord } from '../core/types';

export const PANEL_HOST_ID = 'karaoke-lyrics-panel-host';

export interface PanelHandle {
  setHeader(title: string, subtitle: string): void;
  setStatus(message: string): void;
  /** `synced=false` (the default is true) renders every line in the same
   *  bold/white style as an active line — used for plain-text lyrics that
   *  have no timestamps to highlight against. */
  setLines(lines: LyricLine[], synced?: boolean): void;
  /** Highlights the line at `index` (null clears highlighting). Scrolls it
   * into view, centered, only when `autoScroll` is true. */
  setActiveLine(index: number | null, autoScroll: boolean): void;
  /** Replaces the callback fired when the user scrolls the lyric list by
   * hand (wheel or touch) — not additive, since only one sync loop is ever
   * active for a panel at a time. */
  onManualScroll(callback: () => void): void;
  /** Shows or hides the ◀ ▶ offset controls and updates the displayed value.
   *  When visible=false the value argument is ignored. */
  setOffsetControls(visible: boolean, offsetSec?: number): void;
  /** Replaces the callback fired when ◀ (delta = -0.25) or ▶ (delta = +0.25) is clicked. */
  onOffsetNudge(callback: (delta: number) => void): void;
  /** Shows or hides the "Not this one?" button. */
  showCorrectBar(visible: boolean): void;
  /** Pre-fills the search input with `query` and shows the search form. Hides any existing candidate list. */
  enterSearchMode(query: string): void;
  /** Renders the candidate list and hides the search form. Empty array hides the list. */
  showCandidates(candidates: LrclibRecord[]): void;
  /** Hides both the search form and the candidate list. */
  exitSearchMode(): void;
  /** Fires when user clicks "Not this one?". */
  onCorrectRequest(callback: () => void): void;
  /** Fires when user submits the search form. */
  onSearch(callback: (query: string) => void): void;
  /** Fires when user clicks a candidate. */
  onCandidatePick(callback: (record: LrclibRecord) => void): void;
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

  let offsetNudgeListener: ((delta: number) => void) | null = null;
  find<HTMLElement>('.kx-offset-back').addEventListener('click', () => {
    offsetNudgeListener?.(-0.25);
  });
  find<HTMLElement>('.kx-offset-fwd').addEventListener('click', () => {
    offsetNudgeListener?.(0.25);
  });

  let correctRequestListener: (() => void) | null = null;
  let searchListener: ((query: string) => void) | null = null;
  let candidatePickListener: ((record: LrclibRecord) => void) | null = null;

  find<HTMLElement>('.kx-not-this').addEventListener('click', () => {
    correctRequestListener?.();
  });

  find<HTMLFormElement>('.kx-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = find<HTMLInputElement>('.kx-search-input').value.trim();
    if (q) searchListener?.(q);
  });

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
    setLines(lines, synced = true) {
      // textContent per line: lyrics are untrusted third-party content.
      find('.kx-lines').replaceChildren(
        ...lines.map((line) => {
          const li = document.createElement('li');
          li.className = synced ? 'kx-line' : 'kx-line kx-line-active';
          li.textContent = line.text;
          return li;
        }),
      );
    },
    setActiveLine(index, autoScroll) {
      const items = linesEl.children;
      for (let i = 0; i < items.length; i++) {
        items[i]!.classList.toggle('kx-line-active', i === index);
      }
      if (index !== null && autoScroll) {
        const active = items[index] as HTMLElement | undefined;
        if (active) {
          // Scroll only the lyrics list, not the page. scrollIntoView() walks
          // all ancestor scroll containers (including YouTube's page scroll),
          // causing the page to jump back up after the suspension window ends.
          const containerRect = linesEl.getBoundingClientRect();
          const activeRect = active.getBoundingClientRect();
          const targetScroll =
            linesEl.scrollTop +
            (activeRect.top - containerRect.top) -
            linesEl.clientHeight / 2 +
            active.clientHeight / 2;
          linesEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
      }
    },
    onManualScroll(callback) {
      manualScrollListener = callback;
    },
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
    destroy() {
      host.remove();
    },
  };
}
