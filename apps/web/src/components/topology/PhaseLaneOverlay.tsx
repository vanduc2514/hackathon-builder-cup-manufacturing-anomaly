// Inline Phase Lane dashed-border overlay (A: Detection, B: Tracing & RCA, C: Resolution,
// D: Verification & Learning) bounding the nodes of each phase on the canvas (AC-TOP-23, #256).
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { PhaseLaneId, PhaseStepperStatus } from '../../lib/topology';
import { TOPOLOGY_PHASE_LANES } from '../../lib/topology';

const LANE_LABEL: Record<PhaseLaneId, string> = {
  a: 'Phase A · Detection',
  b: 'Phase B · Tracing & RCA',
  c: 'Phase C · Resolution',
  'd-learn': 'Phase D · Verification & Learning',
  d: 'Phase D · Verification & Learning',
};

const STATUS_TEXT: Record<PhaseStepperStatus, string> = {
  idle: 'Idle',
  active: 'Active',
  warning: 'Warning',
  danger: 'Danger',
  completed: 'Completed',
};

interface LaneBox {
  id: PhaseLaneId;
  label: string;
  status: PhaseStepperStatus;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PhaseLaneOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  laneStatuses: Record<PhaseLaneId, PhaseStepperStatus>;
  scale: number;
}

const PADDING = 10;

export default function PhaseLaneOverlay({
  containerRef,
  laneStatuses,
  scale,
}: PhaseLaneOverlayProps): React.ReactElement | null {
  const [boxes, setBoxes] = useState<LaneBox[]>([]);

  const updateBoxes = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const effectiveScale = scale || 1;
    const nextBoxes: LaneBox[] = [];

    for (const lane of TOPOLOGY_PHASE_LANES) {
      let minLeft = Infinity;
      let minTop = Infinity;
      let maxRight = -Infinity;
      let maxBottom = -Infinity;
      let found = false;

      for (const nodeId of lane.nodeIds) {
        const el =
          container.querySelector(`[data-node="${nodeId}"]`) ||
          document.getElementById(`node-${nodeId}`) ||
          document.getElementById(nodeId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        found = true;
        minLeft = Math.min(minLeft, rect.left);
        minTop = Math.min(minTop, rect.top);
        maxRight = Math.max(maxRight, rect.right);
        maxBottom = Math.max(maxBottom, rect.bottom);
      }

      if (!found) continue;

      const left = (minLeft - containerRect.left) / effectiveScale - PADDING;
      const top = (minTop - containerRect.top) / effectiveScale - PADDING;
      const width = (maxRight - minLeft) / effectiveScale + PADDING * 2;
      const height = (maxBottom - minTop) / effectiveScale + PADDING * 2;

      nextBoxes.push({
        id: lane.id,
        label: LANE_LABEL[lane.id],
        status: laneStatuses[lane.id] ?? 'idle',
        top,
        left,
        width,
        height,
      });
    }

    setBoxes(nextBoxes);
  }, [containerRef, laneStatuses, scale]);

  useLayoutEffect(() => {
    updateBoxes();
  }, [updateBoxes]);

  useEffect(() => {
    const handleResize = () => updateBoxes();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => updateBoxes());
      observer.observe(containerRef.current);
    }

    const timer = window.setTimeout(updateBoxes, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [updateBoxes, containerRef]);

  if (boxes.length === 0) return null;

  return (
    <div
      className="phase-lane-overlay"
      data-testid="phase-lane-overlay"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      {boxes.map((box) => (
        <div
          key={box.id}
          className={`phase-lane-box phase-lane-${box.status}`}
          data-phase-lane={box.id}
          data-status={box.status}
          style={{
            position: 'absolute',
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        >
          <span className={`phase-lane-chip phase-lane-chip-${box.status}`}>
            {box.label}
            <span className="phase-lane-chip-status">{STATUS_TEXT[box.status]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
