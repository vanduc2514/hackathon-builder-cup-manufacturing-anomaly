import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SystemTopologyView from '../../views/SystemTopologyView';
import {
  TOPOLOGY_EDGES,
  TOPOLOGY_LAYERS,
  TOPOLOGY_NODES,
  TOPOLOGY_PHASES,
  TOPOLOGY_SCENARIOS,
  deriveNodeStates,
  deriveActivePhase,
  getWindow1Nodes,
  getWindow2Nodes,
} from '../../../lib/topology';
import type { IncidentState } from '../../../types';

const mockIncident: IncidentState = {
  incident_id: 'inc-topo-01',
  status: 'investigating',
  status_reason: 'Tool wear anomaly detected on CNC-02',
  defect_type: 'tool_wear',
  defect_rate: 0.08,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Chipped cutting edge on insert #3',
  verification_count: 24,
  verification_target: 50,
  approved: false,
  findings: [
    {
      agent_id: 'agent-qa',
      agent_name: 'Quality Inspector',
      phase: 'Detection',
      finding: 'SPC defect rate 8.0% exceeds UCL 3.0%',
      evidence: 'High defect rate on exit conveyor camera feed',
      citation: 'SPC-Rule-1.1',
      timestamp: new Date().toISOString(),
      confidence: 0.94,
    },
  ],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('System Topology 5-Layer Workflow (Issue #211 / TKT-045)', () => {
  it('validates architecture constants and catalogs', () => {
    expect(TOPOLOGY_LAYERS).toHaveLength(5);
    expect(TOPOLOGY_SCENARIOS).toHaveLength(6);
    expect(TOPOLOGY_NODES.length).toBeGreaterThanOrEqual(28);

    const layerIds = TOPOLOGY_LAYERS.map((l) => l.id);
    expect(layerIds).toEqual(['layer-1', 'layer-2', 'layer-3', 'layer-4', 'layer-5']);

    // Ensure key decision gates exist
    const gate1 = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-1');
    const gate2 = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-2');
    expect(gate1).toBeDefined();
    expect(gate1?.isDecisionGate).toBe(true);
    expect(gate2).toBeDefined();
    expect(gate2?.isDecisionGate).toBe(true);
  });

  it('renders all 5 architecture layers and key components in SystemTopologyView', () => {
    render(<SystemTopologyView incident={mockIncident} />);

    // Header info
    expect(screen.getByText(/System Architecture & Execution Graph/i)).toBeDefined();
    expect(screen.getByText(/28 Nodes · 5 Layers · Google ADK Swarm/i)).toBeDefined();

    // 5 Layer titles
    expect(screen.getByText(/Layer 1: Factory Floor · Edge Data Sources/i)).toBeDefined();
    expect(screen.getByText(/Layer 2: On-Premises Gateway · Gemma Edge & Bridge/i)).toBeDefined();
    expect(screen.getByText(/Layer 3: Google Cloud · Data & AI Platform/i)).toBeDefined();
    expect(screen.getByText(/Layer 4: Agent Team · Google ADK Multi-Agent System/i)).toBeDefined();
    expect(screen.getByText(/Layer 5: Human-in-the-Loop & Operational Outputs/i)).toBeDefined();

    // Decision gates
    expect(screen.getByText(/Decision Gate 1: Confidence/i)).toBeDefined();
    expect(screen.getByText(/Verification Gate \(Invariant #3\): Streak/i)).toBeDefined();
  });

  it('opens side drawer when a node card is clicked and displays production UI reference', () => {
    const handleNavigateTab = vi.fn();
    render(<SystemTopologyView incident={mockIncident} onNavigateToTab={handleNavigateTab} />);

    // Click on Floor Machines node
    const machinesNode = screen.getByRole('button', { name: /CNC \/ Injection/i });
    fireEvent.click(machinesNode);

    // Side drawer opens with specs
    expect(screen.getByText(/Production UI Surface Reference/i)).toBeDefined();
    expect(screen.getByText(/CNC Fleet Grid/i)).toBeDefined();
    expect(screen.getByText(/Inspect Line 1 Fleet Table/i)).toBeDefined();

    // Test UI Reference navigation CTA
    const ctaButton = screen.getByText(/Inspect Line 1 Fleet Table/i);
    fireEvent.click(ctaButton);
    expect(handleNavigateTab).toHaveBeenCalledWith('overview');
  });

  it('switches simulation scenarios and updates state', () => {
    const handleNotify = vi.fn();
    render(<SystemTopologyView incident={mockIncident} onNotify={handleNotify} />);

    const scenarioSelect = screen.getByLabelText(/Simulation Scenario/i) as HTMLSelectElement;
    expect(scenarioSelect).toBeDefined();

    // Switch to Scenario 5: Streak Defect Break (Reset to 0)
    fireEvent.change(scenarioSelect, { target: { value: 'streak_reset' } });

    expect(handleNotify).toHaveBeenCalled();
    expect(screen.getByText(/Active Mode: 5. Streak Defect Break/i)).toBeDefined();
  });

  it('derives scenario-specific node states accurately', () => {
    const lowConfStates = deriveNodeStates(mockIncident, 'low_confidence');
    expect(lowConfStates['decision-gate-1'].status).toBe('warning');
    expect(lowConfStates['diagnostic-agent'].status).toBe('active');

    const resetStates = deriveNodeStates(mockIncident, 'streak_reset');
    expect(resetStates['decision-gate-2'].status).toBe('danger');
    expect(resetStates['streak-reset'].status).toBe('danger');

    const approvedStates = deriveNodeStates(mockIncident, 'approved');
    expect(approvedStates['human-lead'].status).toBe('done');
    expect(approvedStates['output-docs'].status).toBe('done');
  });
  it('verifies two-window partitioning in layers, nodes, and accessors (TKT-051 #226)', () => {
    // Layer window assignments
    const l1 = TOPOLOGY_LAYERS.find((l) => l.id === 'layer-1');
    const l2 = TOPOLOGY_LAYERS.find((l) => l.id === 'layer-2');
    const l3 = TOPOLOGY_LAYERS.find((l) => l.id === 'layer-3');
    const l4 = TOPOLOGY_LAYERS.find((l) => l.id === 'layer-4');
    const l5 = TOPOLOGY_LAYERS.find((l) => l.id === 'layer-5');

    expect(l1?.window).toBe('window-1');
    expect(l2?.window).toBe('window-1');
    expect(l3?.window).toBe('window-2');
    expect(l4?.window).toBe('window-2');
    expect(l5?.window).toBe('window-2');

    // Accessor tests
    const window1Nodes = getWindow1Nodes();
    const window2Nodes = getWindow2Nodes();

    expect(window1Nodes).toHaveLength(7);
    const window1Ids = window1Nodes.map((n) => n.id);
    expect(window1Ids).toEqual([
      'floor-machines',
      'floor-cameras',
      'floor-sensors',
      'floor-mics',
      'floor-tags',
      'edge-gemma',
      'edge-bridge',
    ]);

    expect(window2Nodes.length).toBeGreaterThanOrEqual(21);
    expect(window2Nodes.every((n) => n.window === 'window-2')).toBe(true);

    // All active nodes must have a window
    expect(TOPOLOGY_NODES.every((n) => n.window === 'window-1' || n.window === 'window-2')).toBe(true);
  });

  it('validates Phase A-D enriched metadata and node mappings (TKT-051 #226)', () => {
    expect(TOPOLOGY_PHASES).toHaveLength(4);
    const [phaseA, phaseB, phaseC, phaseD] = TOPOLOGY_PHASES;

    expect(phaseA.id).toBe('phase-a');
    expect(phaseA.letter).toBe('A');
    expect(phaseA.window).toBe('window-1');
    expect(phaseA.nodeIds).toEqual([
      'floor-machines',
      'floor-cameras',
      'floor-sensors',
      'floor-mics',
      'floor-tags',
      'edge-gemma',
      'edge-bridge',
      'gcp-pubsub',
      'agent-qa',
    ]);

    expect(phaseB.id).toBe('phase-b');
    expect(phaseB.letter).toBe('B');
    expect(phaseB.window).toBe('window-2');
    expect(phaseB.nodeIds).toEqual([
      'gcp-bigquery',
      'agent-tra',
      'agent-pa',
      'agent-rca',
      'decision-gate-1',
      'diagnostic-agent',
      'technician-photo',
    ]);

    expect(phaseC.id).toBe('phase-c');
    expect(phaseC.letter).toBe('C');
    expect(phaseC.window).toBe('window-2');
    expect(phaseC.nodeIds).toEqual([
      'copilot-live',
      'human-tech',
      'verify-camera',
      'decision-gate-2',
      'streak-reset',
    ]);

    expect(phaseD.id).toBe('phase-d');
    expect(phaseD.letter).toBe('D');
    expect(phaseD.window).toBe('window-2');
    expect(phaseD.nodeIds).toEqual([
      'human-lead',
      'human-dash',
      'agent-scribe',
      'agent-learn',
      'output-docs',
    ]);
  });

  it('evaluates deriveActivePhase across scenarios and incident lifecycle states (TKT-051 #226)', () => {
    // Scenario overrides
    expect(deriveActivePhase(null, 'nominal')).toBe('phase-a');
    expect(deriveActivePhase(null, 'detecting')).toBe('phase-a');
    expect(deriveActivePhase(null, 'low_confidence')).toBe('phase-b');
    expect(deriveActivePhase(null, 'streak_verifying')).toBe('phase-c');
    expect(deriveActivePhase(null, 'streak_reset')).toBe('phase-c');
    expect(deriveActivePhase(null, 'approved')).toBe('phase-d');

    // Incident lifecycle states
    expect(deriveActivePhase(null)).toBe('phase-a');
    expect(deriveActivePhase({ ...mockIncident, status: 'normal' })).toBe('phase-a');
    expect(deriveActivePhase({ ...mockIncident, status: 'detecting' })).toBe('phase-a');
    expect(deriveActivePhase({ ...mockIncident, status: 'tracing' })).toBe('phase-b');
    expect(deriveActivePhase({ ...mockIncident, status: 'investigating' })).toBe('phase-b');
    expect(deriveActivePhase({ ...mockIncident, status: 'analyzing' })).toBe('phase-b');
    expect(deriveActivePhase({ ...mockIncident, status: 'awaiting_evidence' })).toBe('phase-b');
    expect(deriveActivePhase({ ...mockIncident, status: 'repairing' })).toBe('phase-c');
    expect(deriveActivePhase({ ...mockIncident, status: 'verifying' })).toBe('phase-c');
    expect(deriveActivePhase({ ...mockIncident, status: 'closed' })).toBe('phase-d');
    expect(deriveActivePhase({ ...mockIncident, status: 'dismissed' })).toBe('phase-d');

    // Escalated state
    expect(
      deriveActivePhase({
        ...mockIncident,
        status: 'escalated',
        repair_done: true,
        verification_count: 0,
      }),
    ).toBe('phase-c');
  });

  it('validates recovery-handshake and gate-2-to-esg architectural edges (TKT-051 #226)', () => {
    const handshakeEdge = TOPOLOGY_EDGES.find((e) => e.id === 'recovery-handshake');
    expect(handshakeEdge).toBeDefined();
    expect(handshakeEdge?.from).toBe('copilot-live');
    expect(handshakeEdge?.to).toBe('floor-machines');
    expect(handshakeEdge?.type).toBe('loopback-long');
    expect(handshakeEdge?.label).toContain('Clear Interlock & Resume Feed');
    expect(handshakeEdge?.activeScenarios).toEqual(['streak_verifying', 'approved']);

    const esgEdge = TOPOLOGY_EDGES.find((e) => e.id === 'gate-2-to-esg');
    expect(esgEdge).toBeDefined();
    expect(esgEdge?.from).toBe('decision-gate-2');
    expect(esgEdge?.to).toBe('agent-learn');
    expect(esgEdge?.type).toBe('branch-right');
    expect(esgEdge?.label).toContain('50/50 Streak Verified');
    expect(esgEdge?.activeScenarios).toEqual(['approved']);
  });
});
