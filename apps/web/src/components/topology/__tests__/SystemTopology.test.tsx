import { readFileSync } from 'node:fs';
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
  derivePhaseStepperInfo,
  deriveWindow2State,
  getWindow1Nodes,
  getWindow2Nodes,
} from '../../../lib/topology';
import PhaseStepperBar from '../PhaseStepperBar';
import TopologyCanvas from '../TopologyCanvas';
import TopologyNodeDrawer from '../TopologyNodeDrawer';
import type { IncidentState, TopologyNodeState } from '../../../types';

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

  it('opens side drawer when a node card is clicked and routes the production-UI footer CTA to the right tab', () => {
    const handleNavigateTab = vi.fn();
    render(<SystemTopologyView incident={mockIncident} onNavigateToTab={handleNavigateTab} />);

    // Click on Floor Machines node
    const machinesNode = screen.getByRole('button', { name: /CNC \/ Injection/i });
    fireEvent.click(machinesNode);

    // Issue #259 / TKT-067: the legacy 'Production UI Surface Reference' card is
    // gone; the same CTA now lives in the drawer footer as the single primary
    // button labelled `node.uiRef.ctaLabel` (with arrow_forward icon). We still
    // expect the host view to route through onNavigateToTab on click.
    const ctaButton = document.getElementById('drawer-ui-cta');
    expect(ctaButton).toBeDefined();
    expect(ctaButton?.querySelector('span')?.textContent).toBe('Inspect Line 1 Fleet Table');
    expect(ctaButton?.classList.contains('drawer-cta')).toBe(true);
    expect(ctaButton?.classList.contains('btn-primary')).toBe(true);
    expect(ctaButton?.querySelector('.material-symbols-outlined')?.textContent).toBe('arrow_forward');

    fireEvent.click(ctaButton!);
    expect(handleNavigateTab).toHaveBeenCalledWith('overview');
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

  it('replaces the legacy recovery-handshake/gate-2-to-esg edges with the gate-block contract (#254)', () => {
    const handshakeEdge = TOPOLOGY_EDGES.find((e) => e.from === 'copilot-live' && e.to === 'floor-machines');
    expect(handshakeEdge).toBeUndefined();

    const esgEdge = TOPOLOGY_EDGES.find((e) => e.from === 'decision-gate-2' && e.to === 'agent-learn');
    expect(esgEdge).toBeUndefined();

    const gate2YesToLearn = TOPOLOGY_EDGES.find((e) => e.from === 'gate2-yes' && e.to === 'agent-learn');
    expect(gate2YesToLearn).toBeDefined();
    expect(gate2YesToLearn?.tone).toBe('yes');
  });

  it('derives Tier 1 Glance Phase Stepper Info and Window 2 state across scenarios and incident lifecycle (TKT-052 #227)', () => {
    // Phase Stepper - Scenario states
    const nominalSteps = derivePhaseStepperInfo(null, 'nominal');
    expect(nominalSteps).toHaveLength(4);
    expect(nominalSteps.map((s) => s.status)).toEqual(['idle', 'idle', 'idle', 'idle']);

    const detectingSteps = derivePhaseStepperInfo(null, 'detecting');
    expect(detectingSteps[0].status).toBe('completed');
    expect(detectingSteps[1].status).toBe('active');
    expect(detectingSteps[1].statusText).toBe('RCA Active');

    const lowConfSteps = derivePhaseStepperInfo(null, 'low_confidence');
    expect(lowConfSteps[1].status).toBe('warning');
    expect(lowConfSteps[1].statusText).toBe('Evidence Req');

    const streakVerifyingSteps = derivePhaseStepperInfo(null, 'streak_verifying');
    expect(streakVerifyingSteps[2].status).toBe('completed');
    expect(streakVerifyingSteps[3].status).toBe('active');
    expect(streakVerifyingSteps[3].statusText).toBe('42 / 50');

    const streakResetSteps = derivePhaseStepperInfo(null, 'streak_reset');
    expect(streakResetSteps[3].status).toBe('danger');
    expect(streakResetSteps[3].statusText).toBe('0 / 50 Reset');

    const approvedSteps = derivePhaseStepperInfo(null, 'approved');
    expect(approvedSteps.every((s) => s.status === 'completed')).toBe(true);

    // Live Incident states
    const liveVerifying = derivePhaseStepperInfo({ ...mockIncident, status: 'verifying', verification_count: 35 });
    expect(liveVerifying[3].status).toBe('active');
    expect(liveVerifying[3].statusText).toBe('35 / 50');

    const liveEscalated = derivePhaseStepperInfo({ ...mockIncident, status: 'escalated', verification_count: 0 });
    expect(liveEscalated[3].status).toBe('danger');
    expect(liveEscalated[3].statusText).toBe('0 / 50 Reset');

    // Window 2 States
    expect(deriveWindow2State(null, 'nominal')).toEqual({ pulseClass: '', statusText: 'Nominal' });
    expect(deriveWindow2State(null, 'detecting')).toEqual({ pulseClass: 'calm-pulse-active', statusText: 'RCA In-Flight' });
    expect(deriveWindow2State(null, 'low_confidence')).toEqual({ pulseClass: 'calm-pulse-warning', statusText: 'Diagnostic Loop (<0.70)' });
    expect(deriveWindow2State(null, 'streak_verifying')).toEqual({ pulseClass: 'calm-pulse-active', statusText: 'Verifying Streak (42/50)' });
    expect(deriveWindow2State(null, 'streak_reset')).toEqual({ pulseClass: 'calm-pulse-danger', statusText: 'Defect Alarm (0/50)' });
    expect(deriveWindow2State(null, 'approved')).toEqual({ pulseClass: '', statusText: 'Closed & Certified' });

    expect(deriveWindow2State({ ...mockIncident, status: 'awaiting_evidence' })).toEqual({ pulseClass: 'calm-pulse-warning', statusText: 'Diagnostic Loop (<0.70)' });
    expect(deriveWindow2State({ ...mockIncident, status: 'verifying', verification_count: 35 })).toEqual({ pulseClass: 'calm-pulse-active', statusText: 'Verifying Streak (35/50)' });
    expect(deriveWindow2State({ ...mockIncident, status: 'error' })).toEqual({ pulseClass: 'calm-pulse-danger', statusText: 'Defect Alarm (Reset)' });
  });

  it('renders PhaseStepperBar with 4 steps, status indicators, and handles click navigation (TKT-052 #227)', () => {
    const handleScroll = vi.fn();
    render(<PhaseStepperBar incident={mockIncident} scenario="streak_verifying" onScrollToLayer={handleScroll} />);

    expect(screen.getByRole('navigation', { name: /incident lifecycle phases/i })).toBeDefined();
    const stepper = document.getElementById('phase-stepper-bar');
    expect(stepper).not.toBeNull();

    // 4 Steps present
    const stepA = document.getElementById('step-phase-a');
    const stepB = document.getElementById('step-phase-b');
    const stepC = document.getElementById('step-phase-c');
    const stepD = document.getElementById('step-phase-d');

    expect(stepA).not.toBeNull();
    expect(stepB).not.toBeNull();
    expect(stepC).not.toBeNull();
    expect(stepD).not.toBeNull();

    expect(stepA?.className).toContain('step-completed');
    expect(stepB?.className).toContain('step-completed');
    expect(stepC?.className).toContain('step-completed');
    expect(stepD?.className).toContain('step-active');

    expect(stepD?.textContent).toContain('42 / 50');

    // Click step A navigates to phase-1
    fireEvent.click(stepA!);
    expect(handleScroll).toHaveBeenCalledWith('phase-1');

    // Click step B navigates to phase-3
    fireEvent.click(stepB!);
    expect(handleScroll).toHaveBeenCalledWith('phase-3');

    // Keydown Enter on step C navigates to phase-4
    fireEvent.keyDown(stepC!, { key: 'Enter' });
    expect(handleScroll).toHaveBeenCalledWith('phase-4');
  });

  it('renders Window 1 & 2 containers, Quick-Launch button, and Cross-Window conduit (TKT-052 #227)', () => {
    render(<SystemTopologyView incident={mockIncident} />);

    // 1. Window 1 Container & Header
    const window1Container = document.getElementById('window-1-container');
    expect(window1Container).not.toBeNull();
    expect(window1Container?.className).toContain('window-boundary-card');
    expect(window1Container?.className).toContain('window-1-boundary');
    expect(window1Container?.querySelector('.window-pill')?.getAttribute('aria-label')).toBe('Window 1 · Factory Floor (Edge & On-Premises)');
    expect(window1Container?.textContent).toContain('Factory Floor (Edge & On-Premises)');
    expect(window1Container?.querySelector('.window-badges-row')).toBeNull();

    // Quick-Launch Button
    const quickLaunchBtn = screen.getByRole('link', { name: /factory floor console/i });
    expect(quickLaunchBtn).toBeDefined();
    expect(quickLaunchBtn.getAttribute('href')).toBe('https://kaizen-lab-factory.web.app');
    expect(quickLaunchBtn.getAttribute('target')).toBe('_blank');
    expect(quickLaunchBtn.getAttribute('rel')).toBe('noopener noreferrer');
    expect(quickLaunchBtn.getAttribute('aria-label')).toBe(
      'Open Standalone Factory Floor Console in new tab',
    );
    expect(quickLaunchBtn.className).toContain('btn-quick-launch');

    // Verify Window 1 contains Layer 1 and Layer 2
    const layer1 = document.getElementById('phase-1');
    const layer2 = document.getElementById('phase-2');
    expect(window1Container?.contains(layer1)).toBe(true);
    expect(window1Container?.contains(layer2)).toBe(true);

    // 2. Cross-Window Conduit (Pub/Sub Bridge)
    const crossBridge = document.getElementById('pubsub-cross-bridge');
    expect(crossBridge).not.toBeNull();
    expect(crossBridge?.className).toContain('cross-window-bridge');
    expect(crossBridge?.textContent).toContain('Google Cloud Pub/Sub');
    expect(crossBridge?.textContent).toContain('Cross-Window Event Conduit');
    expect(crossBridge?.textContent).toContain('100 Hz');

    // 3. Window 2 Container & Header
    const window2Container = document.getElementById('window-2-container');
    expect(window2Container).not.toBeNull();
    expect(window2Container?.className).toContain('window-boundary-card');
    expect(window2Container?.className).toContain('window-2-boundary');
    expect(window2Container?.querySelector('.window-pill')?.getAttribute('aria-label')).toBe('Window 2 · Cloud Control Plane (Google Cloud & ADK Swarm)');
    expect(window2Container?.textContent).toContain('Cloud Control Plane (Google Cloud & ADK Swarm)');
    expect(window2Container?.querySelector('.window-badges-row')).toBeNull();

    // Verify Window 2 contains Layer 3, 4, 5
    const layer3 = document.getElementById('phase-3');
    const layer4 = document.getElementById('phase-4');
    const layer5 = document.getElementById('phase-5');
    expect(window2Container?.contains(layer3)).toBe(true);
    expect(window2Container?.contains(layer4)).toBe(true);
    expect(window2Container?.contains(layer5)).toBe(true);
  });

  it('verifies Phase Stepper Bar keyboard navigation with Space/Enter across all steps (TKT-053 #228)', () => {
    const handleScroll = vi.fn();
    render(<PhaseStepperBar incident={mockIncident} scenario="nominal" onScrollToLayer={handleScroll} />);

    const stepA = document.getElementById('step-phase-a');
    const stepB = document.getElementById('step-phase-b');
    const stepC = document.getElementById('step-phase-c');
    const stepD = document.getElementById('step-phase-d');

    // Test Space key on Step A -> phase-1
    fireEvent.keyDown(stepA!, { key: ' ' });
    expect(handleScroll).toHaveBeenCalledWith('phase-1');

    // Test Space key on Step B -> phase-3
    fireEvent.keyDown(stepB!, { key: ' ' });
    expect(handleScroll).toHaveBeenCalledWith('phase-3');

    // Test Enter key on Step C -> phase-4
    fireEvent.keyDown(stepC!, { key: 'Enter' });
    expect(handleScroll).toHaveBeenCalledWith('phase-4');

    // Test Space key on Step D -> phase-5
    fireEvent.keyDown(stepD!, { key: ' ' });
    expect(handleScroll).toHaveBeenCalledWith('phase-5');
  });

  it('verifies SVG path generation and node-state highlighting for the repair and closure flow (TKT-053 #228)', () => {
    const { container } = render(<SystemTopologyView incident={mockIncident} />);

    // SVG container exists
    const svgOverlay = container.querySelector('.topology-svg-overlay');
    expect(svgOverlay).not.toBeNull();

    // Verify the gate-block edges that replaced recovery-handshake/gate-2-to-esg (#254)
    const repairEdge = TOPOLOGY_EDGES.find((e) => e.from === 'gate1-yes' && e.to === 'copilot-live');
    expect(repairEdge).toBeDefined();
    expect(repairEdge?.tone).toBe('yes');

    const closureEdge = TOPOLOGY_EDGES.find((e) => e.from === 'gate2-yes' && e.to === 'agent-learn');
    expect(closureEdge).toBeDefined();
    expect(closureEdge?.tone).toBe('yes');

    // Check node states for streak_verifying: copilot-live and floor-machines
    const streakStates = deriveNodeStates(mockIncident, 'streak_verifying');
    expect(streakStates['copilot-live'].status).toBe('done');
    expect(streakStates['decision-gate-2'].status).toBe('active');

    // Check node states for approved: decision-gate-2 and agent-learn
    const approvedStates = deriveNodeStates(mockIncident, 'approved');
    expect(approvedStates['decision-gate-2'].status).toBe('done');
    expect(approvedStates['agent-learn'].status).toBe('done');
  });

  it('verifies two-window DOM ordering and Quick-Launch link attributes (TKT-053 #228)', () => {
    const { container } = render(<SystemTopologyView incident={mockIncident} />);

    const w1 = container.querySelector('#window-1-container');
    const bridge = container.querySelector('#pubsub-cross-bridge');
    const w2 = container.querySelector('#window-2-container');

    expect(w1).not.toBeNull();
    expect(bridge).not.toBeNull();
    expect(w2).not.toBeNull();

    // Verify sequential DOM placement: Window 1 comes before Bridge, Bridge comes before Window 2
    expect(w1!.compareDocumentPosition(bridge!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bridge!.compareDocumentPosition(w2!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Quick-Launch link attributes
    const qlLink = container.querySelector('.btn-quick-launch');
    expect(qlLink).not.toBeNull();
    expect(qlLink?.getAttribute('href')).toBe('https://kaizen-lab-factory.web.app');
    expect(qlLink?.getAttribute('target')).toBe('_blank');
    expect(qlLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(qlLink?.getAttribute('aria-label')).toBe(
      'Open Standalone Factory Floor Console in new tab',
    );
  });

  it('supports VITE_FACTORY_FLOOR_URL override and falls back to production URL (TKT-055 #240)', () => {
    // 1. Default fallback to production URL
    const { unmount } = render(<SystemTopologyView incident={mockIncident} />);
    const defaultLink = screen.getByRole('link', { name: /factory floor console/i });
    expect(defaultLink.getAttribute('href')).toBe('https://kaizen-lab-factory.web.app');
    expect(defaultLink.getAttribute('target')).toBe('_blank');
    expect(defaultLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(defaultLink.getAttribute('aria-label')).toBe(
      'Open Standalone Factory Floor Console in new tab',
    );
    unmount();

    // 2. Custom override via environment variable
    vi.stubEnv('VITE_FACTORY_FLOOR_URL', 'http://localhost:3002');
    render(<SystemTopologyView incident={mockIncident} />);
    const overriddenLink = screen.getByRole('link', { name: /factory floor console/i });
    expect(overriddenLink.getAttribute('href')).toBe('http://localhost:3002');
    vi.unstubAllEnvs();
  });
});


describe('System Topology Production Polish Regression (Epic #238 / TKT-062)', () => {
  it('TKT-055: validates Quick-Launch production link and aria-label', () => {
    render(<SystemTopologyView incident={mockIncident} />);
    const link = screen.getByRole('link', { name: /open standalone factory floor console in new tab/i });
    expect(link.getAttribute('href')).toBe('https://kaizen-lab-factory.web.app');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('TKT-057 / TKT-075 / AC-04: active incident jump button is hidden on production; replaced by dev-only chip on ?state= deep-links', () => {
    const onOpen = vi.fn();
    // Production load (activeScenario === 'live'): no #topology-jump-incident, no dev-only chip.
    const originalSearch = window.location.search;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, search: '' },
    });
    try {
      const prod = render(<SystemTopologyView incident={mockIncident} onOpenIncident={onOpen} />);
      expect(prod.container.querySelector('#topology-jump-incident')).toBeNull();
      expect(prod.container.querySelector('#topology-dev-only-chip')).toBeNull();
      prod.unmount();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { ...window.location, search: originalSearch },
      });
    }
    // Scenario deep-link (?state=spc-breach): dev-only chip is visible so QA can reset to 'live'.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...window.location, search: '?state=detecting' },
    });
    const scenario = render(<SystemTopologyView incident={mockIncident} onOpenIncident={onOpen} />);
    const devChip = scenario.container.querySelector('#topology-dev-only-chip');
    expect(devChip).not.toBeNull();
    expect(devChip?.className).toContain('chip-dev-only');
    expect(scenario.container.querySelector('#topology-jump-incident')).toBeNull();
  });

  it('TKT-060: validates all 28 topology nodes have human-readable component titles with no raw JSX tags', () => {
    for (const node of TOPOLOGY_NODES) {
      if (node.uiRef) {
        expect(node.uiRef.component).not.toMatch(/<.*?>/);
        expect(node.uiRef.component.length).toBeGreaterThan(4);
      }
    }
  });

  it('TKT-059 & TKT-061: validates drawer header actions and embedded live preview components', () => {
    const nodeSensors = TOPOLOGY_NODES.find((n) => n.id === 'floor-sensors')!;
    const state: TopologyNodeState = { id: 'floor-sensors', summary: 'Spindle Telemetry', status: 'active', isInferred: false, details: {} };
    const { rerender } = render(
      <TopologyNodeDrawer
        node={nodeSensors}
        state={state}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );

    // Fullscreen toggle button in headerActions
    const fullscreenBtn = screen.getByRole('button', { name: /open fullscreen/i });
    expect(fullscreenBtn).toBeDefined();
    expect(fullscreenBtn.className).toContain('drawer-fullscreen-btn');

    // Embedded Telemetry Preview
    expect(screen.getByLabelText('Embedded Live Sensor Telemetry')).toBeDefined();

    // Issue #259 / TKT-067: the legacy 'Production UI Surface Reference' card is
    // gone. The same routing info now lives in the footer CTA and the
    // .preview-specs badge row underneath the preview.
    const footerCta = document.getElementById('drawer-ui-cta');
    expect(footerCta).toBeDefined();
    expect(footerCta?.querySelector('span')?.textContent).toBe('View Spindle Vibration FFT');

    const specs = document.getElementById('drawer-preview-specs');
    expect(specs).toBeDefined();
    expect(specs?.querySelectorAll('.spec-badge').length ?? 0).toBeGreaterThanOrEqual(1);

    // Test Acoustic Waveform Preview for floor-mics
    const nodeMics = TOPOLOGY_NODES.find((n) => n.id === 'floor-mics')!;
    rerender(
      <TopologyNodeDrawer
        node={nodeMics}
        state={{ id: 'floor-mics', summary: 'Acoustic MEMS', status: 'active', isInferred: false, details: {} }}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Embedded Acoustic Spectrogram')).toBeDefined();

    // Test Edge Gateway Preview for edge-gemma
    const nodeEdge = TOPOLOGY_NODES.find((n) => n.id === 'edge-gemma')!;
    rerender(
      <TopologyNodeDrawer
        node={nodeEdge}
        state={{ id: 'edge-gemma', summary: 'Gemma 3 Edge', status: 'done', isInferred: false, details: {} }}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Embedded Edge Gateway Telemetry')).toBeDefined();

    // Test RCA Ishikawa Preview for agent-rca
    const nodeRca = TOPOLOGY_NODES.find((n) => n.id === 'agent-rca')!;
    rerender(
      <TopologyNodeDrawer
        node={nodeRca}
        state={{ id: 'agent-rca', summary: 'Root Cause Agent', status: 'done', isInferred: false, details: {} }}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Embedded Root Cause 5-Whys Analysis')).toBeDefined();

    // Test Streak Invariant Preview for decision-gate-2
    const nodeStreak = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-2')!;
    rerender(
      <TopologyNodeDrawer
        node={nodeStreak}
        state={{ id: 'decision-gate-2', summary: 'Streak Verification Gate', status: 'active', isInferred: false, details: {} }}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Embedded Invariant 3 Verification Streak')).toBeDefined();
  });
});

describe('Window Containers, Contrast Hierarchy & Responsive Canvas Shell (TKT-064 #255)', () => {
  it('1. no duplicate crumb: SystemTopologyView never renders its own .header-crumb (global TopHeader owns it, #271) and hides all removed demo controls', () => {
    render(<SystemTopologyView incident={null} />);

    // The breadcrumb pill is rendered once, globally, by TopHeader — never inside the page itself.
    expect(document.querySelector('.header-crumb')).toBeNull();
    expect(screen.queryByText('Cell Line 1')).toBeNull();

    expect(document.querySelector('h1')).toBeNull();
    expect(screen.queryByLabelText(/Simulation Scenario/i)).toBeNull();
    expect(screen.queryByText(/Simulate Ripple/i)).toBeNull();
    expect(screen.queryByText(/^Incident #/i)).toBeNull();
    expect(screen.queryByText(/28 Nodes/i)).toBeNull();
  });

  it('2. window 1 container: boundary classes, phase 1/2, pill aria-label, no badge row', () => {
    render(<SystemTopologyView incident={mockIncident} />);

    const window1Container = document.getElementById('window-1-container');
    expect(window1Container).not.toBeNull();
    expect(window1Container?.className).toContain('window-boundary-card');
    expect(window1Container?.className).toContain('window-1-boundary');
    expect(window1Container?.contains(document.getElementById('phase-1'))).toBe(true);
    expect(window1Container?.contains(document.getElementById('phase-2'))).toBe(true);
    expect(window1Container?.querySelector('.window-pill')?.getAttribute('aria-label')).toBe(
      'Window 1 · Factory Floor (Edge & On-Premises)',
    );
    expect(window1Container?.querySelector('.window-badges-row')).toBeNull();
  });

  it('3. window 2 container: boundary classes, phase 3/4/5, no badge row, no status chip', () => {
    render(<SystemTopologyView incident={mockIncident} />);

    const window2Container = document.getElementById('window-2-container');
    expect(window2Container).not.toBeNull();
    expect(window2Container?.className).toContain('window-boundary-card');
    expect(window2Container?.className).toContain('window-2-boundary');
    expect(window2Container?.contains(document.getElementById('phase-3'))).toBe(true);
    expect(window2Container?.contains(document.getElementById('phase-4'))).toBe(true);
    expect(window2Container?.contains(document.getElementById('phase-5'))).toBe(true);
    expect(window2Container?.querySelector('.window-badges-row')).toBeNull();
    expect(document.getElementById('window-2-status-chip')).toBeNull();
  });

  it('4. quick-launch: factory floor console link lives inside Window 1 with correct a11y attrs', () => {
    vi.stubEnv('VITE_FACTORY_FLOOR_URL', 'http://localhost:3002');
    render(<SystemTopologyView incident={mockIncident} />);

    const link = screen.getByRole('link', { name: /factory floor console/i });
    expect(link.getAttribute('href')).toBe('http://localhost:3002');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.className).toContain('btn-quick-launch');

    const window1Container = document.getElementById('window-1-container');
    expect(window1Container?.contains(link)).toBe(true);
    vi.unstubAllEnvs();
  });

  it('5. pub/sub bridge: a11y attrs, SLA text, DOM position between Window 1 and Window 2', () => {
    const { container } = render(<SystemTopologyView incident={mockIncident} />);

    const bridge = container.querySelector('#pubsub-cross-bridge');
    expect(bridge).not.toBeNull();
    expect(bridge?.getAttribute('role')).toBe('group');
    expect(bridge?.getAttribute('aria-label')).toBe(
      'Google Cloud Pub/Sub bridge between Window 1 and Window 2',
    );
    expect(bridge?.textContent).toContain('Pub/Sub');
    expect(bridge?.textContent).toContain('< 80 ms');
    expect(bridge?.textContent).toContain('100 Hz');

    const w1 = container.querySelector('#window-1-container');
    const w2 = container.querySelector('#window-2-container');
    expect(w1!.compareDocumentPosition(bridge!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bridge!.compareDocumentPosition(w2!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('6. contrast classes: depth tokens in index.css and layer/card structure in the DOM', () => {
    const indexCss = readFileSync('src/index.css', 'utf-8');
    expect(indexCss).toMatch(/--depth-shell-w1:\s*rgba\(71,\s*85,\s*105,\s*0?\.08\)/);
    expect(indexCss).toMatch(/--depth-shell-w2:\s*rgba\(99,\s*102,\s*241,\s*0?\.06\)/);
    expect(indexCss).toMatch(/--depth-layer:\s*rgba\(15,\s*23,\s*42,\s*0?\.04\)/);
    expect(indexCss).toMatch(/--surface-card:\s*#fff/);

    const { container } = render(<SystemTopologyView incident={mockIncident} />);
    const window1Container = container.querySelector('#window-1-container');
    const layer = window1Container?.querySelector('.topology-swimlane-card');
    expect(layer).not.toBeNull();
    const card = layer?.querySelector('.node-card');
    expect(card).not.toBeNull();
    // Shell > Layer container > Card nesting must hold
    expect(window1Container?.contains(layer as Node)).toBe(true);
    expect(layer?.contains(card as Node)).toBe(true);
  });

  it('7. no idle/standby/queued text for null incident or any scenario (AC-TOP-33)', () => {
    const bannedPattern = /\b(idle|standby|queued)\b/i;
    const scenarioIds: Array<string> = ['live', ...TOPOLOGY_SCENARIOS.map((s) => s.id)];

    scenarioIds.forEach((scenarioId) => {
      window.history.pushState({}, '', scenarioId === 'live' ? '/' : `/?state=${scenarioId}`);
      const { container, unmount } = render(<SystemTopologyView incident={null} />);
      expect(container.textContent).not.toMatch(bannedPattern);
      unmount();
    });

    window.history.pushState({}, '', '/');
  });

  it('9. deriveWindow2State returns no Standby text for a null incident', () => {
    expect(deriveWindow2State(null, 'nominal').statusText).not.toMatch(/standby/i);
    expect(deriveWindow2State(null).statusText).not.toMatch(/standby/i);
  });

  it('10. canvas shell: zoom controls render and all resolvable edges compute a path (regression guard #254)', () => {
    const nodeStates = deriveNodeStates(mockIncident);
    const { container } = render(
      <TopologyCanvas nodeStates={nodeStates} selectedNodeId={null}>
        <div id="window-1-container">
          {TOPOLOGY_NODES.map((n) => (
            <div key={n.id} id={`node-${n.id}`} data-node={n.id} data-node-id={n.id} />
          ))}
        </div>
        <div id="pubsub-cross-bridge" data-node="pubsub-cross-bridge" data-node-id="pubsub-cross-bridge" />
      </TopologyCanvas>,
    );

    expect(container.querySelector('[data-testid="topology-canvas"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom In' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Zoom Out' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reset View to 100%' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Toggle Minimap' })).toBeDefined();

    expect(TOPOLOGY_EDGES).toHaveLength(37);
    // Issue #257 (TKT-066a): the deterministic orthogonal router routes
    // ALL 37 connectors from the port-coordinate waypoint table —
    // including the 10 gate-block fan-outs (gate1-yes/no, gate2-yes/no).
    // These were previously skipped by the ad-hoc DOM-rect router when
    // their target nodes were not present in the test fixture.
    const edgePaths = container.querySelectorAll('svg.topology-svg-overlay path.edge-path');
    expect(edgePaths.length).toBe(TOPOLOGY_EDGES.length);
  });
});

// TKT-076 / Issue #277 — REWORK ROUND 2 regression suite.
// Guards the runtime ReferenceError introduced by the missing
// `hasStaticSvg` import (20/30 topology nodes used to crash the drawer)
// and verifies the SVG-only / NoPreviewPlaceholder fallback hierarchy
// renders without throwing on unknown node ids.
describe('TopologyNodeDrawer SVG schematic preview fallback (TKT-076 / AC-TOP-28a–c, round 2)', () => {
  it('opens the drawer for an SVG-only node (output-docs) and renders StaticPreviewSVG without crashing', () => {
    const outputDocs = TOPOLOGY_NODES.find((n) => n.id === 'output-docs')!;
    expect(outputDocs).toBeDefined();

    const state: TopologyNodeState = {
      id: 'output-docs',
      summary: '8D Report Composer',
      status: 'done',
      isInferred: false,
      details: {},
    };

    // Render must not throw ReferenceError for missing hasStaticSvg import.
    render(
      <TopologyNodeDrawer
        node={outputDocs}
        state={state}
        incident={mockIncident}
        onClose={vi.fn()}
      />,
    );

    // SideDrawer portals its body to `document.body`, so we query the global
    // document — `container` from `render()` does not contain the portal.
    // StaticPreviewSVG wrapper renders for nodes listed in PREVIEW_SVG_NODE_IDS.
    const staticPreview = document.querySelector(
      '[data-testid="static-preview-output-docs"]',
    );
    expect(staticPreview).not.toBeNull();
    expect(screen.getByRole('img', { name: /output-docs/i })).toBeDefined();

    // NoPreviewPlaceholder must NOT be present — we have a static SVG.
    expect(document.querySelector('[data-testid="no-preview-output-docs"]')).toBeNull();
  });

  it('falls back to NoPreviewPlaceholder for an unknown node id without crashing', () => {
    // We borrow a real node's structural fields but override `id` to a value
    // that is NOT in PREVIEW_SVG_NODE_IDS, so the drawer must take the
    // "No preview" fallback branch and never throw ReferenceError.
    const syntheticNode = {
      ...TOPOLOGY_NODES[0],
      id: 'synthetic-unknown-node',
      label: 'Synthetic Unknown Node',
    } as unknown as Parameters<typeof TopologyNodeDrawer>[0]['node'];

    const state = {
      id: 'synthetic-unknown-node',
      summary: 'No schematic available',
      status: 'idle' as const,
      isInferred: true,
      details: {},
    } as unknown as Parameters<typeof TopologyNodeDrawer>[0]['state'];

    render(
      <TopologyNodeDrawer
        node={syntheticNode}
        state={state}
        incident={null}
        onClose={vi.fn()}
      />,
    );

    // SideDrawer portals to document.body — query globally.
    const placeholder = document.querySelector(
      '[data-testid="no-preview-synthetic-unknown-node"]',
    );
    expect(placeholder).not.toBeNull();
    // Static SVG path must NOT be used for unknown nodes.
    expect(
      document.querySelector('[data-testid="static-preview-synthetic-unknown-node"]'),
    ).toBeNull();
  });
});
