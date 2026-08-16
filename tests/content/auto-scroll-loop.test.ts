// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startAutoScrollLoop } from '../../src/content/auto-scroll-loop';
import type { PanelHandle } from '../../src/content/panel';

// Stateful, unlike a plain vi.fn() stub: getScrollTop() must reflect
// whatever was last written (by the loop, or by a simulated manual scroll
// via forceScrollTop), the same way a real linesEl.scrollTop would.
// `roundsToInteger` mirrors a real browser's scrollTop, which stores whole
// pixels — used to catch the class of bug where reading the DOM back as the
// accumulation base silently discards sub-pixel per-frame progress.
function mockPanel(extentPx = 1000, initialScrollTop = 0, roundsToInteger = false) {
  let scrollTop = initialScrollTop;
  const store = (px: number) => {
    scrollTop = roundsToInteger ? Math.round(px) : px;
  };
  const panel: PanelHandle = {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    onLineClick: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    setScrollTop: vi.fn((px: number) => store(px)),
    getScrollTop: vi.fn(() => scrollTop),
    getScrollExtentPx: vi.fn(() => extentPx),
    setSpeedControls: vi.fn(),
    onSpeedNudge: vi.fn(),
    onScrollPauseToggle: vi.fn(),
    onTapSync: vi.fn(),
    setCollapsed: vi.fn(),
    onCollapseChange: vi.fn(),
    showCorrectBar: vi.fn(),
    enterSearchMode: vi.fn(),
    showCandidates: vi.fn(),
    exitSearchMode: vi.fn(),
    onCorrectRequest: vi.fn(),
    onSearch: vi.fn(),
    onCandidatePick: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    panel,
    // Simulates the browser applying a manual scroll directly to the list,
    // bypassing the loop's own setScrollTop call (so its mock call history
    // isn't polluted the way a test asserting "was setScrollTop called with
    // X" would be if this reused panel.setScrollTop).
    forceScrollTop(px: number) {
      store(px);
    },
  };
}

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

describe('startAutoScrollLoop', () => {
  let raf: ReturnType<typeof fakeRaf>;

  beforeEach(() => {
    raf = fakeRaf();
    vi.stubGlobal('requestAnimationFrame', raf.requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', raf.cancelAnimationFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the initial scroll position immediately for a paused video', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    expect(panel.setScrollTop).toHaveBeenCalledWith(0);
    expect(raf.pendingCount()).toBe(0);
  });

  it('does not schedule a frame for a paused video until it plays', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel().panel, 200);
    expect(raf.pendingCount()).toBe(0);
  });

  it('schedules a frame immediately for a video already playing', () => {
    const v = video();
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    startAutoScrollLoop(v, mockPanel().panel, 200);
    expect(raf.pendingCount()).toBe(1);
  });

  it('advances scrollTop as currentTime advances across frames', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200); // 200s duration, 1000px extent
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true }); // halfway
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(500);
  });

  it('stops scheduling frames on pause and resumes on play', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel().panel, 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
    v.dispatchEvent(new Event('pause'));
    expect(raf.pendingCount()).toBe(0);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
  });

  it('recomputes on seeked even while paused', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 210); // 5s edge pad each side → 200s effective window
    Object.defineProperty(v, 'currentTime', { value: 55, configurable: true }); // quarter of the effective window (5s pad + 50s)
    v.dispatchEvent(new Event('seeked'));
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(250);
  });

  it('does not register a manual-scroll listener — a hand scroll must not fight the sweep', () => {
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(video(), panel, 200);
    expect(panel.onManualScroll).not.toHaveBeenCalled();
  });

  it('continues from a manually-scrolled position while enabled, instead of snapping back', () => {
    const v = video();
    const { panel, forceScrollTop } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 210); // 5s edge pad each side → 200s effective window, 1000px extent
    v.dispatchEvent(new Event('play'));

    // User scrolls the list by hand to 700px, unrelated to video.currentTime.
    forceScrollTop(700);
    vi.clearAllMocks();

    // 7s of raw video time (2s past the 5s lead-in pad, at speed 1 → 10px).
    Object.defineProperty(v, 'currentTime', { value: 7, configurable: true });
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(710);
  });

  it('stays at 0 during the lead-in pad, even as the video plays', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200); // 5s edge pad each side
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 4.9, configurable: true }); // still inside the pad
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(0);
  });

  it('reaches the full extent 5s before the video ends and holds there (lead-out pad)', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200); // 5s edge pad each side
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 195, configurable: true }); // exactly 5s from the end
    raf.runFrame();
    expect(panel.getScrollTop()).toBe(1000);

    vi.clearAllMocks();
    Object.defineProperty(v, 'currentTime', { value: 199, configurable: true }); // almost the very end
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(1000); // unchanged — already at the bottom
  });

  it('does not stall at normal speed when the panel rounds scrollTop to a whole pixel', () => {
    // Regression test: a real browser's scrollTop is a whole pixel, and at
    // speed 1 a single ~16ms frame advances well under 1px for any song of
    // normal length. Deriving next frame's base from the (rounded) DOM
    // value instead of an internal float accumulator would throw that
    // sub-pixel progress away every frame — the sweep would never move.
    const v = video();
    Object.defineProperty(v, 'currentTime', { value: 5, configurable: true }); // past the 5s lead-in pad
    const { panel } = mockPanel(1000, 0, /* roundsToInteger */ true);
    startAutoScrollLoop(v, panel, 200); // 200s duration, 1000px extent
    v.dispatchEvent(new Event('play'));

    // Six ~16ms frames (0.08px each — rounds to 0 individually) should
    // still add up to just under 1px internally...
    let t = 5000;
    for (let i = 0; i < 6; i++) {
      t += 16;
      Object.defineProperty(v, 'currentTime', { value: t / 1000, configurable: true });
      raf.runFrame();
    }
    // ...and a seventh frame should be the one that finally crosses into a
    // visible pixel, proving the earlier fractional advances weren't lost
    // (an internal-accumulator bug would still report 0 here).
    t += 16;
    Object.defineProperty(v, 'currentTime', { value: t / 1000, configurable: true });
    raf.runFrame();
    expect(panel.getScrollTop()).toBe(1);
  });

  it('pause button stops scrollTop updates', () => {
    const v = video();
    const { panel } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    const toggle = (panel.onScrollPauseToggle as ReturnType<typeof vi.fn>).mock.calls[0]![0] as (
      paused: boolean,
    ) => void;

    toggle(true);
    vi.clearAllMocks();

    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true });
    raf.runFrame();
    expect(panel.setScrollTop).not.toHaveBeenCalled();
  });

  it('resuming continues from wherever the list was left, not the video-time position — no warp', () => {
    const v = video();
    const { panel, forceScrollTop } = mockPanel(1000);
    startAutoScrollLoop(v, panel, 210); // 5s edge pad each side → 200s effective window, 1000px extent
    v.dispatchEvent(new Event('play'));
    const toggle = (panel.onScrollPauseToggle as ReturnType<typeof vi.fn>).mock.calls[0]![0] as (
      paused: boolean,
    ) => void;

    toggle(true);
    // Video keeps playing while scroll is paused, advancing far past where
    // the absolute video-time formula would now place the list...
    Object.defineProperty(v, 'currentTime', { value: 150, configurable: true });
    raf.runFrame(); // no-op while paused, but keeps lastVideoMs tracking currentTime
    // ...and the user scrolls the list by hand to an unrelated position.
    forceScrollTop(50);
    vi.clearAllMocks();

    toggle(false);
    // No frame has run yet since resuming — no jump to the video-time
    // position the absolute formula would compute for currentTime=150.
    expect(panel.setScrollTop).not.toHaveBeenCalled();

    // The next frame advances from the manually-scrolled 50px by only the
    // elapsed time since the last frame, not the whole paused duration.
    Object.defineProperty(v, 'currentTime', { value: 151, configurable: true }); // +1s
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(55); // 50 + (1/200)*1000
  });

  it('setSpeed changes the rate without an immediate jump — only future frames are affected', () => {
    const v = video();
    const { panel, forceScrollTop } = mockPanel(1000);
    const handle = startAutoScrollLoop(v, panel, 210, 1); // 5s edge pad each side → 200s effective window
    forceScrollTop(300); // wherever the list happens to be
    vi.clearAllMocks();

    handle.setSpeed(2);
    expect(panel.setScrollTop).not.toHaveBeenCalled();

    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'currentTime', { value: 6, configurable: true }); // 1s past the 5s lead-in, at 2x → 10px
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(310);
  });

  it('stop() cancels any pending frame and removes listeners', () => {
    const v = video();
    const { panel } = mockPanel();
    const handle = startAutoScrollLoop(v, panel, 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);

    handle.stop();
    expect(raf.pendingCount()).toBe(0);

    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(0);
  });
});
