// Contract tests for the redesigned System Topology data model (Issue #254 / TKT-063, AC-TOP-25, AC-TOP-31).
import { describe, it, expect } from 'vitest';
import {
  TOPOLOGY_EDGES,
  TOPOLOGY_GATE_BLOCKS,
  TOPOLOGY_NODES,
  TOPOLOGY_NODE_LAYOUT,
  TOPOLOGY_PHASE_LANES,
  TOPOLOGY_ROUTES,
  TOPOLOGY_SCENARIOS,
  deriveEdgeStates,
  deriveGateBlockStatus,
  deriveNodeStates,
  derivePhaseLaneStatuses,
  derivePhaseStepperInfo,
  getEdgeId,
} from '../topology';
import type { TopologyScenarioId } from '../../types';

/** Exact 37-edge contract from wireframe §5.1c (`from>to`, mock `node-` prefix stripped). */
const EXPECTED_EDGES: string[] = [
  'floor-cameras>edge-gemma',
  'floor-mics>edge-gemma',
  'floor-machines>edge-bridge',
  'floor-sensors>edge-bridge',
  'floor-tags>pubsub-cross-bridge',
  'edge-bridge>edge-gemma',
  'edge-gemma>pubsub-cross-bridge',
  'edge-bridge>pubsub-cross-bridge',
  'pubsub-cross-bridge>gcp-pubsub',
  'gcp-pubsub>gcp-bigquery',
  'gcp-pubsub>adk-orch',
  'gcp-firestore>adk-orch',
  'adk-orch>gcp-rag',
  'adk-orch>agent-qa',
  'agent-qa>agent-tra',
  'agent-tra>agent-pa',
  'agent-pa>agent-rca',
  'agent-rca>decision-gate-1',
  'decision-gate-1>gate1-yes',
  'decision-gate-1>gate1-no',
  'gate1-no>technician-photo',
  'technician-photo>diagnostic-agent',
  'diagnostic-agent>agent-rca',
  'gate1-yes>copilot-live',
  'gate1-yes>agent-scribe',
  'copilot-live>human-tech',
  'human-tech>verify-camera',
  'verify-camera>decision-gate-2',
  'decision-gate-2>gate2-no',
  'decision-gate-2>gate2-yes',
  'gate2-no>streak-reset',
  'streak-reset>agent-tra',
  'gate2-yes>agent-learn',
  'agent-learn>gcp-bigquery',
  'gate2-yes>human-lead',
  'human-lead>output-docs',
  'gcp-firestore>human-dash',
];

const INGEST = [
  'floor-cameras>edge-gemma',
  'floor-mics>edge-gemma',
  'floor-machines>edge-bridge',
  'floor-sensors>edge-bridge',
  'floor-tags>pubsub-cross-bridge',
  'edge-bridge>edge-gemma',
  'edge-gemma>pubsub-cross-bridge',
  'edge-bridge>pubsub-cross-bridge',
  'pubsub-cross-bridge>gcp-pubsub',
  'gcp-pubsub>gcp-bigquery',
  'gcp-pubsub>adk-orch',
  'gcp-firestore>adk-orch',
  'adk-orch>agent-qa',
];
const TRACE = [
  'agent-qa>agent-tra',
  'agent-tra>agent-pa',
  'agent-pa>agent-rca',
  'agent-rca>decision-gate-1',
];
const REPAIR = [
  'decision-gate-1>gate1-yes',
  'gate1-yes>copilot-live',
  'gate1-yes>agent-scribe',
  'copilot-live>human-tech',
  'human-tech>verify-camera',
];
const EVIDENCE = [
  'decision-gate-1>gate1-no',
  'gate1-no>technician-photo',
  'technician-photo>diagnostic-agent',
  'diagnostic-agent>agent-rca',
];
const RESET = ['decision-gate-2>gate2-no', 'gate2-no>streak-reset', 'streak-reset>agent-tra'];
const CLOSE = [
  'verify-camera>decision-gate-2',
  'decision-gate-2>gate2-yes',
  'gate2-yes>agent-learn',
  'agent-learn>gcp-bigquery',
  'adk-orch>gcp-rag',
  'gate2-yes>human-lead',
  'human-lead>output-docs',
  'gcp-firestore>human-dash',
];

const edgeIds = (): string[] => TOPOLOGY_EDGES.map((e) => getEdgeId(e));

function statesOf(scenario: TopologyScenarioId, state: string): string[] {
  const map = deriveEdgeStates(scenario);
  return Object.keys(map)
    .filter((id) => map[id] === state)
    .sort();
}

describe('Topology edges (AC-TOP-31)', () => {
  it('defines exactly the 37 edges of the wireframe, no legacy edges', () => {
    expect(TOPOLOGY_EDGES).toHaveLength(37);
    expect([...edgeIds()].sort()).toEqual([...EXPECTED_EDGES].sort());
  });

  it('has unique, deterministic ids and a stable getEdgeId', () => {
    const ids = edgeIds();
    expect(new Set(ids).size).toBe(37);
    expect(getEdgeId({ from: 'agent-qa', to: 'agent-tra' })).toBe('agent-qa>agent-tra');
  });

  it('drops legacy alias nodes and edges', () => {
    const ids = new Set<string>(TOPOLOGY_NODES.map((n) => n.id));
    for (const legacy of ['cloud-ingest', 'gatekeeper-qa', 'human-approval']) {
      expect(ids.has(legacy)).toBe(false);
    }
    expect(TOPOLOGY_EDGES.some((e) => e.from === 'copilot-live' && e.to === 'floor-machines')).toBe(false);
    expect(TOPOLOGY_EDGES.every((e) => e.type === undefined || typeof e.type === 'string')).toBe(true);
  });

  it('marks only Firestore↔Orchestrator and Copilot↔Technician as bidirectional', () => {
    const bidir = TOPOLOGY_EDGES.filter((e) => e.bidirectional).map((e) => getEdgeId(e)).sort();
    expect(bidir).toEqual(['copilot-live>human-tech', 'gcp-firestore>adk-orch']);
  });

  it('maps tone: 6 yes, 4 warning, 3 danger, everything else neutral', () => {
    const byTone = (tone: string): string[] =>
      TOPOLOGY_EDGES.filter((e) => e.tone === tone).map((e) => getEdgeId(e)).sort();
    expect(byTone('yes')).toEqual(
      [
        'decision-gate-1>gate1-yes',
        'gate1-yes>copilot-live',
        'gate1-yes>agent-scribe',
        'decision-gate-2>gate2-yes',
        'gate2-yes>human-lead',
        'gate2-yes>agent-learn',
      ].sort(),
    );
    expect(byTone('warning')).toEqual([...EVIDENCE].sort());
    expect(byTone('danger')).toEqual([...RESET].sort());
    expect(TOPOLOGY_EDGES.filter((e) => (e.tone ?? 'neutral') === 'neutral')).toHaveLength(24);
  });

  it('every edge endpoint resolves to a node, gate block or the Pub/Sub conduit', () => {
    const known = new Set<string>([
      ...TOPOLOGY_NODES.map((n) => n.id),
      ...TOPOLOGY_GATE_BLOCKS.map((b) => b.id),
      'pubsub-cross-bridge',
    ]);
    for (const e of TOPOLOGY_EDGES) {
      expect(known.has(e.from), `unknown from: ${e.from}`).toBe(true);
      expect(known.has(e.to), `unknown to: ${e.to}`).toBe(true);
    }
  });
});

describe('Topology nodes & gate blocks', () => {
  it('has 30 nodes (28 components + 2 gates) with unique ids and a window', () => {
    expect(TOPOLOGY_NODES).toHaveLength(30);
    expect(new Set(TOPOLOGY_NODES.map((n) => n.id)).size).toBe(30);
    expect(TOPOLOGY_NODES.filter((n) => n.isDecisionGate).map((n) => n.id).sort()).toEqual([
      'decision-gate-1',
      'decision-gate-2',
    ]);
    expect(TOPOLOGY_NODES.every((n) => n.window === 'window-1' || n.window === 'window-2')).toBe(true);
  });

  it('defines the 4 gate condition blocks with targets and tones', () => {
    expect(TOPOLOGY_GATE_BLOCKS.map((b) => b.id).sort()).toEqual(['gate1-no', 'gate1-yes', 'gate2-no', 'gate2-yes']);
    const get = (id: string) => TOPOLOGY_GATE_BLOCKS.find((b) => b.id === id)!;
    expect(get('gate1-yes')).toMatchObject({ gateId: 'decision-gate-1', kind: 'yes', tone: 'yes' });
    expect(get('gate1-yes').label).toContain('0.70');
    expect(get('gate1-no')).toMatchObject({ gateId: 'decision-gate-1', kind: 'no', tone: 'warning' });
    expect(get('gate2-yes')).toMatchObject({ gateId: 'decision-gate-2', kind: 'yes', tone: 'yes' });
    expect(get('gate2-yes').label).toContain('50');
    expect(get('gate2-no')).toMatchObject({ gateId: 'decision-gate-2', kind: 'no', tone: 'danger' });
  });
});

describe('Phase lanes (AC-TOP-26 / §5.3)', () => {
  it('defines zones A, B, C, D-learn and D in flow order', () => {
    expect(TOPOLOGY_PHASE_LANES.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd-learn', 'd']);
    const byId = (id: string) => TOPOLOGY_PHASE_LANES.find((l) => l.id === id)!;
    expect(byId('a').nodeIds).toEqual(['agent-qa']);
    expect(byId('b').nodeIds).toEqual(
      expect.arrayContaining([
        'agent-tra',
        'agent-pa',
        'agent-rca',
        'decision-gate-1',
        'gate1-yes',
        'gate1-no',
        'diagnostic-agent',
        'technician-photo',
      ]),
    );
    expect(byId('c').nodeIds.sort()).toEqual(['agent-scribe', 'copilot-live']);
    expect(byId('d-learn').nodeIds).toEqual(['agent-learn']);
    expect(byId('d').nodeIds).toEqual(
      expect.arrayContaining(['human-tech', 'verify-camera', 'decision-gate-2', 'streak-reset', 'human-lead', 'output-docs']),
    );
  });

  it('assigns each lane its tone token and never lists a node twice', () => {
    const tones = Object.fromEntries(TOPOLOGY_PHASE_LANES.map((l) => [l.id, l.tone]));
    expect(tones).toEqual({ a: 'danger', b: 'warning', c: 'info', 'd-learn': 'success', d: 'success' });
    const all = TOPOLOGY_PHASE_LANES.flatMap((l) => l.nodeIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('Node layout & routes', () => {
  it('has a unique logical grid slot for every node, gate block and the conduit', () => {
    const ids = [...TOPOLOGY_NODES.map((n) => n.id), ...TOPOLOGY_GATE_BLOCKS.map((b) => b.id), 'pubsub-cross-bridge'];
    for (const id of ids) expect(TOPOLOGY_NODE_LAYOUT[id], `layout for ${id}`).toBeDefined();
    const slots = ids.map((id) => {
      const l = TOPOLOGY_NODE_LAYOUT[id];
      return `${l.container}/${l.layer}/${l.row}/${l.col}`;
    });
    expect(new Set(slots).size).toBe(ids.length);
  });

  it('puts Gate 1 YES left of NO and mirrors Gate 2 (NO left of YES)', () => {
    const col = (id: string): number => TOPOLOGY_NODE_LAYOUT[id].col;
    expect(col('gate1-yes')).toBeLessThan(col('gate1-no'));
    expect(col('gate2-no')).toBeLessThan(col('gate2-yes'));
  });

  it('has one route per edge, with ports and the documented side lanes', () => {
    expect(Object.keys(TOPOLOGY_ROUTES).sort()).toEqual([...EXPECTED_EDGES].sort());
    for (const route of Object.values(TOPOLOGY_ROUTES)) {
      expect(['top', 'bottom', 'left', 'right']).toContain(route.fromPort);
      expect(['top', 'bottom', 'left', 'right']).toContain(route.toPort);
    }
    const lane = (id: string) => TOPOLOGY_ROUTES[id].lane;
    expect(lane('floor-cameras>edge-gemma')).toBe('L2');
    expect(lane('floor-mics>edge-gemma')).toBe('L1');
    expect(lane('floor-tags>pubsub-cross-bridge')).toBe('R1');
    expect(lane('adk-orch>gcp-rag')).toBe('L1');
    expect(lane('copilot-live>human-tech')).toBe('L1');
    expect(lane('streak-reset>agent-tra')).toBe('L2');
    expect(lane('gcp-firestore>human-dash')).toBe('L3');
    expect(lane('diagnostic-agent>agent-rca')).toBe('R1');
    expect(lane('gate2-yes>agent-learn')).toBe('R1');
    expect(lane('agent-learn>gcp-bigquery')).toBe('R2');
  });

  it('uses the left/right port for side-lane routes', () => {
    for (const route of Object.values(TOPOLOGY_ROUTES)) {
      if (route.lane?.startsWith('L')) expect(route.fromPort).toBe('left');
      if (route.lane?.startsWith('R')) expect(route.fromPort).toBe('right');
    }
  });
});

describe('deriveEdgeStates scenario maps (AC-TOP-25)', () => {
  it('covers the 6 scenarios and returns a state for every edge', () => {
    expect(TOPOLOGY_SCENARIOS).toHaveLength(6);
    for (const s of TOPOLOGY_SCENARIOS) {
      const map = deriveEdgeStates(s.id);
      expect(Object.keys(map).sort()).toEqual([...EXPECTED_EDGES].sort());
    }
  });

  it('nominal: every edge idle', () => {
    expect(statesOf('nominal', 'idle')).toHaveLength(37);
  });

  it('detecting: ingest edges active, rest idle', () => {
    expect(statesOf('detecting', 'active')).toEqual([...INGEST].sort());
    expect(statesOf('detecting', 'idle')).toHaveLength(37 - INGEST.length);
  });

  it('low_confidence: ingest+trace completed, evidence loop warning then active', () => {
    expect(statesOf('low_confidence', 'completed')).toEqual([...INGEST, ...TRACE].sort());
    expect(statesOf('low_confidence', 'warning')).toEqual(EVIDENCE.slice(0, 2).sort());
    expect(statesOf('low_confidence', 'active')).toEqual(EVIDENCE.slice(2).sort());
  });

  it('streak_verifying: repair completed, Gate 2 feed and board active', () => {
    expect(statesOf('streak_verifying', 'completed')).toEqual([...INGEST, ...TRACE, ...REPAIR].sort());
    expect(statesOf('streak_verifying', 'active')).toEqual(
      ['gcp-firestore>human-dash', 'verify-camera>decision-gate-2'].sort(),
    );
  });

  it('streak_reset: reset loop danger, no active edges', () => {
    expect(statesOf('streak_reset', 'danger')).toEqual([...RESET].sort());
    expect(statesOf('streak_reset', 'active')).toEqual([]);
    expect(statesOf('streak_reset', 'completed')).toHaveLength(INGEST.length + TRACE.length + REPAIR.length + 2);
  });

  it('approved: 30 completed edges and no warning/danger/active edge', () => {
    expect(statesOf('approved', 'completed')).toEqual([...INGEST, ...TRACE, ...REPAIR, ...CLOSE].sort());
    for (const s of ['warning', 'danger', 'active']) expect(statesOf('approved', s)).toEqual([]);
  });

  it('is pure: same input returns equal output without mutating the model', () => {
    const before = JSON.stringify(TOPOLOGY_EDGES);
    expect(deriveEdgeStates('approved')).toEqual(deriveEdgeStates('approved'));
    expect(JSON.stringify(TOPOLOGY_EDGES)).toBe(before);
  });
});

describe('derivePhaseLaneStatuses (AC-TOP-23, #256)', () => {
  it('returns a status for every lane id and agrees with the Tier-1 stepper bar', () => {
    for (const scenario of TOPOLOGY_SCENARIOS.map((s) => s.id)) {
      const steps = derivePhaseStepperInfo(null, scenario);
      const lanes = derivePhaseLaneStatuses(null, scenario);

      expect(Object.keys(lanes).sort()).toEqual(['a', 'b', 'c', 'd', 'd-learn'].sort());
      expect(lanes.a).toBe(steps.find((s) => s.phaseId === 'phase-a')!.status);
      expect(lanes.b).toBe(steps.find((s) => s.phaseId === 'phase-b')!.status);
      expect(lanes.c).toBe(steps.find((s) => s.phaseId === 'phase-c')!.status);
    }
  });

  it('mirrors Phase D status onto both the d-learn and d lanes', () => {
    const lanes = derivePhaseLaneStatuses(null, 'approved');
    const steps = derivePhaseStepperInfo(null, 'approved');
    const stepD = steps.find((s) => s.phaseId === 'phase-d')!.status;

    expect(lanes.d).toBe(stepD);
    expect(lanes['d-learn']).toBe(stepD);
    expect(stepD).toBe('completed');
  });

  it('flags Phase B as warning when confidence is low', () => {
    const lanes = derivePhaseLaneStatuses(null, 'low_confidence');
    expect(lanes.b).toBe('warning');
  });

  it('flags Phase D as danger when a defect resets the verification streak', () => {
    const lanes = derivePhaseLaneStatuses(null, 'streak_reset');
    expect(lanes.d).toBe('danger');
    expect(lanes['d-learn']).toBe('danger');
  });
});

describe('deriveGateBlockStatus (AC-TOP-26, #256)', () => {
  const gate1Yes = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate1-yes')!;
  const gate1No = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate1-no')!;
  const gate2Yes = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate2-yes')!;
  const gate2No = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate2-no')!;

  it('is idle when none of its target nodes have fired', () => {
    const nodeStates = deriveNodeStates(null, 'nominal');
    expect(deriveGateBlockStatus(gate1Yes, nodeStates)).toBe('idle');
    expect(deriveGateBlockStatus(gate1No, nodeStates)).toBe('idle');
  });

  it('is active for the branch whose target nodes are currently executing', () => {
    const nodeStates = deriveNodeStates(null, 'low_confidence');
    expect(deriveGateBlockStatus(gate1No, nodeStates)).toBe('active');
    expect(deriveGateBlockStatus(gate1Yes, nodeStates)).not.toBe('active');
  });

  it('is taken for the branch whose target nodes already completed', () => {
    const nodeStates = deriveNodeStates(null, 'approved');
    expect(deriveGateBlockStatus(gate2Yes, nodeStates)).toBe('taken');
  });

  it('flags the reset branch active while the streak gate is rejecting a defect', () => {
    const nodeStates = deriveNodeStates(null, 'streak_reset');
    expect(deriveGateBlockStatus(gate2No, nodeStates)).toBe('active');
  });
});
