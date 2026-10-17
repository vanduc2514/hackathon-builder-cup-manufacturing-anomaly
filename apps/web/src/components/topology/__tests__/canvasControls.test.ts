// Unit tests for the shared canvas viewport animation helper
// (TKT-076 / Issue #277 — AC-TOP-29b). We mock `requestAnimationFrame`
// to a controllable clock so tests can advance frames deterministically
// without relying on real time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  animateViewport,
  CANVAS_SCALE_MAX,
  CANVAS_SCALE_MIN,
  CANVAS_TWEEN_EPSILON,
  CANVAS_TWEEN_MS,
  fitView,
  panToCenter,
  type ViewportState,
} from '../canvasControls';

interface RafHandle {
  cb: FrameRequestCallback;
  time: number;
  cancelled: boolean;
}

let rafQueue: RafHandle[] = [];
let currentTime = 0;

const flush = (advance: number) => {
  currentTime += advance;
  const due = rafQueue.filter((h) => !h.cancelled && h.time <= currentTime);
  rafQueue = rafQueue.filter((h) => !due.includes(h));
  for (const handle of due) {
    handle.cb(currentTime);
  }
};

beforeEach(() => {
  rafQueue = [];
  currentTime = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const handle: RafHandle = { cb, time: currentTime, cancelled: false };
    rafQueue.push(handle);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const handle = rafQueue[id - 1];
    if (handle) handle.cancelled = true;
  });
  vi.stubGlobal('performance', { now: () => currentTime });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('animateViewport (TKT-076 / AC-TOP-29b)', () => {
  it('returns immediately when viewport is already within epsilon of target', () => {
    const setViewport = vi.fn();
    const from: ViewportState = { scale: 1, pan: { x: 0, y: 0 } };
    const cancel = animateViewport(from, { scale: 1, pan: { x: 0, y: 0 } }, setViewport);
    expect(setViewport).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
    cancel();
  });

  it('clamps scale above to CANVAS_SCALE_MAX', () => {
    const setViewport = vi.fn();
    animateViewport(
      { scale: 1.5, pan: { x: 0, y: 0 } },
      { scale: 5 },
      setViewport,
    );
    flush(CANVAS_TWEEN_MS + 1);
    const lastCall = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    expect(lastCall.scale).toBeLessThanOrEqual(CANVAS_SCALE_MAX);
    // also clamps toward 1.0 (the max), not toward 5
    expect(lastCall.scale).toBeCloseTo(CANVAS_SCALE_MAX, 1);
  });

  it('clamps scale below to CANVAS_SCALE_MIN', () => {
    const setViewport = vi.fn();
    animateViewport(
      { scale: 1, pan: { x: 0, y: 0 } },
      { scale: 0 },
      setViewport,
    );
    flush(CANVAS_TWEEN_MS + 1);
    const lastCall = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    expect(lastCall.scale).toBeGreaterThanOrEqual(CANVAS_SCALE_MIN);
    expect(lastCall.scale).toBeCloseTo(CANVAS_SCALE_MIN, 1);
  });

  it('tweens over CANVAS_TWEEN_MS using easeOutCubic', () => {
    const setViewport = vi.fn();
    const from: ViewportState = { scale: 1, pan: { x: 0, y: 0 } };
    animateViewport(from, { scale: 0.6, pan: { x: 100, y: 50 } }, setViewport);
    // halfway -> eased = 0.875 -> scale ≈ 0.65, pan ≈ (87.5, 43.75)
    flush(CANVAS_TWEEN_MS / 2);
    const mid = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    expect(mid.scale).toBeCloseTo(1 - 0.4 * 0.875, 2);
    expect(mid.pan.x).toBeCloseTo(100 * 0.875, 1);
    expect(mid.pan.y).toBeCloseTo(50 * 0.875, 1);
    // final -> exact target
    flush(CANVAS_TWEEN_MS / 2 + 1);
    const final = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    expect(final.scale).toBeCloseTo(0.6, 5);
    expect(final.pan.x).toBeCloseTo(100, 5);
    expect(final.pan.y).toBeCloseTo(50, 5);
  });

  it('cancel() stops further rAF callbacks', () => {
    const setViewport = vi.fn();
    const cancel = animateViewport(
      { scale: 1, pan: { x: 0, y: 0 } },
      { scale: 0.6, pan: { x: 100, y: 100 } },
      setViewport,
    );
    flush(0);
    const before = setViewport.mock.calls.length;
    cancel();
    flush(CANVAS_TWEEN_MS);
    expect(setViewport.mock.calls.length).toBe(before);
  });
});

describe('fitView (TKT-076 / AC-TOP-30d)', () => {
  it('resets to scale=1 and pan=(0,0)', () => {
    const setViewport = vi.fn();
    fitView({ scale: 0.6, pan: { x: 200, y: 100 } }, setViewport);
    flush(CANVAS_TWEEN_MS + 1);
    const final = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    expect(final.scale).toBeCloseTo(1, 5);
    expect(final.pan).toEqual({ x: 0, y: 0 });
  });

  it('no-ops when already at scale=1 and pan=(0,0)', () => {
    const setViewport = vi.fn();
    fitView({ scale: 1, pan: { x: 0, y: 0 } }, setViewport);
    // within epsilon — no rAF scheduled
    expect(rafQueue).toHaveLength(0);
    expect(setViewport).not.toHaveBeenCalled();
  });
});

describe('panToCenter (TKT-076 / AC-TOP-29b)', () => {
  it('keeps current scale and centers node in viewport', () => {
    const setViewport = vi.fn();
    // node (400, 300) with pan (0,0) at scale 1 -> screen (400, 300),
    // which IS the center of (800, 600), so no pan needed (no-op).
    panToCenter(
      { scale: 1, pan: { x: 0, y: 0 } },
      { width: 800, height: 600 },
      { x: 400, y: 300 },
      setViewport,
    );
    // helper short-circuits when target matches current within epsilon
    expect(setViewport).not.toHaveBeenCalled();
    expect(rafQueue).toHaveLength(0);
  });

  it('shifts pan when node is off-center', () => {
    const setViewport = vi.fn();
    panToCenter(
      { scale: 1, pan: { x: 0, y: 0 } },
      { width: 800, height: 600 },
      { x: 1000, y: 800 },
      setViewport,
    );
    flush(CANVAS_TWEEN_MS + 1);
    const final = setViewport.mock.calls[setViewport.mock.calls.length - 1]?.[0] as ViewportState;
    // desired pan = (canvas/2 - node*scale) = (400 - 1000, 300 - 800) = (-600, -500)
    expect(final.pan.x).toBeCloseTo(-600, 5);
    expect(final.pan.y).toBeCloseTo(-500, 5);
  });
});

describe('epsilon constant is positive', () => {
  it('CANVAS_TWEEN_EPSILON > 0', () => {
    expect(CANVAS_TWEEN_EPSILON).toBeGreaterThan(0);
  });
});