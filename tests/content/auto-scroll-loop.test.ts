// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startAutoScrollLoop } from '../../src/content/auto-scroll-loop';
import type { PanelHandle } from '../../src/content/panel';

function mockPanel(extentPx = 1000): PanelHandle {
  return {
    setHeader: vi.fn(),
    setStatus: vi.fn(),
    setLines: vi.fn(),
    setActiveLine: vi.fn(),
    onManualScroll: vi.fn(),
    setOffsetControls: vi.fn(),
    onOffsetNudge: vi.fn(),
    setScrollTop: vi.fn(),
    getScrollExtentPx: vi.fn(() => extentPx),
    setSpeedControls: vi.fn(),
    onSpeedNudge: vi.fn(),
    onTapSync: vi.fn(),
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
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    expect(panel.setScrollTop).toHaveBeenCalledWith(0);
    expect(raf.pendingCount()).toBe(0);
  });

  it('does not schedule a frame for a paused video until it plays', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel(), 200);
    expect(raf.pendingCount()).toBe(0);
  });

  it('schedules a frame immediately for a video already playing', () => {
    const v = video();
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    startAutoScrollLoop(v, mockPanel(), 200);
    expect(raf.pendingCount()).toBe(1);
  });

  it('advances scrollTop as currentTime advances across frames', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200); // 200s duration, 1000px extent
    v.dispatchEvent(new Event('play'));

    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true }); // halfway
    raf.runFrame();
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(500);
  });

  it('stops scheduling frames on pause and resumes on play', () => {
    const v = video();
    startAutoScrollLoop(v, mockPanel(), 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
    v.dispatchEvent(new Event('pause'));
    expect(raf.pendingCount()).toBe(0);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);
  });

  it('recomputes on seeked even while paused', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    Object.defineProperty(v, 'currentTime', { value: 50, configurable: true }); // quarter
    v.dispatchEvent(new Event('seeked'));
    expect(panel.setScrollTop).toHaveBeenLastCalledWith(250);
  });

  it('suspends auto-scroll for a window after a manual scroll', () => {
    const v = video();
    const panel = mockPanel(1000);
    startAutoScrollLoop(v, panel, 200);
    const manualScrollHandler = (panel.onManualScroll as ReturnType<typeof vi.fn>).mock.calls[0]![0] as () => void;

    manualScrollHandler();
    vi.clearAllMocks();

    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'currentTime', { value: 100, configurable: true });
    raf.runFrame();
    expect(panel.setScrollTop).not.toHaveBeenCalled();
  });

  it('setSpeed updates the effective rate and triggers an immediate apply', () => {
    const v = video();
    const panel = mockPanel(1000);
    const handle = startAutoScrollLoop(v, panel, 200, 1);
    Object.defineProperty(v, 'currentTime', { value: 50, configurable: true }); // 1/4 of duration
    vi.clearAllMocks();
    handle.setSpeed(2); // 2x speed → 1/2 progress → 500px
    expect(panel.setScrollTop).toHaveBeenCalledWith(500);
  });

  it('stop() cancels any pending frame and removes listeners', () => {
    const v = video();
    const panel = mockPanel();
    const handle = startAutoScrollLoop(v, panel, 200);
    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(1);

    handle.stop();
    expect(raf.pendingCount()).toBe(0);

    v.dispatchEvent(new Event('play'));
    expect(raf.pendingCount()).toBe(0);
  });
});
