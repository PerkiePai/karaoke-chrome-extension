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

  it('applies the initial highlight immediately for a paused video, without starting a rAF chain', () => {
    const v = video();
    const panel = mockPanel();
    Object.defineProperty(v, 'currentTime', { value: 1.2, configurable: true });
    startSyncLoop(v, panel, LINES);
    expect(panel.setActiveLine).toHaveBeenCalledTimes(1);
    expect(panel.setActiveLine).toHaveBeenCalledWith(1, true);
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
