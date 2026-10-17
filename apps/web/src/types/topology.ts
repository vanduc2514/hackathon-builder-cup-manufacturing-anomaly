// System Topology & Realtime Execution Graph Types (Issue #205, #211, #254 / TKT-063)

export type TopologyLayerId =
  | 'layer-1'
  | 'layer-2'
  | 'layer-3'
  | 'layer-4'
  | 'layer-5';

export type TopologyWindowId = 'window-1' | 'window-2';

export type TopologyScenarioId =
  | 'nominal'
  | 'detecting'
  | 'low_confidence'
  | 'streak_verifying'
  | 'streak_reset'
  | 'approved';

export type TopologyNodeId =
  // Layer 1: Factory Floor · Edge Data Sources
  | 'floor-machines'
  | 'floor-cameras'
  | 'floor-sensors'
  | 'floor-mics'
  | 'floor-tags'
  // Layer 2: On-Premises Gateway · Gemma Edge & Bridge
  | 'edge-gemma'
  | 'edge-bridge'
  // Layer 3: Google Cloud · Data & AI Platform
  | 'gcp-pubsub'
  | 'gcp-bigquery'
  | 'gcp-firestore'
  | 'gcp-rag'
  | 'gcp-gemini'
  // Layer 4: Agent Team · Google ADK Multi-Agent System
  | 'adk-orch'
  | 'agent-qa'
  | 'agent-tra'
  | 'agent-pa'
  | 'agent-rca'
  | 'decision-gate-1'
  | 'diagnostic-agent'
  | 'technician-photo'
  | 'copilot-live'
  | 'agent-scribe'
  | 'agent-learn'
  // Layer 5: Human-in-the-Loop & Operational Outputs
  | 'human-tech'
  | 'verify-camera'
  | 'decision-gate-2'
  | 'streak-reset'
  | 'human-dash'
  | 'human-lead'
  | 'output-docs';

export type TopologyPhaseId =
  | 'phase-a'
  | 'phase-b'
  | 'phase-c'
  | 'phase-d'
  | TopologyLayerId;

export type TopologyTier =
  | 'Tier 1 & 2'
  | 'Tier 1'
  | 'Tier 2'
  | 'Tier 3 & 4'
  | 'Tier 4'
  | 'Tier 4 & 5'
  | 'Tier 5'
  | string;

export type TopologyNodeStatus =
  | 'idle'
  | 'active'
  | 'done'
  | 'error'
  | 'pending_approval'
  | 'waiting'
  | 'nominal'
  | 'warning'
  | 'danger'
  | 'locked'
  | 'completed';

export interface TopologyUiRef {
  surface: string;
  route: string;
  component: string;
  ctaLabel: string;
  previewHtml?: string;
  targetTab?: 'overview' | 'topology' | 'incident-detail' | 'impact' | 'walkthroughs' | 'sops';
}

export interface TopologyNodeDefinition {
  id: TopologyNodeId;
  phase: TopologyPhaseId;
  layer?: TopologyLayerId;
  window?: TopologyWindowId;
  label: string;
  sublabel: string;
  tier: TopologyTier;
  tierDescription: string;
  icon: string;
  techStack: string[];
  jtbd: string;
  order: number;
  sla?: string;
  channel?: string;
  fallback?: string;
  uiRef?: TopologyUiRef;
  payload?: Record<string, unknown>;
  isDecisionGate?: boolean;
}

export type TopologyEdgeType =
  | 'vertical'
  | 'horizontal'
  | 'branch-left'
  | 'branch-right'
  | 'loop-left'
  | 'loop-right'
  | 'gutter-right'
  | 'gutter-left'
  | 'loopback'
  | 'loopback-long';

/** Decision-gate condition block id (AC-TOP-31 §5.1c); not a {@link TopologyNodeId}. */
export type GateBlockId = 'gate1-yes' | 'gate1-no' | 'gate2-yes' | 'gate2-no';

/** The single Edge Bridge ↔ Cloud Pub/Sub crossing conduit; not a {@link TopologyNodeId}. */
export type ConduitId = 'pubsub-cross-bridge';

/** Anything an edge may connect: a real node, a gate condition block, or the Pub/Sub conduit. */
export type TopologyEndpointId = TopologyNodeId | GateBlockId | ConduitId;

export type EdgeTone = 'neutral' | 'yes' | 'warning' | 'danger';

export type EdgeVisualState = 'idle' | 'active' | 'completed' | 'warning' | 'danger';

export interface TopologyEdge {
  from: TopologyEndpointId;
  to: TopologyEndpointId;
  label?: string;
  tone?: EdgeTone;
  bidirectional?: boolean;
  type?: TopologyEdgeType;
}

/** @deprecated use {@link TopologyEdge}; kept as an alias until the pixel-geometry rework (#257). */
export type TopologyEdgeDefinition = TopologyEdge;

export interface GateConditionBlock {
  id: GateBlockId;
  gateId: 'decision-gate-1' | 'decision-gate-2';
  kind: 'yes' | 'no';
  label: string;
  tone: EdgeTone;
  targetIds: TopologyNodeId[];
}

export type PhaseLaneId = 'a' | 'b' | 'c' | 'd-learn' | 'd';

export interface PhaseLane {
  id: PhaseLaneId;
  phase: TopologyPhaseId;
  name: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  nodeIds: TopologyEndpointId[];
}

export type PortSide = 'top' | 'bottom' | 'left' | 'right';

export type LaneId = 'L1' | 'L2' | 'L3' | 'R1' | 'R2' | 'R3';

export interface WaypointRoute {
  fromPort: PortSide;
  toPort: PortSide;
  lane?: LaneId;
}

export interface NodeLayout {
  container: TopologyWindowId | 'bridge';
  layer: TopologyLayerId | 'conduit';
  row: number;
  col: number;
}

export interface TopologyNodeState {
  id: TopologyNodeId;
  status: TopologyNodeStatus;
  badgeText?: string;
  summary: string;
  isInferred: boolean;
  details: Record<string, string | number | boolean | null | undefined>;
}

export interface TopologyLayerDefinition {
  id: TopologyLayerId;
  tag: string;
  name: string;
  subtitle: string;
  description: string;
  badgeColor: string;
  badgeHex: string;
  window: TopologyWindowId;
  nodeIds: TopologyNodeId[];
}

export interface TopologyPhaseDefinition {
  id: TopologyPhaseId;
  letter: 'A' | 'B' | 'C' | 'D' | '1' | '2' | '3' | '4' | '5' | string;
  name: string;
  vietnameseName: string;
  description: string;
  lampColor: 'red' | 'yellow' | 'blue' | 'green' | string;
  lampHex: string;
  window?: TopologyWindowId;
  nodeIds?: TopologyNodeId[];
}

export interface TopologyPhaseState {
  id: TopologyPhaseId;
  status: 'idle' | 'active' | 'completed' | 'error';
  activeNodeCount: number;
  completedNodeCount: number;
  totalNodeCount: number;
}
