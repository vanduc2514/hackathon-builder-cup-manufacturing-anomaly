// SVG Bezier overlay connecting nodes across the 4 swimlanes with animated flow pulses (Issue #205).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TopologyEdgeDefinition, TopologyNodeId, TopologyNodeState } from '../../types';
import { TOPOLOGY_EDGES } from '../../lib/topology';

interface TopologyCanvasProps {
  nodeStates: Record<TopologyNodeId, TopologyNodeState>;
  children: React.ReactNode;
}

interface ComputedPath {
  id: string;
  edge: TopologyEdgeDefinition;
  d: string;
  status: 'active' | 'completed' | 'idle';
}

export default function TopologyCanvas({
  nodeStates,
  children,
}: TopologyCanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [paths, setPaths] = useState<ComputedPath[]>([]);

  const updatePaths = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newPaths: ComputedPath[] = [];

    for (const edge of TOPOLOGY_EDGES) {
      const fromEl = container.querySelector(`[data-node-id="${edge.from}"]`);
      const toEl = container.querySelector(`[data-node-id="${edge.to}"]`);
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const fromState = nodeStates[edge.from]?.status;
      const toState = nodeStates[edge.to]?.status;

      let edgeStatus: ComputedPath['status'] = 'idle';
      if (fromState === 'done' && toState === 'done') {
        edgeStatus = 'completed';
      } else if (
        fromState === 'active' ||
        toState === 'active' ||
        fromState === 'waiting' ||
        toState === 'waiting' ||
        fromState === 'pending_approval' ||
        toState === 'pending_approval'
      ) {
        edgeStatus = 'active';
      }

      // Check whether layout is horizontal or vertical
      const isHorizontal = toRect.left >= fromRect.right - 40;

      let d = '';
      if (isHorizontal) {
        // Output from right edge of fromEl, input into left edge of toEl
        const x1 = fromRect.right - containerRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
        const x2 = toRect.left - containerRect.left;
        const y2 = toRect.top + toRect.height / 2 - containerRect.top;
        const dx = Math.max(30, (x2 - x1) / 2);
        d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      } else {
        // Output from bottom edge of fromEl, input into top edge of toEl
        const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
        const y1 = fromRect.bottom - containerRect.top;
        const x2 = toRect.left + toRect.width / 2 - containerRect.left;
        const y2 = toRect.top - containerRect.top;
        const dy = Math.max(20, (y2 - y1) / 2);
        d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
      }

      newPaths.push({
        id: `${edge.from}->${edge.to}`,
        edge,
        d,
        status: edgeStatus,
      });
    }

    setPaths(newPaths);
  };

  useLayoutEffect(() => {
    updatePaths();
  }, [nodeStates]);

  useEffect(() => {
    const handleResize = () => updatePaths();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => updatePaths());
    if (containerRef.current) observer.observe(containerRef.current);

    // Minor delay to guarantee all DOM elements finished reflow
    const timer = window.setTimeout(updatePaths, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="topology-canvas-container"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 520,
      }}
    >
      {/* SVG Bezier overlay behind child nodes */}
      <svg
        className="topology-svg-overlay"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient id="edge-gradient-active" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
          <linearGradient id="edge-gradient-done" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#12a150" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>

        {paths.map((p) => {
          let stroke = 'var(--hair-strong)';
          let strokeWidth = 1.5;
          let strokeDasharray = '4 4';
          let className = '';

          if (p.status === 'completed') {
            stroke = 'url(#edge-gradient-done)';
            strokeWidth = 2;
            strokeDasharray = 'none';
          } else if (p.status === 'active') {
            stroke = 'url(#edge-gradient-active)';
            strokeWidth = 2.5;
            strokeDasharray = '6 6';
            className = 'topology-flow-edge';
          }

          return (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              className={className}
              style={{
                transition: 'stroke 0.3s var(--ease), stroke-width 0.3s var(--ease)',
              }}
            />
          );
        })}
      </svg>

      {/* Child swimlanes and nodes (z-index 1 so clickable) */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        {children}
      </div>
    </div>
  );
}
