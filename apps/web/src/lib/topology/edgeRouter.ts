// Deterministic orthogonal SVG edge routing for the 37 System-Topology connectors.
// Implements AC-TOP-28 / AC-TOP-30 / AC-TOP-31 from issue #257 (TKT-066a).
// Pure module: no DOM reads, no React, no globals — every coordinate is derived
// from the port-coordinate waypoint table (TOPOLOGY_ROUTES), the fixed 48px row
// spacing, and the 56px layer gap. Two consecutive calls with the same input
// produce identical SVG `d` strings, which is the contract the design wireframe
// §5.1c relies on for parity across all six scenario states.
import type {
  EdgeTone,
  EdgeVisualState,
  GateBlockId,
  PortSide,
  TopologyEdge,
  TopologyEndpointId,
  TopologyNodeId,
} from '../../types';
import { TOPOLOGY_EDGES, TOPOLOGY_NODE_LAYOUT, TOPOLOGY_ROUTES } from '../topology';

export interface EdgeGeometryConfig {
  /** Width of a single node card in pixels. */
  nodeWidth: number;
  /** Height of a single node card in pixels. */
  nodeHeight: number;
  /** Horizontal gap between adjacent node columns, in pixels. */
  columnGap: number;
  /** Vertical gap between adjacent layer rows, in pixels. (AC-TOP-28: 56 px.) */
  layerGap: number;
  /** Inset of a side port from the card corner, in pixels. */
  portInset: number;
  /** Distance from a node to its gutter routing channel on the side, in pixels. */
  gutterOffset: number;
  /** Horizontal stagger between concurrent right-lane channels, in pixels. */
  laneChannelSpacing: number;
  /** Vertical stagger between concurrent lane bend segments, in pixels. */
  laneBandSpacing: number;
  /** Vertical space reserved for lane bands before/after a side port, in pixels. */
  laneBandClearance: number;
  /** Y offset between two edges that fan-out / fan-in on the same port, in pixels. */
  fanStagger: number;
  /** X offset between two edges that fan-out / fan-in on the same side port, in pixels. */
  fanStaggerSide: number;
  /** Padding inside the canvas from the outermost node, in pixels. */
  canvasPadding: number;
  /** Per-layer absolute Y offset (top edge of the layer's row band) in pixels. */
  layerYOffsets: Record<string, number>;
  /** Width of each topology window in pixels. */
  windowWidths: Record<'window-1' | 'window-2' | 'bridge', number>;
  /** Origin X (left edge) of each window's layout surface, in pixels. */
  windowOrigins: Record<'window-1' | 'window-2' | 'bridge', number>;
}

export const DEFAULT_EDGE_GEOMETRY: EdgeGeometryConfig = {
  nodeWidth: 200,
  nodeHeight: 112,
  columnGap: 24,
  layerGap: 56,
  portInset: 28,
  gutterOffset: 36,
  laneChannelSpacing: 22,
  laneBandSpacing: 12,
  laneBandClearance: 14,
  fanStagger: 14,
  fanStaggerSide: 10,
  canvasPadding: 24,
  layerYOffsets: {
    'layer-1': 0,
    'layer-2': 168,
    conduit: 320,
    'layer-3': 504,
    'layer-4': 672,
    'layer-5': 840,
  },
  windowWidths: {
    'window-1': 1240,
    'window-2': 1880,
    bridge: 360,
  },
  windowOrigins: {
    'window-1': 0,
    bridge: 1290,
    'window-2': 1680,
  },
};

export interface EdgePortPoint {
  x: number;
  y: number;
}

export interface RoutedEdge {
  /** Stable id derived from `from>to`. */
  id: string;
  edge: TopologyEdge;
  fromId: TopologyEndpointId;
  toId: TopologyEndpointId;
  /** Ordered list of polyline vertices (in pixels). */
  points: EdgePortPoint[];
  /** Equivalent SVG `d` attribute string (M / L only). */
  d: string;
  /** Tone mapping for AC-TOP-30 colors. */
  tone: EdgeTone;
  /** Visual state for scenario-driven stroke/dash. */
  state: EdgeVisualState;
  /** Edge id of the lane channel used for side-port edges, or undefined. */
  lane?: 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3';
  /** Whether the path is highlighted (a selected endpoint). */
  isHighlighted: boolean;
}

interface ResolvedPort {
  point: EdgePortPoint;
  window: 'window-1' | 'window-2' | 'bridge';
  rowIndex: number;
  colIndex: number;
  layerId: string;
  side: PortSide;
}

/** Per-edge fan-out / fan-in indices, computed once across all 37 edges. */
interface PortStaggerInfo {
  fanOutIndex: number;
  fanOutCount: number;
  fanInIndex: number;
  fanInCount: number;
}

const isGateBlockId = (id: TopologyEndpointId): id is GateBlockId =>
  id === 'gate1-yes' || id === 'gate1-no' || id === 'gate2-yes' || id === 'gate2-no';

const isConduitId = (id: TopologyEndpointId): boolean => id === 'pubsub-cross-bridge';

const getEdgeKey = (edge: TopologyEdge): string => `${edge.from}>${edge.to}`;

const laneAxis = (side: PortSide): 'h' | 'v' =>
  side === 'left' || side === 'right' ? 'h' : 'v';

/**
 * Resolve the absolute pixel coordinates of a port on a given endpoint.
 * The endpoint may be a regular node, a gate condition block, or the Pub/Sub
 * conduit. Layout metadata comes from {@link TOPOLOGY_NODE_LAYOUT}.
 */
function resolvePort(
  endpointId: TopologyEndpointId,
  side: PortSide,
  config: EdgeGeometryConfig,
  stagger: PortStaggerInfo,
  role: 'source' | 'destination',
): ResolvedPort {
  const layout = TOPOLOGY_NODE_LAYOUT[endpointId as string];
  if (!layout) {
    throw new Error(
      `[edgeRouter] No layout entry for endpoint "${endpointId}". ` +
        'Add it to TOPOLOGY_NODE_LAYOUT before routing.',
    );
  }
  const window = layout.container;
  const windowOriginX = config.windowOrigins[window];
  const windowWidth = config.windowWidths[window];

  const layerY = config.layerYOffsets[layout.layer];
  if (layerY === undefined) {
    throw new Error(
      `[edgeRouter] No Y offset configured for layer "${layout.layer}" (endpoint "${endpointId}").`,
    );
  }

  const columnsInRow = countColumnsForContainer(layout.container, layout.layer);
  const colWidth = (windowWidth - 2 * config.canvasPadding - (columnsInRow - 1) * config.columnGap) / columnsInRow;
  const colStartX = windowOriginX + config.canvasPadding + (layout.col - 1) * (colWidth + config.columnGap);
  const centerX = colStartX + colWidth / 2;

  const rowTopY = layerY;
  const rowBottomY = rowTopY + config.nodeHeight;
  const centerY = rowTopY + config.nodeHeight / 2;

  const index = role === 'source' ? stagger.fanOutIndex : stagger.fanInIndex;
  const count = role === 'source' ? stagger.fanOutCount : stagger.fanInCount;
  // Center the fan group on the card edge so symmetric edges (e.g.
  // gate1 > gate1-yes / gate1 > gate1-no) bow out evenly.
  const centerOffset = count > 1 ? (index - (count - 1) / 2) : 0;

  let x = centerX;
  let y = centerY;
  switch (side) {
    case 'top':
      x = centerX + centerOffset * config.fanStaggerSide;
      y = rowTopY;
      break;
    case 'bottom':
      x = centerX + centerOffset * config.fanStaggerSide;
      y = rowBottomY;
      break;
    case 'left':
      x = colStartX;
      y = rowTopY + config.portInset + centerOffset * config.fanStagger;
      break;
    case 'right':
      x = colStartX + colWidth;
      y = rowTopY + config.portInset + centerOffset * config.fanStagger;
      break;
  }

  return {
    point: { x, y },
    window,
    rowIndex: layout.row,
    colIndex: layout.col,
    layerId: layout.layer,
    side,
  };
}

/**
 * Build a per-edge fan-out / fan-in index map. Two edges fan out from the
 * same `(from, fromPort)` if the source endpoint has more than one outgoing
 * edge on the same side. The resulting indices are zero-based and stable
 * across calls (sorted by `from>to` key), which keeps the AC-TOP-28
 * deterministic invariant intact even after we stagger the ports.
 */
function computePortStaggers(
  edges: TopologyEdge[],
  routes: Record<string, { fromPort: PortSide; toPort: PortSide }>,
): Map<string, PortStaggerInfo> {
  type Bucket = { sortKey: string; info: PortStaggerInfo; edgeIndex: number };
  const outBuckets = new Map<string, Bucket[]>();
  const inBuckets = new Map<string, Bucket[]>();
  const allBuckets: Array<{ kind: 'out' | 'in'; key: string; bucket: Bucket[] }> = [];

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const edgeKey = getEdgeKey(edge);
    const route = routes[edgeKey];
    if (!route) continue;
    const sortKey = `${edge.from}|${route.fromPort}|${edge.to}`;
    const outKey = `${edge.from}|${route.fromPort}`;
    const inKey = `${edge.to}|${route.toPort}`;
    const info: PortStaggerInfo = {
      fanOutIndex: 0,
      fanOutCount: 0,
      fanInIndex: 0,
      fanInCount: 0,
    };
    const outBucket = outBuckets.get(outKey) ?? [];
    outBucket.push({ sortKey, info, edgeIndex: i });
    outBuckets.set(outKey, outBucket);
    const inBucket = inBuckets.get(inKey) ?? [];
    inBucket.push({ sortKey, info, edgeIndex: i });
    inBuckets.set(inKey, inBucket);
  }

  for (const [key, bucket] of outBuckets.entries()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    bucket.forEach((b, idx) => {
      b.info.fanOutIndex = idx;
      b.info.fanOutCount = bucket.length;
    });
    allBuckets.push({ kind: 'out', key, bucket });
  }
  for (const [key, bucket] of inBuckets.entries()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    bucket.forEach((b, idx) => {
      b.info.fanInIndex = idx;
      b.info.fanInCount = bucket.length;
    });
    allBuckets.push({ kind: 'in', key, bucket });
  }

  const result = new Map<string, PortStaggerInfo>();
  for (const edge of edges) {
    const edgeKey = getEdgeKey(edge);
    const info: PortStaggerInfo = {
      fanOutIndex: 0,
      fanOutCount: 1,
      fanInIndex: 0,
      fanInCount: 1,
    };
    result.set(edgeKey, info);
  }
  for (const { bucket } of allBuckets) {
    for (const b of bucket) {
      const edge = edges[b.edgeIndex];
      const edgeKey = getEdgeKey(edge);
      result.set(edgeKey, b.info);
    }
  }
  return result;
}

function countColumnsForContainer(
  container: 'window-1' | 'window-2' | 'bridge',
  layer: string,
): number {
  // Mirrors the CSS grid template for each layer in SystemTopologyView.
  if (container === 'bridge') return 1;
  if (layer === 'layer-1') return 5;
  if (layer === 'layer-2') return 2;
  if (layer === 'layer-3') return 5;
  if (layer === 'layer-4') return 13;
  if (layer === 'layer-5') return 9;
  return 1;
}

interface LaneReservation {
  lane: 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3';
  channelIndex: number;
  bandIndex: number;
}

function lanePriority(lane: 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3'): number {
  const order = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'];
  return order.indexOf(lane);
}

/**
 * Pre-compute a deterministic channel + band index per side-lane across the
 * 37 edges. The reserved ordering follows the sort below:
 *   1. The `from > to` key (stable lexicographic sort).
 *   2. Lane letter (L1 → R3).
 * Sorting first by edge key keeps the resulting bend positions stable when
 * the same input is re-routed (no DOM mutation), which is the AC-TOP-28
 * deterministic invariant.
 */
function reserveLanes(
  edges: TopologyEdge[],
  routes: Record<string, { lane?: 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3' }>,
): Map<string, LaneReservation> {
  const sidePorts: Array<{ edgeKey: string; lane: 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3' }> = [];
  for (const edge of edges) {
    const route = routes[getEdgeKey(edge)];
    if (!route?.lane) continue;
    sidePorts.push({ edgeKey: getEdgeKey(edge), lane: route.lane });
  }
  sidePorts.sort((a, b) => {
    const cmp = a.edgeKey.localeCompare(b.edgeKey);
    if (cmp !== 0) return cmp;
    return lanePriority(a.lane) - lanePriority(b.lane);
  });

  const channelCounters = new Map<'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3', number>();
  const bandCounters = new Map<'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3', number>();
  const reserved = new Map<string, LaneReservation>();
  for (const { edgeKey, lane } of sidePorts) {
    const channelIndex = channelCounters.get(lane) ?? 0;
    channelCounters.set(lane, channelIndex + 1);
    // Band counter is per-channel so two side-port edges sharing a lane on
    // different sides of the canvas don't pile up on the same band line.
    const bandKey = `${lane}:${channelIndex}`;
    const bandIndex = bandCounters.get(bandKey as 'L1') ?? 0;
    bandCounters.set(bandKey as 'L1', bandIndex + 1);
    reserved.set(edgeKey, { lane, channelIndex, bandIndex });
  }
  return reserved;
}

/**
 * Build the orthogonal polyline for an edge. Two-port edges (left/right) use
 * a side-lane gutter outside the canvas extent to avoid crossing any node
 * card. Top/bottom ports use a simple row-bridge that stays in the inter-layer
 * gap. Returns at most 4 vertices (3 segments) for a single bend, which keeps
 * the resulting `d` short and inspectable.
 */
function routePolyline(
  from: ResolvedPort,
  to: ResolvedPort,
  reservation: LaneReservation | undefined,
  config: EdgeGeometryConfig,
): EdgePortPoint[] {
  const points: EdgePortPoint[] = [from.point];

  if (from.side === to.side && laneAxis(from.side) === 'v') {
    // Top → top or bottom → bottom. The source and destination share an
    // X-anchored row edge, so the bridge must detour out of the row first
    // to avoid crossing any cards that sit between them in the same row.
    // We push the bridge Y up (for `top`) or down (for `bottom`) by the
    // standard inter-layer clearance so the horizontal run lives in the
    // gap band and never crosses a node body.
    const isTop = from.side === 'top';
    const sourceRowTop = config.layerYOffsets[from.layerId] ?? 0;
    const sourceRowBottom = sourceRowTop + config.nodeHeight;
    const yBridge = isTop ? sourceRowTop - config.layerGap / 2 : sourceRowBottom + config.layerGap / 2;
    points.push({ x: from.point.x, y: yBridge });
    points.push({ x: to.point.x, y: yBridge });
    points.push(to.point);
    return points;
  }

  if (from.side === to.side && laneAxis(from.side) === 'h') {
    // Left → left or right → right: bridge horizontally via a lane gutter.
    const isRight = from.side === 'right';
    const direction = isRight ? 1 : -1;
    const xChannel = (reservation?.channelIndex ?? 0) * config.laneChannelSpacing;
    const xAnchor = (isRight ? Math.max(from.point.x, to.point.x) : Math.min(from.point.x, to.point.x))
      + direction * (config.gutterOffset + xChannel);
    const bandY = (reservation?.bandIndex ?? 0) * config.laneBandSpacing;
    const clearance = config.laneBandClearance;
    const yBridge = Math.min(from.point.y, to.point.y) - clearance - bandY;
    points.push({ x: xAnchor, y: from.point.y });
    points.push({ x: xAnchor, y: yBridge });
    points.push({ x: to.point.x, y: yBridge });
    points.push({ x: to.point.x, y: to.point.y });
    points.push(to.point);
    return points;
  }

  // Mixed side: route the polyline so it never enters a node card. We pick
  // the bridge Y on the side of the source row that is CLOSEST to the
  // destination row, so the source vertical detours out of the source row
  // through the shortest safe path. The destination vertical then descends
  // (or ascends) the rest of the way. The source vertical is anchored at
  // the source's column X; the destination vertical is anchored at the
  // destination's column X. Both verticals are kept short (one
  // `layerGap/2` hop into the gap) so they stay clear of any narrow
  // intermediate-row cards.
  const sourceRowTop = config.layerYOffsets[from.layerId] ?? 0;
  const sourceRowBottom = sourceRowTop + config.nodeHeight;
  const destRowTop = config.layerYOffsets[to.layerId] ?? 0;
  const destRowBottom = destRowTop + config.nodeHeight;

  let yBridge: number;
  if (sourceRowTop < destRowTop) {
    // Destination is below source. Detour through the gap below the
    // source row.
    yBridge = sourceRowBottom + config.layerGap / 2;
  } else if (sourceRowTop > destRowTop) {
    // Destination is above source. Detour through the gap above the
    // source row.
    yBridge = sourceRowTop - config.layerGap / 2;
  } else {
    // Same row. Detour above or below the shared row, choosing the side
    // that matches the destination's port to keep the destination
    // vertical short.
    yBridge = to.side === 'top'
      ? sourceRowTop - config.layerGap / 2
      : sourceRowBottom + config.layerGap / 2;
  }

  // Clamp the bridge Y into the gap so we never accidentally land on a
  // row boundary (where the eps margin would treat the segment as
  // touching neighbouring cards).
  yBridge = clampIntoGap(yBridge, sourceRowTop, sourceRowBottom, destRowTop, destRowBottom);

  points.push({ x: from.point.x, y: yBridge });
  points.push({ x: to.point.x, y: yBridge });
  points.push(to.point);
  return points;
}

/**
 * Ensure `y` lies strictly inside the inter-row gap (not on a row edge)
 * with a margin of `EPSILON` from any neighbouring card. When source and
 * destination share a row, `y` is left as-is so the gap-detour logic
 * above can place it above or below the row.
 */
function clampIntoGap(
  y: number,
  sourceRowTop: number,
  sourceRowBottom: number,
  destRowTop: number,
  destRowBottom: number,
): number {
  const margin = Math.max(EPSILON + 0.5, 1.5);
  // Clamp inside the union of the source-side gap and dest-side gap.
  const upperBound = Math.min(sourceRowTop, destRowTop) - margin;
  const lowerBound = Math.max(sourceRowBottom, destRowBottom) + margin;
  if (y < upperBound) return upperBound;
  if (y > lowerBound) return lowerBound;
  return y;
}

function pointsToPath(points: EdgePortPoint[]): string {
  if (points.length === 0) return '';
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
  }
  return d;
}

const fmt = (n: number): string => Number.isFinite(n) ? n.toFixed(2) : '0';

export interface EdgeRouterInput {
  /** Live edge states keyed by edge id (`from>to`). */
  edgeStates: Record<string, EdgeVisualState>;
  /** Optional highlighted endpoint; both endpoints of the edge are highlighted. */
  highlightedEndpoint?: TopologyEndpointId | null;
  /** Optional override for the geometry config; defaults to {@link DEFAULT_EDGE_GEOMETRY}. */
  geometry?: EdgeGeometryConfig;
}

export function routeAllEdges(input: EdgeRouterInput): RoutedEdge[] {
  const geometry = input.geometry ?? DEFAULT_EDGE_GEOMETRY;
  const reservations = reserveLanes(TOPOLOGY_EDGES, TOPOLOGY_ROUTES);
  const staggers = computePortStaggers(TOPOLOGY_EDGES, TOPOLOGY_ROUTES);
  const routed: RoutedEdge[] = [];

  for (const edge of TOPOLOGY_EDGES) {
    const route = TOPOLOGY_ROUTES[getEdgeKey(edge)];
    if (!route) {
      // The wireframe AC-TOP-31 forbids routing an edge without a port
      // declaration, so an edge without a route is a hard error rather than
      // a silent skip — it would otherwise silently disappear from the canvas.
      throw new Error(
        `[edgeRouter] Missing TOPOLOGY_ROUTES entry for edge "${getEdgeKey(edge)}".`,
      );
    }

    const edgeKey = getEdgeKey(edge);
    const reservation = reservations.get(edgeKey);
    const stagger = staggers.get(edgeKey) ?? {
      fanOutIndex: 0,
      fanOutCount: 1,
      fanInIndex: 0,
      fanInCount: 1,
    };
    const from = resolvePort(edge.from, route.fromPort, geometry, stagger, 'source');
    const to = resolvePort(edge.to, route.toPort, geometry, stagger, 'destination');

    // Sanity-check: side-port edges that span across the canvas or wrap to a
    // different layer must declare a lane. Same-row adjacent side→side edges
    // (e.g. edge-bridge ↔ edge-gemma on layer-2 cols 1 & 2) bridge directly
    // through the inter-column gap and do not need a gutter channel.
    const sideSpan = (from.side === 'left' || from.side === 'right'
      || to.side === 'left' || to.side === 'right');
    const sameRowAdjacent = sideSpan
      && from.rowIndex === to.rowIndex
      && from.window === to.window
      && ((from.side === 'right' && to.side === 'left' && from.colIndex < to.colIndex)
        || (from.side === 'left' && to.side === 'right' && to.colIndex < from.colIndex)
        || (from.side === 'right' && to.side === 'right' && from.colIndex === to.colIndex)
        || (from.side === 'left' && to.side === 'left' && from.colIndex === to.colIndex));
    if (sideSpan && !route.lane && !sameRowAdjacent) {
      throw new Error(
        `[edgeRouter] Edge "${getEdgeKey(edge)}" uses side ports but no lane assignment.`,
      );
    }

    const points = routePolyline(from, to, reservation, geometry);
    const id = getEdgeKey(edge);
    const state = input.edgeStates[id] ?? 'idle';
    const tone = deriveTone(edge, state);
    const isHighlighted = !!input.highlightedEndpoint
      && (edge.from === input.highlightedEndpoint || edge.to === input.highlightedEndpoint);

    routed.push({
      id,
      edge,
      fromId: edge.from,
      toId: edge.to,
      points,
      d: pointsToPath(points),
      tone,
      state,
      lane: reservation?.lane,
      isHighlighted,
    });
  }
  return routed;
}

function deriveTone(edge: TopologyEdge, state: EdgeVisualState): EdgeTone {
  if (state === 'completed') return 'yes';
  if (state === 'active') return 'neutral';
  if (state === 'warning') return 'warning';
  if (state === 'danger') return 'danger';
  return edge.tone ?? 'neutral';
}

/** AC-TOP-30 color tokens — keep in sync with design tokens in index.css. */
export const EDGE_COLOR_TOKENS: Record<EdgeTone | 'idle', { stroke: string; width: number; dash?: string }> = {
  yes: { stroke: '#10b981', width: 2 },
  warning: { stroke: '#f59e0b', width: 2 },
  danger: { stroke: '#e11d48', width: 2 },
  neutral: { stroke: '#64748b', width: 2 },
  idle: { stroke: '#64748b', width: 2 },
};

/**
 * Detect shared axis-aligned segments between two orthogonal polylines.
 * Two segments are "shared" only when both endpoints match to within
 * {@link EPSILON} and they share a constant Y (horizontal) or constant X
 * (vertical). This is the AC-TOP-28 "zero shared segments" invariant.
 */
export interface OverlapReport {
  /** True when no two edges share an axis-aligned segment. */
  passes: boolean;
  /** Edge id pairs that share a segment (id1, id2). */
  conflicts: Array<{ a: string; b: string; segment: string }>;
}

const EPSILON = 0.5;

function segmentKey(p1: EdgePortPoint, p2: EdgePortPoint): string | null {
  if (Math.abs(p1.x - p2.x) < EPSILON) {
    return `V@${fmt(p1.x)}|y=${fmt(Math.min(p1.y, p2.y))}-${fmt(Math.max(p1.y, p2.y))}`;
  }
  if (Math.abs(p1.y - p2.y) < EPSILON) {
    return `H@y=${fmt(p1.y)}|x=${fmt(Math.min(p1.x, p2.x))}-${fmt(Math.max(p1.x, p2.x))}`;
  }
  return null;
}

function segmentsOverlap(key1: string, key2: string): boolean {
  if (key1 === key2) return true;
  const m1 = key1.match(/^[VH]@[^|]+\|(.+)$/);
  const m2 = key2.match(/^[VH]@[^|]+\|(.+)$/);
  if (!m1 || !m2) return false;
  if (key1[0] !== key2[0]) return false;
  const [a1, a2] = m1[1].split('-').map(Number);
  const [b1, b2] = m2[1].split('-').map(Number);
  return Math.max(a1, b1) < Math.min(a2, b2);
}

export function detectSegmentOverlaps(edges: RoutedEdge[]): OverlapReport {
  const segMap = new Map<string, Array<{ id: string; key: string }>>();
  for (const edge of edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const key = segmentKey(edge.points[i - 1], edge.points[i]);
      if (!key) continue;
      const bucket = segMap.get(key) ?? [];
      bucket.push({ id: edge.id, key });
      segMap.set(key, bucket);
    }
  }

  const conflicts: OverlapReport['conflicts'] = [];
  for (const [segKey, owners] of segMap.entries()) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const a = owners[i];
        const b = owners[j];
        if (segmentsOverlap(a.key, b.key)) {
          conflicts.push({ a: a.id, b: b.id, segment: segKey });
        }
      }
    }
  }
  return { passes: conflicts.length === 0, conflicts };
}

export interface CrossReport {
  passes: boolean;
  intersections: Array<{ a: string; b: string; x: number; y: number }>;
}

function segmentsCross(
  p1: EdgePortPoint,
  p2: EdgePortPoint,
  q1: EdgePortPoint,
  q2: EdgePortPoint,
): EdgePortPoint | null {
  // We only care about crossings between orthogonal axis-aligned segments
  // because the router never produces diagonal segments. Vertical × Horizontal
  // is the only meaningful case.
  const isPVertical = Math.abs(p1.x - p2.x) < EPSILON;
  const isQVertical = Math.abs(q1.x - q2.x) < EPSILON;
  if (isPVertical === isQVertical) return null;

  const v = isPVertical ? p1 : q1;
  const h = isPVertical ? q1 : p1;
  const v2 = isPVertical ? p2 : q2;
  const h2 = isPVertical ? q2 : p2;

  if (Math.abs(v.x - h.x) > EPSILON) return null;
  if (Math.abs(h.y - v.y) > EPSILON) return null;

  const vyMin = Math.min(v.y, v2.y);
  const vyMax = Math.max(v.y, v2.y);
  const hxMin = Math.min(h.x, h2.x);
  const hxMax = Math.max(h.x, h2.x);
  if (v.y < vyMin + EPSILON || v.y > vyMax - EPSILON) return null;
  if (h.x < hxMin + EPSILON || h.x > hxMax - EPSILON) return null;

  return { x: v.x, y: h.y };
}

export function detectCrossings(edges: RoutedEdge[]): CrossReport {
  const intersections: CrossReport['intersections'] = [];
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i];
      const b = edges[j];
      // Skip if they share an endpoint.
      const sharedEndpoint = a.fromId === b.fromId
        || a.fromId === b.toId
        || a.toId === b.fromId
        || a.toId === b.toId;
      if (sharedEndpoint) continue;
      for (let p = 1; p < a.points.length; p += 1) {
        for (let q = 1; q < b.points.length; q += 1) {
          const hit = segmentsCross(a.points[p - 1], a.points[p], b.points[q - 1], b.points[q]);
          if (hit) {
            intersections.push({ a: a.id, b: b.id, x: hit.x, y: hit.y });
          }
        }
      }
    }
  }
  return { passes: intersections.length === 0, intersections };
}

/**
 * Detect when a polyline segment passes through any node card. Uses the same
 * row/column geometry the router emits, so it never disagrees with the
 * generated path.
 */
export function detectCardOverlaps(
  edges: RoutedEdge[],
  config: EdgeGeometryConfig = DEFAULT_EDGE_GEOMETRY,
): { passes: boolean; conflicts: Array<{ edgeId: string; card: TopologyNodeId | TopologyEndpointId }> } {
  const cardBounds = computeCardBounds(config);
  const conflicts: Array<{ edgeId: string; card: TopologyNodeId | TopologyEndpointId }> = [];
  for (const edge of edges) {
    for (const id of [edge.fromId, edge.toId]) {
      if (isGateBlockId(id) || isConduitId(id)) continue;
    }
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const isVertical = Math.abs(a.x - b.x) < EPSILON;
      for (const [id, box] of cardBounds.entries()) {
        // Allow the segment to touch the card it terminates at.
        if (id === edge.fromId || id === edge.toId) continue;
        // Card box: x range [box.x, box.x + box.w], y range [box.min, box.max].
        // Vertical segment at fixed X with Y range [ya, yb] crosses the card
        // iff X ∈ [box.x, box.x+box.w] AND [ya, yb] ∩ [box.min, box.max] ≠ ∅.
        // Horizontal segment at fixed Y with X range [xa, xb] crosses the card
        // iff Y ∈ [box.min, box.max] AND [xa, xb] ∩ [box.x, box.x+box.w] ≠ ∅.
        let crosses = false;
        if (isVertical) {
          const xFixed = a.x;
          const ya = Math.min(a.y, b.y);
          const yb = Math.max(a.y, b.y);
          crosses = xFixed >= box.x - EPSILON && xFixed <= box.x + box.w + EPSILON
            && ya <= box.max + EPSILON && yb >= box.min - EPSILON;
        } else {
          const yFixed = a.y;
          const xa = Math.min(a.x, b.x);
          const xb = Math.max(a.x, b.x);
          crosses = yFixed >= box.min - EPSILON && yFixed <= box.max + EPSILON
            && xa <= box.x + box.w + EPSILON && xb >= box.x - EPSILON;
        }
        if (!crosses) continue;
        conflicts.push({ edgeId: edge.id, card: id });
      }
    }
  }
  return { passes: conflicts.length === 0, conflicts };
}

interface CardBox {
  x: number;
  w: number;
  min: number;
  max: number;
}

function computeCardBounds(config: EdgeGeometryConfig = DEFAULT_EDGE_GEOMETRY): Map<TopologyNodeId | TopologyEndpointId, CardBox> {
  const map = new Map<TopologyNodeId | TopologyEndpointId, CardBox>();
  for (const [id, layout] of Object.entries(TOPOLOGY_NODE_LAYOUT)) {
    const windowOriginX = config.windowOrigins[layout.container];
    const windowWidth = config.windowWidths[layout.container];
    const layerY = config.layerYOffsets[layout.layer];
    if (layerY === undefined) continue;
    const columnsInRow = countColumnsForContainer(layout.container, layout.layer);
    const colWidth = (windowWidth - 2 * config.canvasPadding - (columnsInRow - 1) * config.columnGap) / columnsInRow;
    const colStartX = windowOriginX + config.canvasPadding + (layout.col - 1) * (colWidth + config.columnGap);
    map.set(id as TopologyNodeId, {
      x: colStartX,
      w: colWidth,
      min: layerY,
      max: layerY + config.nodeHeight,
    });
  }
  return map;
}

export const __test__ = {
  resolvePort,
  routePolyline,
  reserveLanes,
  detectSegmentOverlaps,
  detectCrossings,
  detectCardOverlaps,
  isGateBlockId,
  isConduitId,
  countColumnsForContainer,
  computeCardBounds,
  segmentsCross,
  segmentKey,
  pointsToPath,
  deriveGeometryFromDom,
};

/**
 * Derive the {@link EdgeGeometryConfig} from the live DOM so the router's
 * pure algorithm produces paths that align with the rendered CSS grid
 * regardless of viewport width. The function walks every endpoint in
 * {@link TOPOLOGY_NODE_LAYOUT}, reads its `getBoundingClientRect()`, and
 * collapses the measured coordinates into a per-window geometry record.
 *
 * Returns `null` when the DOM is not ready (any endpoint missing).
 */
export function deriveGeometryFromDom(
  container: HTMLElement,
  base: EdgeGeometryConfig = DEFAULT_EDGE_GEOMETRY,
): EdgeGeometryConfig | null {
  const containerRect = container.getBoundingClientRect();
  const layoutEntries = Object.entries(TOPOLOGY_NODE_LAYOUT);

  const windowMetrics: Record<'window-1' | 'window-2' | 'bridge', {
    leftMost: number;
    rightMost: number;
    topMost: number;
    bottomMost: number;
    colGaps: number[];
    rowGaps: number[];
    nodes: number;
  }> = {
    'window-1': { leftMost: Infinity, rightMost: -Infinity, topMost: Infinity, bottomMost: -Infinity, colGaps: [], rowGaps: [], nodes: 0 },
    'window-2': { leftMost: Infinity, rightMost: -Infinity, topMost: Infinity, bottomMost: -Infinity, colGaps: [], rowGaps: [], nodes: 0 },
    bridge: { leftMost: Infinity, rightMost: -Infinity, topMost: Infinity, bottomMost: -Infinity, colGaps: [], rowGaps: [], nodes: 0 },
  };

  const layerYOffsets: Record<string, number> = { ...base.layerYOffsets };

  for (const [endpointId, layout] of layoutEntries) {
    const el = container.querySelector(`[data-node="${endpointId}"]`) as HTMLElement | null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const w = windowMetrics[layout.container];
    if (!w) return null;
    w.leftMost = Math.min(w.leftMost, rect.left - containerRect.left);
    w.rightMost = Math.max(w.rightMost, rect.right - containerRect.left);
    w.topMost = Math.min(w.topMost, rect.top - containerRect.top);
    w.bottomMost = Math.max(w.bottomMost, rect.bottom - containerRect.top);
    w.nodes += 1;
    if (layout.layer in layerYOffsets) {
      // Keep the smallest observed Y for each layer — they should be
      // identical but the smallest wins as the canonical row top.
      layerYOffsets[layout.layer] = Math.min(layerYOffsets[layout.layer] ?? Infinity, rect.top - containerRect.top);
    }
  }

  const windowWidths: Record<'window-1' | 'window-2' | 'bridge', number> = {
    'window-1': 0,
    'window-2': 0,
    bridge: 0,
  };
  const windowOrigins: Record<'window-1' | 'window-2' | 'bridge', number> = {
    'window-1': 0,
    bridge: 0,
    'window-2': 0,
  };

  // Order windows left-to-right by their leftMost.
  const windowKeys = ['window-1', 'bridge', 'window-2'] as const;
  const ordered = [...windowKeys].sort((a, b) =>
    windowMetrics[a].leftMost - windowMetrics[b].leftMost,
  );

  let cursor = 0;
  for (const win of ordered) {
    const m = windowMetrics[win];
    if (m.nodes === 0) continue;
    windowOrigins[win] = cursor;
    const width = m.rightMost - m.leftMost;
    windowWidths[win] = width;
    cursor += width;
  }

  // nodeHeight: use the dominant row height from the measured endpoints.
  const nodeHeight = (() => {
    let max = 0;
    for (const [endpointId] of layoutEntries) {
      const el = container.querySelector(`[data-node="${endpointId}"]`) as HTMLElement | null;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height > max) max = rect.height;
    }
    return max || base.nodeHeight;
  })();

  return {
    ...base,
    nodeHeight,
    layerYOffsets,
    windowWidths,
    windowOrigins,
  };
}