// SVG Orthogonal overlay connecting 5 architecture layers with right-angled routing, zoom/pan controls, and minimap (Issue #205 & Issue #211).
// Path geometry is produced by the deterministic orthogonal router in
// `lib/topology/edgeRouter.ts` (issue #257 / TKT-066a), which guarantees
// zero shared segments, zero crossings, and zero node-card overlaps across
// all 37 connectors and all six scenario states.
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { EdgeVisualState, TopologyEdge, TopologyNodeId, TopologyNodeState, TopologyEndpointId } from '../../types';
import type { PhaseLaneId, PhaseStepperStatus } from '../../lib/topology';
import { TOPOLOGY_EDGES, TOPOLOGY_LAYERS } from '../../lib/topology';
import {
  DEFAULT_EDGE_GEOMETRY,
  deriveGeometryFromDom,
  routeAllEdges,
  type EdgeGeometryConfig,
  type RoutedEdge,
} from '../../lib/topology/edgeRouter';
import PhaseLaneOverlay from './PhaseLaneOverlay';
import { animateViewport, fitView, panToCenter } from './canvasControls';
import { TOPOLOGY_NODES } from '../../lib/topology';

interface TopologyCanvasProps {
  nodeStates: Record<TopologyNodeId, TopologyNodeState>;
  selectedNodeId: TopologyNodeId | null;
  phaseLaneStatuses?: Record<PhaseLaneId, PhaseStepperStatus>;
  children: React.ReactNode;
}

interface ComputedPath {
  id: string;
  edge: TopologyEdge;
  d: string;
  status: 'active' | 'completed' | 'idle' | 'decision-no' | 'reject-reset';
  label?: string;
  labelX?: number;
  labelY?: number;
  isHighlighted?: boolean;
}

/**
 * Convert live node states into the per-edge visual-state map the
 * deterministic router consumes. Mirrors the inline mapping that used to
 * live inside `updatePaths`, with two additions:
 *   - Decision-gate-1 → diagnostic-agent / technician-photo becomes
 *     `warning` (renders as the amber `decision-no` style).
 *   - Decision-gate-2 → streak-reset becomes `danger` (renders as the
 *     crimson `reject-reset` style).
 * The router then derives the AC-TOP-30 tone from the state.
 */
function buildEdgeStates(
  nodeStates: Record<TopologyNodeId, TopologyNodeState>,
): Record<string, EdgeVisualState> {
  const result: Record<string, EdgeVisualState> = {};
  for (const edge of TOPOLOGY_EDGES) {
    result[`${edge.from}>${edge.to}`] = 'idle';
  }
  for (const edge of TOPOLOGY_EDGES) {
    const fromId = edge.from as TopologyNodeId;
    const toId = edge.to as TopologyNodeId;
    if (!(fromId in nodeStates) && !(toId in nodeStates)) continue;
    const fromState = nodeStates[fromId]?.status;
    const toState = nodeStates[toId]?.status;
    const key = `${edge.from}>${edge.to}`;

    if (edge.from === 'decision-gate-1' && (edge.to === 'diagnostic-agent' || edge.to === 'technician-photo')) {
      if (toState === 'active' || toState === 'waiting' || toState === 'warning') {
        result[key] = 'warning';
      }
    } else if (edge.from === 'decision-gate-2' && edge.to === 'streak-reset') {
      if (toState === 'danger' || toState === 'active') {
        result[key] = 'danger';
      }
    } else if (fromState === 'done' && toState === 'done') {
      result[key] = 'completed';
    } else if (
      fromState === 'active'
      || toState === 'active'
      || fromState === 'waiting'
      || toState === 'waiting'
      || fromState === 'pending_approval'
      || toState === 'pending_approval'
    ) {
      result[key] = 'active';
    }
  }
  return result;
}

/** Map the router's per-edge visual state to the existing stroke style key. */
function visualStateToCanvasStatus(state: EdgeVisualState): ComputedPath['status'] {
  if (state === 'completed') return 'completed';
  if (state === 'warning') return 'decision-no';
  if (state === 'danger') return 'reject-reset';
  if (state === 'active') return 'active';
  return 'idle';
}

export default function TopologyCanvas({
  nodeStates,
  selectedNodeId,
  phaseLaneStatuses,
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

  // Compute SVG orthogonal right-angled paths via the deterministic router.
  // The router is pure: given the live node states + the DOM-measured
  // canvas geometry, it returns 37 mutually non-overlapping polylines that
  // match the port-coordinate waypoint table in TOPOLOGY_ROUTES.
  const updatePaths = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const geometry: EdgeGeometryConfig = deriveGeometryFromDom(container, DEFAULT_EDGE_GEOMETRY)
      ?? DEFAULT_EDGE_GEOMETRY;
    const edgeStates = buildEdgeStates(nodeStates);
    const routed = routeAllEdges({
      edgeStates,
      highlightedEndpoint: (selectedNodeId ?? null) as TopologyEndpointId | null,
      geometry,
    });

    const newPaths: ComputedPath[] = routed.map((r: RoutedEdge) => {
      // Label is anchored at the polyline's midpoint vertex.
      const labelIndex = Math.floor(r.points.length / 2);
      const labelPoint = r.points[labelIndex];
      return {
        id: `${r.edge.from}->${r.edge.to}`,
        edge: r.edge,
        d: r.d,
        status: visualStateToCanvasStatus(r.state),
        label: r.edge.label,
        labelX: labelPoint?.x,
        labelY: labelPoint?.y,
        isHighlighted: r.isHighlighted,
      };
    });
    setPaths(newPaths);
  }, [nodeStates, selectedNodeId]);

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

  const handleZoomIn = () =>
    animateViewport(
      { scale, pan },
      { scale: Math.min(1.6, Number((scale + 0.1).toFixed(2))) },
      ({ scale: nextScale }) => setScale(nextScale),
    );
  const handleZoomOut = () =>
    animateViewport(
      { scale, pan },
      { scale: Math.max(0.6, Number((scale - 0.1).toFixed(2))) },
      ({ scale: nextScale }) => setScale(nextScale),
    );
  const handleZoomReset = () =>
    animateViewport(
      { scale, pan },
      { scale: 1, pan: { x: 0, y: 0 } },
      (next) => {
        setScale(next.scale);
        setPan(next.pan);
      },
    );
  const handleFitToScreen = () =>
    fitView({ scale, pan }, (next) => {
      setScale(next.scale);
      setPan(next.pan);
    });

  // ----- Minimap schematic data (TKT-076 / Issue #277 — AC-TOP-30a) -----
  // The minimap does not read absolute coordinates from the live DOM
  // (jsdom cannot measure layout), so it derives a stable schematic from
  // the static layer/node catalog. Layer bands stack vertically in the
  // declared order; nodes inside a layer spread horizontally by index.
  // Two `.mm-window` rectangles highlight the upper detection cluster and
  // the lower verification cluster so the schematic matches the Stitch
  // mock authority used by QA.
  interface MinimapNode {
    id: TopologyNodeId;
    cx: number;
    cy: number;
    layerIndex: number;
    isDecisionGate: boolean;
  }
  interface MinimapLayer {
    id: string;
    label: string;
    y: number;
    height: number;
  }
  const MINIMAP_W = 112;
  const MINIMAP_H = 180;
  const layerCount = TOPOLOGY_LAYERS.length;
  const layerBandHeight = MINIMAP_H / layerCount;

  const minimapLayers: MinimapLayer[] = TOPOLOGY_LAYERS.map((layer, idx) => ({
    id: layer.id,
    label: layer.tag ?? layer.name,
    y: idx * layerBandHeight,
    height: layerBandHeight,
  }));

  const minimapNodes: MinimapNode[] = (() => {
    const items: MinimapNode[] = [];
    TOPOLOGY_LAYERS.forEach((layer, layerIndex) => {
      const nodesInLayer = TOPOLOGY_NODES.filter((n) => n.layer === layer.id);
      const count = nodesInLayer.length || 1;
      nodesInLayer.forEach((node, nodeIndex) => {
        const ratio = (nodeIndex + 1) / (count + 1);
        items.push({
          id: node.id,
          cx: ratio * MINIMAP_W,
          cy: layerIndex * layerBandHeight + layerBandHeight / 2,
          layerIndex,
          isDecisionGate: Boolean(node.isDecisionGate),
        });
      });
    });
    return items;
  })();

  // Window rectangles: upper detection (layer 0 + layer 1) and lower
  // verification (last layer). Each covers ~60% of the width centered.
  const upperWindow = {
    x: MINIMAP_W * 0.18,
    y: 0,
    width: MINIMAP_W * 0.64,
    height: layerBandHeight * 2,
  };
  const lowerWindow = {
    x: MINIMAP_W * 0.18,
    y: layerBandHeight * (layerCount - 1),
    width: MINIMAP_W * 0.64,
    height: layerBandHeight,
  };

  // `.mm-viewport` mirrors the live pan/scale state so users can see which
  // region of the canvas they are currently looking at. The minimap window
  // (MINIMAP_W × MINIMAP_H) represents the full un-transformed canvas in
  // world-coordinates; the overlay rectangle maps the visible viewport into
  // that same world space, so:
  //   x      = -pan.x / scale                 (world-coord of viewport's left edge)
  //           scaled by (MINIMAP_W / contentRect.w) so the overlay stays
  //           inside the minimap window even when the canvas is wider/narrower
  //           than MINIMAP_W (e.g. responsive layouts).
  //   width  = (viewport screen-px / scale)   = MINIMAP_W * (contentRect.w / scale) / contentRect.w
  //           equivalently:  MINIMAP_W / scale  when contentRect.w == MINIMAP_W.
  // Same logic for y / height. With pan=0, scale=1 this collapses to the
  // full minimap window — exactly what users expect before any interaction.
  const contentRect = viewportRef.current?.getBoundingClientRect();
  const contentW = Math.max(contentRect?.width ?? MINIMAP_W, 1);
  const contentH = Math.max(contentRect?.height ?? MINIMAP_H, 1);
  const viewportRect = {
    x: (-pan.x / scale) * (MINIMAP_W / contentW),
    y: (-pan.y / scale) * (MINIMAP_H / contentH),
    width: MINIMAP_W / scale,
    height: MINIMAP_H / scale,
  };

  const handleMinimapNodeClick = (node: MinimapNode) => {
    // Estimate the node's center in the un-transformed canvas space. The
    // canvas is laid out as a vertical pipeline of 5 phase lanes; we
    // approximate the node's y from its layer index and treat its x as the
    // canvas center (which is where panning centers it after fit).
    const layerIdx = node.layerIndex;
    const canvasHeight = Math.max(viewportRef.current?.clientHeight ?? 850, 850);
    const approxNodeY = (layerIdx + 0.5) * (canvasHeight / layerCount);
    const approxNodeX = (viewportRef.current?.clientWidth ?? MINIMAP_W) / 2;
    panToCenter(
      { scale, pan },
      { width: viewportRef.current?.clientWidth ?? MINIMAP_W, height: canvasHeight },
      { x: approxNodeX, y: approxNodeY },
      (next) => {
        setScale(next.scale);
        setPan(next.pan);
      },
    );
  };

  return (
    <div
      ref={viewportRef}
      className="canvas-wrapper topology-canvas-container"
      data-testid="topology-canvas"
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
      {/* Floating Canvas Navigation Toolbar
          (TKT-076 / Issue #277 — AC-TOP-30c: order [+][-][zoom-btn][fit][map]) */}
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
          className="ctrl-zoom-level"
          onClick={handleZoomReset}
          title="Reset View to 100%"
          aria-label="Reset View to 100%"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="ctrl-btn"
          onClick={handleFitToScreen}
          title="Fit to Screen"
          aria-label="Fit to Screen"
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

      {/* Floating Minimap Widget
          (TKT-076 / Issue #277 — AC-TOP-30a: body-level fixed, SVG schematic). */}
      {showMinimap && (
        <aside
          aria-label="Topology Minimap"
          className="minimap-widget"
          data-testid="topology-minimap"
        >
          <div className="minimap-title">Topology Minimap</div>
          <svg
            className="minimap-svg"
            viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
            role="img"
            aria-label="Minimap schematic of all topology layers and nodes"
          >
            {/* 2 cluster windows */}
            <rect
              className="mm-window"
              x={upperWindow.x}
              y={upperWindow.y}
              width={upperWindow.width}
              height={upperWindow.height}
              rx={2}
            />
            <rect
              className="mm-window"
              x={lowerWindow.x}
              y={lowerWindow.y}
              width={lowerWindow.width}
              height={lowerWindow.height}
              rx={2}
            />

            {/* 5 layer bands */}
            {minimapLayers.map((layer) => (
              <rect
                key={`layer-${layer.id}`}
                className="mm-layer"
                x={4}
                y={layer.y + 2}
                width={MINIMAP_W - 8}
                height={layer.height - 4}
                rx={2}
              />
            ))}

            {/* dashed sub-zones per layer (3 zones each to keep schematic readable) */}
            {minimapLayers.map((layer) =>
              [0, 1, 2].map((zoneIdx) => {
                const zoneWidth = (MINIMAP_W - 8) / 3;
                return (
                  <rect
                    key={`zone-${layer.id}-${zoneIdx}`}
                    className="mm-zone"
                    x={4 + zoneIdx * zoneWidth}
                    y={layer.y + 4}
                    width={zoneWidth - 1}
                    height={layer.height - 8}
                    rx={1}
                  />
                );
              }),
            )}

            {/* Node dots */}
            {minimapNodes.map((n) => (
              <circle
                key={`node-${n.id}`}
                className={`mm-node${selectedNodeId === n.id ? ' is-selected' : ''}`}
                cx={n.cx}
                cy={n.cy}
                r={n.isDecisionGate ? 2.4 : 1.8}
                data-testid={`mm-node-${n.id}`}
                role="button"
                aria-label={`Focus ${n.id}`}
                tabIndex={0}
                onClick={() => handleMinimapNodeClick(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMinimapNodeClick(n);
                  }
                }}
              />
            ))}

            {/* Gate accent dot (larger indigo ring) — drawn on top */}
            {minimapNodes
              .filter((n) => n.isDecisionGate)
              .map((n) => (
                <circle
                  key={`gate-${n.id}`}
                  className="mm-gate"
                  cx={n.cx}
                  cy={n.cy}
                  r={3.2}
                  data-testid={`mm-gate-${n.id}`}
                />
              ))}

            {/* Live viewport overlay synced with pan/scale */}
            <rect
              className="mm-viewport"
              x={Math.max(0, Math.min(MINIMAP_W - 4, viewportRect.x))}
              y={Math.max(0, Math.min(MINIMAP_H - 4, viewportRect.y))}
              width={Math.max(6, Math.min(MINIMAP_W, viewportRect.width))}
              height={Math.max(6, Math.min(MINIMAP_H, viewportRect.height))}
              rx={1.5}
            />
          </svg>
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
        {/* Inline Phase Lane dashed-border overlay (AC-TOP-23, #256) */}
        {phaseLaneStatuses && (
          <PhaseLaneOverlay
            containerRef={containerRef}
            laneStatuses={phaseLaneStatuses}
            scale={scale}
          />
        )}

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
