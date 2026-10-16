import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SystemTopologyView from '../../views/SystemTopologyView';
import { TOPOLOGY_LAYERS, TOPOLOGY_NODES, TOPOLOGY_SCENARIOS, deriveNodeStates } from '../../../lib/topology';
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
});
