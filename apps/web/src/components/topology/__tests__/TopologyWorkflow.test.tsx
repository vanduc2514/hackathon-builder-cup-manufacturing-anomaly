// Unit tests for the 5-Layer Industrial Architecture & Topology Decision Gates (Issue #211).
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TOPOLOGY_LAYERS,
  TOPOLOGY_NODES,
  TOPOLOGY_SCENARIOS,
  deriveLayerStates,
  deriveNodeStates,
} from '../../../lib/topology';
import TopologyDecisionGate from '../TopologyDecisionGate';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

describe('Topology Architecture Library (lib/topology.ts)', () => {
  it('defines 5 industrial architecture layers matching kaizen-agent-architecture.mmd', () => {
    expect(TOPOLOGY_LAYERS).toHaveLength(5);
    const layerIds = TOPOLOGY_LAYERS.map((l) => l.id);
    expect(layerIds).toEqual(['layer-1', 'layer-2', 'layer-3', 'layer-4', 'layer-5']);
    for (const l of TOPOLOGY_LAYERS) {
      expect(l.name).toBeDefined();
      expect(l.subtitle).toBeDefined();
      expect(l.badgeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('contains all 28 nodes and decision gates across the 5 layers', () => {
    expect(TOPOLOGY_NODES.length).toBeGreaterThanOrEqual(28);

    // Verify key decision gates exist
    const gate1 = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-1');
    const gate2 = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-2');

    expect(gate1).toBeDefined();
    expect(gate1?.isGate).toBe(true);
    expect(gate1?.sublabel).toContain('0.70');

    expect(gate2).toBeDefined();
    expect(gate2?.isGate).toBe(true);
    expect(gate2?.sublabel).toContain('50');

    // Verify diagnostic loop node
    const diagNode = TOPOLOGY_NODES.find((n) => n.id === 'diagnostic-agent');
    expect(diagNode).toBeDefined();
    expect(diagNode?.channel).toBe('blackboard.diagnostic.evidence_request');
  });

  it('provides 5 interactive demonstration scenarios with valid configurations', () => {
    expect(TOPOLOGY_SCENARIOS).toHaveLength(5);
    const scenarioIds = TOPOLOGY_SCENARIOS.map((s) => s.id);
    expect(scenarioIds).toEqual([
      'baseline_idle',
      'phase_a_breach',
      'phase_b_rca',
      'phase_c_repair',
      'phase_d_closed',
    ]);

    // Baseline idle represents normal production without incident
    const baseline = TOPOLOGY_SCENARIOS.find((s) => s.id === 'baseline_idle')!;
    expect(baseline.mockIncident).toBeNull();

    // Incident scenarios have valid IncidentState objects
    const incidentScenarios = TOPOLOGY_SCENARIOS.filter((s) => s.id !== 'baseline_idle');
    for (const sc of incidentScenarios) {
      expect(sc.mockIncident).not.toBeNull();
      expect(sc.mockIncident?.incident_id).toBeTruthy();
      expect(sc.mockIncident?.status).toBeDefined();
    }
  });

  it('derives correct layer statuses from node states', () => {
    const idleStates = deriveNodeStates(null);
    const layerStates = deriveLayerStates(idleStates);

    expect(layerStates['layer-1'].status).toBe('idle');
    expect(layerStates['layer-2'].status).toBe('idle');
    expect(layerStates['layer-3'].status).toBe('idle');
    expect(layerStates['layer-4'].status).toBe('idle');
    expect(layerStates['layer-5'].status).toBe('idle');

    // With active incident in Phase A breach
    const breachScenario = TOPOLOGY_SCENARIOS.find((s) => s.id === 'phase_a_breach')!;
    const breachNodeStates = deriveNodeStates(breachScenario.mockIncident);
    const breachLayerStates = deriveLayerStates(breachNodeStates);

    expect(['active', 'completed']).toContain(breachLayerStates['layer-1'].status);
    expect(['active', 'completed']).toContain(breachLayerStates['layer-2'].status);
  });
});

describe('TopologyDecisionGate Component', () => {
  const mockConfidenceGate: TopologyNodeDefinition = TOPOLOGY_NODES.find(
    (n) => n.id === 'decision-gate-1',
  )!;

  const mockGateState: TopologyNodeState = {
    id: 'decision-gate-1',
    status: 'active',
    summary: 'Evaluating causal certainty',
    isInferred: false,
    details: {},
  };

  it('renders confidence gate branch labels correctly', () => {
    let selected = false;
    const { container } = render(
      <TopologyDecisionGate
        node={mockConfidenceGate}
        state={mockGateState}
        incident={null}
        selected={false}
        onSelect={() => {
          selected = true;
        }}
      />,
    );

    expect(screen.getByText('Decision Gate 1')).toBeTruthy();
    expect(screen.getByText(/NO \(< 0.70\): Diagnostic Evidence Request/)).toBeTruthy();
    expect(screen.getByText(/YES \(≥ 0.70\): Proceed to Copilot & Scribe/)).toBeTruthy();

    const card = container.querySelector('#decision-gate-1');
    expect(card).toBeTruthy();
    if (card) {
      fireEvent.click(card);
      expect(selected).toBe(true);
    }
  });

  it('renders Invariant #3 verification streak progress for Gate 2', () => {
    const mockVerificationGate: TopologyNodeDefinition = TOPOLOGY_NODES.find(
      (n) => n.id === 'decision-gate-2',
    )!;

    const mockIncidentWithStreak: IncidentState = {
      incident_id: 'inc-999',
      status: 'verifying',
      status_reason: 'Post-repair verification',
      defect_type: 'flank_wear',
      defect_rate: 0.01,
      spc_ucl: 0.03,
      suspect_machine: 'CNC-01',
      suspect_tool: 'TOOL-01',
      root_cause: 'Tool wear',
      verification_count: 42,
      verification_target: 50,
      approved: false,
      findings: [],
      impact: null,
      documents: {},
      updated_at: new Date().toISOString(),
    };

    render(
      <TopologyDecisionGate
        node={mockVerificationGate}
        state={mockGateState}
        incident={mockIncidentWithStreak}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('Verification Gate (Invariant #3)')).toBeTruthy();
    expect(screen.getByText(/42 \/ 50 Clean Parts \(84%\)/)).toBeTruthy();
    expect(screen.getByText(/NO \(Defect Detected\): Reset Streak to 0\/50/)).toBeTruthy();
    expect(screen.getByText(/YES \(Streak ≥ 50\): Certified Clean/)).toBeTruthy();
  });
});
