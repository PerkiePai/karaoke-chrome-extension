import { PANEL_STYLES } from './panel-styles';
import type { LyricLine, LrclibRecord } from '../core/types';

export const PANEL_HOST_ID = 'karaoke-lyrics-panel-host';

// Static, trusted markup (no interpolated values) matching YouTube's own
// spec-icon SVGs, so the collapse button reads as a native YouTube control
// rather than a text-glyph circle.
const ICON_SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M17.293 5.293 12 10.586 6.707 5.293a1 1 0 10-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 001.414 1.414L12 13.414l5.293 5.293a1 1 0 001.414-1.414L13.414 12l5.293-5.293a1 1 0 10-1.414-1.414Z"></path></svg>';
const ICON_SVG_COLLAPSED =
  '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 15.05 5.4 8.45l1.4-1.4L12 12.25l5.2-5.2 1.4 1.4Z"></path></svg>';

export interface PanelHandle {
  setHeader(title: string, subtitle: string): void;
  setStatus(message: string): void;
  /** `synced=false` (the default is true) renders every line in the same
   *  bold/white style as an active line — used for plain-text lyrics that
   *  have no timestamps to highlight against. */
  setLines(lines: LyricLine[], synced?: boolean): void;
  /** Replaces the callback fired when a line is clicked, with that line's
   *  index. Only fires for lines rendered with synced=true — unsynced
   *  (plain-text) lines carry a placeholder timeMs, not a real timestamp,
   *  so they render without a click handler or pointer cursor. */
  onLineClick(callback: (index: number) => void): void;
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
  /** Scrolls the lyrics list to an absolute pixel offset, bypassing the
   *  active-line highlight logic in setActiveLine. Used by the auto-scroll
   *  loop for unsynced (plain-text) lyrics, which has no line index to
   *  highlight. */
  setScrollTop(px: number): void;
  /** The lyrics list's current scrollTop — reflects manual scrolling done
   *  since the last setScrollTop call, not just what was last written. */
  getScrollTop(): number;
  /** Maximum scrollable distance in the lyrics list right now
   *  (scrollHeight − clientHeight, floored at 0). */
  getScrollExtentPx(): number;
  /** Shows or hides the auto-scroll speed controls (▼ ▲) and updates the
   *  displayed multiplier. Used only while unsynced (plain-text) lyrics are
   *  showing — synced lyrics use setOffsetControls instead. */
  setSpeedControls(visible: boolean, speed?: number): void;
  /** Replaces the callback fired when ▼ (delta = -0.1) or ▲ (delta = +0.1) is clicked. */
  onSpeedNudge(callback: (delta: number) => void): void;
  /** Replaces the callback fired when the auto-scroll pause/resume button is
   *  clicked, with the new paused state. Also resets the button to its
   *  unpaused (⏸) display. */
  onScrollPauseToggle(callback: (paused: boolean) => void): void;
  /** Replaces the callback fired when "Sync here" (tap-to-sync) is clicked. */
  onTapSync(callback: () => void): void;
  /** Sets the minimize/expand state without user interaction — used to
   *  restore whatever state the panel was in before a same-tab video
   *  navigation remounted it. Does not fire onCollapseChange. */
  setCollapsed(collapsed: boolean): void;
  /** Replaces the callback fired when the user clicks the minimize/expand
   *  button, with the new collapsed state. */
  onCollapseChange(callback: (collapsed: boolean) => void): void;
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
      <div class="kx-header-main">
        <div class="kx-title"></div>
        <div class="kx-subtitle"></div>
      </div>
      <div class="kx-header-collapsed-label">Lyrics</div>
      <button class="kx-collapse-btn" title="Minimize"></button>
    </div>
    <div class="kx-body">
      <div class="kx-body-inner">
        <div class="kx-offset kx-hidden">
          <button class="kx-offset-back" title="Shift lyrics earlier (−0.25 s)">◀</button>
          <span class="kx-offset-value">+0.00s</span>
          <button class="kx-offset-fwd" title="Shift lyrics later (+0.25 s)">▶</button>
          <button class="kx-sync-here" title="Set the offset from this moment">Sync here</button>
        </div>
        <div class="kx-speed kx-hidden">
          <button class="kx-speed-down" title="Scroll slower">▼</button>
          <span class="kx-speed-value">1.0x</span>
          <button class="kx-speed-up" title="Scroll faster">▲</button>
          <button class="kx-scroll-pause" title="Pause auto-scroll">⏸</button>
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
      </div>
    </div>
  `;

  shadow.append(style, panel);
  container.prepend(host);

  const find = <T extends Element>(selector: string): T => {
    const el = panel.querySelector<T>(selector);
    if (!el) throw new Error(`panel element missing: ${selector}`);
    return el;
  };

  const linesEl = find<HTMLElement>('.kx-lines');

  // Custom rAF-driven scroll instead of scrollTo({behavior: 'smooth'}):
  // native smooth scrolling has no controllable duration, and some browsers
  // (Firefox, when the OS "reduce motion" setting is on) silently downgrade
  // it to an instant jump — which read as the line "warping" into place
  // instead of sliding. Animating scrollTop ourselves guarantees the slide
  // regardless of browser/OS motion settings.
  let scrollAnimId: number | null = null;
  function animateScrollTo(target: number, durationMs = 350): void {
    if (scrollAnimId !== null) cancelAnimationFrame(scrollAnimId);
    const start = linesEl.scrollTop;
    const delta = target - start;
    if (delta === 0) return;
    const startTime = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      linesEl.scrollTop = start + delta * eased;
      scrollAnimId = t < 1 ? requestAnimationFrame(step) : null;
    };
    scrollAnimId = requestAnimationFrame(step);
  }
  function stopScrollAnim(): void {
    if (scrollAnimId !== null) {
      cancelAnimationFrame(scrollAnimId);
      scrollAnimId = null;
    }
  }

  let lineClickListener: ((index: number) => void) | null = null;

  // A single replaceable slot, not an event-target list: only one sync loop
  // drives a panel at a time, so there is nothing to leak across restarts.
  let manualScrollListener: (() => void) | null = null;
  linesEl.addEventListener(
    'wheel',
    () => {
      stopScrollAnim();
      manualScrollListener?.();
    },
    { passive: true },
  );
  linesEl.addEventListener(
    'touchmove',
    () => {
      stopScrollAnim();
      manualScrollListener?.();
    },
    { passive: true },
  );

  const collapseBtn = find<HTMLElement>('.kx-collapse-btn');
  collapseBtn.innerHTML = ICON_SVG_OPEN;
  let collapseChangeListener: ((collapsed: boolean) => void) | null = null;
  function applyCollapsed(collapsed: boolean): void {
    panel.classList.toggle('kx-collapsed', collapsed);
    collapseBtn.innerHTML = collapsed ? ICON_SVG_COLLAPSED : ICON_SVG_OPEN;
    collapseBtn.title = collapsed ? 'Expand' : 'Minimize';
  }
  collapseBtn.addEventListener('click', () => {
    const collapsed = !panel.classList.contains('kx-collapsed');
    applyCollapsed(collapsed);
    collapseChangeListener?.(collapsed);
  });

  let offsetNudgeListener: ((delta: number) => void) | null = null;
  find<HTMLElement>('.kx-offset-back').addEventListener('click', () => {
    offsetNudgeListener?.(-0.25);
  });
  find<HTMLElement>('.kx-offset-fwd').addEventListener('click', () => {
    offsetNudgeListener?.(0.25);
  });

  let tapSyncListener: (() => void) | null = null;
  find<HTMLElement>('.kx-sync-here').addEventListener('click', () => {
    tapSyncListener?.();
  });

  let speedNudgeListener: ((delta: number) => void) | null = null;
  find<HTMLElement>('.kx-speed-down').addEventListener('click', () => {
    speedNudgeListener?.(-0.1);
  });
  find<HTMLElement>('.kx-speed-up').addEventListener('click', () => {
    speedNudgeListener?.(0.1);
  });

  let scrollPaused = false;
  let scrollPauseListener: ((paused: boolean) => void) | null = null;
  const scrollPauseBtn = find<HTMLElement>('.kx-scroll-pause');
  scrollPauseBtn.addEventListener('click', () => {
    scrollPaused = !scrollPaused;
    scrollPauseBtn.textContent = scrollPaused ? '▶' : '⏸';
    scrollPauseListener?.(scrollPaused);
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
        ...lines.map((line, index) => {
          const li = document.createElement('li');
          li.className = synced ? 'kx-line kx-line-clickable' : 'kx-line kx-line-active';
          li.textContent = line.text;
          if (synced) {
            li.addEventListener('click', () => lineClickListener?.(index));
          }
          return li;
        }),
      );
    },
    onLineClick(callback) {
      lineClickListener = callback;
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
          animateScrollTo(targetScroll);
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
    setScrollTop(px) {
      linesEl.scrollTop = px;
    },
    getScrollTop() {
      return linesEl.scrollTop;
    },
    getScrollExtentPx() {
      return Math.max(0, linesEl.scrollHeight - linesEl.clientHeight);
    },
    setSpeedControls(visible, speed) {
      const el = find<HTMLElement>('.kx-speed');
      el.classList.toggle('kx-hidden', !visible);
      if (visible && speed !== undefined) {
        find('.kx-speed-value').textContent = `${speed.toFixed(1)}x`;
      }
      // A fresh auto-scroll session always starts unpaused, regardless of
      // whatever the button showed for a previous video/pick.
      scrollPaused = false;
      scrollPauseBtn.textContent = '⏸';
    },
    onSpeedNudge(callback) {
      speedNudgeListener = callback;
    },
    onScrollPauseToggle(callback) {
      scrollPauseListener = callback;
    },
    onTapSync(callback) {
      tapSyncListener = callback;
    },
    setCollapsed(collapsed) {
      applyCollapsed(collapsed);
    },
    onCollapseChange(callback) {
      collapseChangeListener = callback;
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
      stopScrollAnim();
      host.remove();
    },
  };
}
