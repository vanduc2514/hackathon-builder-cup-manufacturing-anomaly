// SVG Orthogonal overlay connecting 5 architecture layers with right-angled routing, zoom/pan controls, and minimap (Issue #205 & Issue #211).
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { TopologyEdgeDefinition, TopologyNodeId, TopologyNodeState } from '../../types';
import { TOPOLOGY_EDGES, TOPOLOGY_LAYERS } from '../../lib/topology';

interface TopologyCanvasProps {
  nodeStates: Record<TopologyNodeId, TopologyNodeState>;
  selectedNodeId: TopologyNodeId | null;
  children: React.ReactNode;
}

interface ComputedPath {
  id: string;
  edge: TopologyEdgeDefinition;
  d: string;
  status: 'active' | 'completed' | 'idle' | 'decision-no' | 'reject-reset';
  label?: string;
  labelX?: number;
  labelY?: number;
  isHighlighted?: boolean;
}

export default function TopologyCanvas({
  nodeStates,
  selectedNodeId,
  children,
}: TopologyCanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [paths, setPaths] = useState<ComputedPath[]>([]);

  // Zoom and Pan states
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showMinimap, setShowMinimap] = useState<boolean>(true);

  // Compute SVG orthogonal right-angled paths
  const updatePaths = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newPaths: ComputedPath[] = [];

    for (const edge of TOPOLOGY_EDGES) {
      // Find elements by data-node-id or id or node-id
      const fromEl =
        container.querySelector(`[data-node="${edge.from}"]`) ||
        container.querySelector(`[data-node-id="${edge.from}"]`) ||
        document.getElementById(`node-${edge.from}`) ||
        document.getElementById(edge.from);

      const toEl =
        container.querySelector(`[data-node="${edge.to}"]`) ||
        container.querySelector(`[data-node-id="${edge.to}"]`) ||
        document.getElementById(`node-${edge.to}`) ||
        document.getElementById(edge.to);

      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Effective scale compensation
      const effectiveScale = scale || 1;
      const x1 = (fromRect.left + fromRect.width / 2 - containerRect.left) / effectiveScale;
      const y1 = (fromRect.bottom - containerRect.top) / effectiveScale;
      const x2 = (toRect.left + toRect.width / 2 - containerRect.left) / effectiveScale;
      const y2 = (toRect.top - containerRect.top) / effectiveScale;

      const fromState = nodeStates[edge.from as TopologyNodeId]?.status;
      const toState = nodeStates[edge.to as TopologyNodeId]?.status;

      let edgeStatus: ComputedPath['status'] = 'idle';

      if (edge.from === 'decision-gate-1' && (edge.to === 'diagnostic-agent' || edge.to === 'technician-photo')) {
        if (toState === 'active' || toState === 'waiting' || toState === 'warning') {
          edgeStatus = 'decision-no';
        }
      } else if (edge.from === 'decision-gate-2' && edge.to === 'streak-reset') {
        if (toState === 'danger' || toState === 'active') {
          edgeStatus = 'reject-reset';
        }
      } else if (fromState === 'done' && toState === 'done') {
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

      // Compute right-angled orthogonal path
      let d = '';
      const cWidth = containerRect.width / effectiveScale;

      let labelX = (x1 + x2) / 2;
      let labelY = (y1 + y2) / 2;

      if (edge.type === 'gutter-right') {
        const fromRightX = (fromRect.right - containerRect.left) / effectiveScale;
        const fromMidY = (fromRect.top + fromRect.height / 2 - containerRect.top) / effectiveScale;
        const toRightX = (toRect.right - containerRect.left) / effectiveScale;
        const toMidY = (toRect.top + toRect.height / 2 - containerRect.top) / effectiveScale;
        const rightmostBoundary = Math.max(fromRightX, toRightX);
        const gutterX = Math.max(rightmostBoundary + 40, cWidth - 24);
        d = `M ${fromRightX} ${fromMidY} H ${gutterX} V ${toMidY} H ${toRightX}`;
        labelX = gutterX - 16;
        labelY = (fromMidY + toMidY) / 2;
      } else if (edge.type === 'loop-left' || edge.type === 'loopback' || edge.type === 'loopback-long') {
        const fromLeftX = (fromRect.left - containerRect.left) / effectiveScale;
        const fromMidY = (fromRect.top + fromRect.height / 2 - containerRect.top) / effectiveScale;
        const toLeftX = (toRect.left - containerRect.left) / effectiveScale;
        const toMidY = (toRect.top + toRect.height / 2 - containerRect.top) / effectiveScale;
        const leftmostCard = Math.min(fromLeftX, toLeftX);
        const loopX = Math.min(20, Math.max(8, leftmostCard - 40));
        d = `M ${fromLeftX} ${fromMidY} H ${loopX} V ${toMidY} H ${toLeftX}`;
        labelX = loopX + 16;
        labelY = (fromMidY + toMidY) / 2;
      } else if (edge.type === 'branch-left' || edge.type === 'branch-right') {
        const midY = (y1 + y2) / 2;
        d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
      } else {
        // Standard vertical
        if (Math.abs(x1 - x2) < 2) {
          d = `M ${x1} ${y1} V ${y2}`;
        } else {
          const midY = (y1 + y2) / 2;
          d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
        }
      }

      const isHighlighted = selectedNodeId ? edge.from === selectedNodeId || edge.to === selectedNodeId : false;

      newPaths.push({
        id: `${edge.from}->${edge.to}`,
        edge,
        d,
        status: edgeStatus,
        label: edge.label,
        labelX,
        labelY,
        isHighlighted,
      });
    }

    setPaths(newPaths);
  }, [nodeStates, scale, selectedNodeId]);

  useLayoutEffect(() => {
    updatePaths();
  }, [updatePaths]);

  useEffect(() => {
    const handleResize = () => updatePaths();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => updatePaths());
      observer.observe(containerRef.current);
    }

    const timer = window.setTimeout(updatePaths, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, [updatePaths]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag on canvas background (not interactive cards/buttons)
    const target = e.target as HTMLElement;
    if (target.closest('.node-card') || target.closest('.decision-diamond-card') || target.closest('button') || target.closest('a') || target.closest('.btn-quick-launch')) {
      return;
    }
    setIsPanning(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleZoomIn = () => setScale((s) => Math.min(1.6, Number((s + 0.1).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))));
  const handleZoomReset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={viewportRef}
      className="canvas-wrapper topology-canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 850,
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'default',
        background: 'radial-gradient(ellipse at 50% 10%, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0) 70%)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      {/* Floating Canvas Navigation Toolbar */}
      <div className="canvas-floating-controls" style={{ zIndex: 10 }}>
        <button
          type="button"
          className="ctrl-btn"
          onClick={handleZoomIn}
          title="Zoom In (+10%)"
          aria-label="Zoom In"
        >
          <span className="material-symbols-outlined">zoom_in</span>
        </button>
        <span className="ctrl-zoom-level" title="Current Zoom Scale">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="ctrl-btn"
          onClick={handleZoomOut}
          title="Zoom Out (-10%)"
          aria-label="Zoom Out"
        >
          <span className="material-symbols-outlined">zoom_out</span>
        </button>
        <button
          type="button"
          className="ctrl-btn"
          onClick={handleZoomReset}
          title="Reset View (100%)"
          aria-label="Reset View"
        >
          <span className="material-symbols-outlined">fit_screen</span>
        </button>
        <button
          type="button"
          className={`ctrl-btn ${showMinimap ? 'active' : ''}`}
          onClick={() => setShowMinimap(!showMinimap)}
          title={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
          aria-label="Toggle Minimap"
        >
          <span className="material-symbols-outlined">map</span>
        </button>
      </div>

      {/* Floating Minimap Widget */}
      {showMinimap && (
        <aside
          aria-label="Topology Minimap"
          className="minimap-widget"
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            width: 140,
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(10px)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            className="minimap-title"
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: '#94a3b8',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Topology Minimap
          </div>
          <div
            className="minimap-canvas"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              height: 100,
              background: '#090d16',
              borderRadius: 4,
              padding: 4,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {TOPOLOGY_LAYERS.map((layer) => (
              <div
                key={layer.id}
                className="minimap-phase-bar"
                style={{
                  height: 16,
                  borderRadius: 2,
                  background: layer.badgeHex,
                  opacity: 0.75,
                  fontSize: '9px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 4,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                L{layer.tag}
              </div>
            ))}
            <div
              className="minimap-viewport-box"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `${Math.min(100, Math.max(25, 100 / scale))}%`,
                border: '1.5px solid #6366f1',
                background: 'rgba(99,102,241,0.15)',
                borderRadius: 3,
                pointerEvents: 'none',
              }}
            />
          </div>
        </aside>
      )}

      {/* Transformable Canvas Surface */}
      <div
        ref={containerRef}
        className="canvas-transform-layer"
        style={{
          position: 'relative',
          width: '100%',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'top center',
          transition: isPanning ? 'none' : 'transform 0.15s ease-out',
        }}
      >
        {/* SVG Orthogonal Edge Overlay */}
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
            {/* Standard slate arrowhead */}
            <marker id="marker-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
            </marker>

            {/* Active indigo arrowhead */}
            <marker id="marker-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4f46e5" />
            </marker>

            {/* Completed green arrowhead */}
            <marker id="marker-arrow-completed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#16a34a" />
            </marker>

            {/* Reject/Penalty red arrowhead */}
            <marker id="marker-arrow-danger" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#dc2626" />
            </marker>

            {/* Decision Warning amber arrowhead */}
            <marker id="marker-arrow-warning" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#d97706" />
            </marker>

            {/* Active gradient for pulse animations */}
            <linearGradient id="edge-gradient-active" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="edge-gradient-done" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {paths.map((p) => {
            let stroke = '#64748b';
            let strokeWidth = p.isHighlighted ? 2.5 : 1.5;
            let strokeDasharray = 'none';
            let markerEnd = 'url(#marker-arrow)';
            let className = 'edge-path';

            if (p.status === 'completed') {
              stroke = '#16a34a';
              strokeWidth = p.isHighlighted ? 3 : 2;
              markerEnd = 'url(#marker-arrow-completed)';
              className = 'edge-path completed';
            } else if (p.status === 'active') {
              stroke = '#4f46e5';
              strokeWidth = p.isHighlighted ? 3.5 : 2.5;
              strokeDasharray = '6 6';
              markerEnd = 'url(#marker-arrow-active)';
              className = 'edge-path active topology-flow-edge';
            } else if (p.status === 'decision-no') {
              stroke = '#d97706';
              strokeWidth = 2;
              strokeDasharray = '4 4';
              markerEnd = 'url(#marker-arrow-warning)';
              className = 'edge-path decision-no';
            } else if (p.status === 'reject-reset') {
              stroke = '#dc2626';
              strokeWidth = 2.5;
              strokeDasharray = '5 5';
              markerEnd = 'url(#marker-arrow-danger)';
              className = 'edge-path reject-reset';
            }

            return (
              <g key={p.id}>
                <path
                  d={p.d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  markerEnd={markerEnd}
                  className={className}
                  style={{
                    transition: 'stroke 0.25s ease, stroke-width 0.25s ease',
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Children components (Layers, Nodes, Decision Diamonds) */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
