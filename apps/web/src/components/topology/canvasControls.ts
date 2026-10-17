// Canvas viewport controls shared by TopologyCanvas minimap and floating toolbar
// (TKT-076 / Issue #277 — AC-TOP-29b). The helpers encapsulate a single
// rAF-driven tween so that any caller (minimap .mm-node click, Fit-to-Screen
// button, future keyboard shortcuts) animates the canvas identically.

/** Minimum and maximum scale the canvas clamps to during animated tweens. */
export const CANVAS_SCALE_MIN = 0.6;
export const CANVAS_SCALE_MAX = 1.0;

/** Duration of every viewport tween in milliseconds. */
export const CANVAS_TWEEN_MS = 240;

/** Viewport coordinate at which an animated tween is considered already
 *  "at target" and the helper short-circuits to a no-op. */
export const CANVAS_TWEEN_EPSILON = 0.5;

export interface ViewportState {
  scale: number;
  pan: { x: number; y: number };
}

export interface ViewportTarget {
  scale?: number;
  pan?: { x: number; y: number };
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Schedule a single `requestAnimationFrame` tween that drives `setViewport`
 * from the supplied `from` state to `target` over `CANVAS_TWEEN_MS`.
 *
 * - Scale is clamped to `[CANVAS_SCALE_MIN, CANVAS_SCALE_MAX]`.
 * - If the target is already within `CANVAS_TWEEN_EPSILON` of the current
 *   viewport on both axes, the function returns immediately without
 *   scheduling a frame.
 * - Returns a cancel function the caller may invoke if it tears the canvas
 *   down mid-tween (e.g. component unmount).
 */
export function animateViewport(
  from: ViewportState,
  target: ViewportTarget,
  setViewport: (next: ViewportState) => void,
): () => void {
  const targetScale = clamp(target.scale ?? from.scale, CANVAS_SCALE_MIN, CANVAS_SCALE_MAX);
  const targetPan = target.pan ?? from.pan;

  const scaleDelta = targetScale - from.scale;
  const panXDelta = targetPan.x - from.pan.x;
  const panYDelta = targetPan.y - from.pan.y;

  const alreadyAtTarget =
    Math.abs(scaleDelta) < CANVAS_TWEEN_EPSILON / 1000 &&
    Math.abs(panXDelta) < CANVAS_TWEEN_EPSILON &&
    Math.abs(panYDelta) < CANVAS_TWEEN_EPSILON;

  if (alreadyAtTarget) {
    return () => undefined;
  }

  const startTime = performance.now();
  let rafId = 0;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / CANVAS_TWEEN_MS);
    const eased = easeOutCubic(t);

    setViewport({
      scale: from.scale + scaleDelta * eased,
      pan: {
        x: from.pan.x + panXDelta * eased,
        y: from.pan.y + panYDelta * eased,
      },
    });

    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * Animate the viewport so a target node card is centered in the canvas
 * while keeping the current scale.
 *
 * `canvasSize` is the visible viewport rectangle (width/height in CSS px).
 * `nodeCenter` is the node's center in the un-transformed canvas space
 * (i.e. before pan/scale are applied).
 */
export function panToCenter(
  from: ViewportState,
  canvasSize: { width: number; height: number },
  nodeCenter: { x: number; y: number },
  setViewport: (next: ViewportState) => void,
): () => void {
  // After scale is applied, the node at (nodeCenter.x, nodeCenter.y) in canvas
  // space becomes (nodeCenter.x * scale + pan.x, nodeCenter.y * scale + pan.y).
  // We want it to land at (canvasSize.width / 2, canvasSize.height / 2).
  const scale = from.scale;
  const desiredPan = {
    x: canvasSize.width / 2 - nodeCenter.x * scale,
    y: canvasSize.height / 2 - nodeCenter.y * scale,
  };
  return animateViewport(from, { scale, pan: desiredPan }, setViewport);
}

/**
 * Reset the viewport to scale = 1, pan = (0, 0) using the shared easing.
 * Convenience wrapper used by the floating "Reset" control and the
 * Fit-to-Screen button.
 */
export function fitView(
  from: ViewportState,
  setViewport: (next: ViewportState) => void,
): () => void {
  return animateViewport(
    from,
    { scale: 1, pan: { x: 0, y: 0 } },
    setViewport,
  );
}