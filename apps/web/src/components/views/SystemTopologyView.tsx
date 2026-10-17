// SystemTopologyView: 5-Layer End-to-End Multi-Agent Architecture and Realtime Execution Graph (Issue #205 & Issue #211).
import React, { useMemo, useState } from 'react';
import type { DashboardTab, IncidentState, TopologyNodeId, TopologyScenarioId } from '../../types';
import type { ToastTone } from '../../App';
import {
  TOPOLOGY_NODES,
  TOPOLOGY_SCENARIOS,
  deriveNodeStates,
  deriveWindow2State,
} from '../../lib/topology';
import PhaseStepperBar from '../topology/PhaseStepperBar';
import TopologyCanvas from '../topology/TopologyCanvas';
import TopologyNode from '../topology/TopologyNode';
import DecisionGateNode from '../topology/DecisionGateNode';
import TopologyNodeDrawer from '../topology/TopologyNodeDrawer';
import { STATUS_LABEL, friendlyDefectName } from '../../lib/incident';

interface SystemTopologyViewProps {
  incident: IncidentState | null;
  onOpenIncident?: (incidentId: string) => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
  onNavigateToTab?: (tab: DashboardTab) => void;
}

export default function SystemTopologyView({
  incident,
  onOpenIncident,
  onNotify,
  onNavigateToTab,
}: SystemTopologyViewProps): React.ReactElement {
  const [selectedNodeId, setSelectedNodeId] = useState<TopologyNodeId | null>(null);
  const [activeScenario, setActiveScenario] = useState<TopologyScenarioId | 'live'>(() => {
    if (typeof window === 'undefined') return 'live';
    const stateParam = new URLSearchParams(window.location.search).get('state');
    const isValidScenario = TOPOLOGY_SCENARIOS.some((s) => s.id === stateParam);
    return isValidScenario ? (stateParam as TopologyScenarioId) : 'live';
  });

  const factoryFloorUrl =
    (import.meta.env.VITE_FACTORY_FLOOR_URL as string | undefined) ||
    'https://kaizen-lab-factory.web.app';

  // Derive node states: live incident or scenario override
  const nodeStates = useMemo(() => {
    if (activeScenario === 'live') {
      return deriveNodeStates(incident);
    }
    return deriveNodeStates(incident, activeScenario);
  }, [incident, activeScenario]);

  const window2State = useMemo(
    () => deriveWindow2State(incident, activeScenario),
    [incident, activeScenario],
  );

  const selectedNode = useMemo(
    () => TOPOLOGY_NODES.find((n) => n.id === selectedNodeId) ?? null,
    [selectedNodeId],
  );
  const selectedState = selectedNodeId ? nodeStates[selectedNodeId] : null;

  const isIncidentOpen = incident && !['normal', 'closed', 'dismissed'].includes(incident.status);

  // Helper node getter
  const getNode = (id: TopologyNodeId) => TOPOLOGY_NODES.find((n) => n.id === id);

  const activeScenarioMeta = useMemo(() => {
    if (activeScenario === 'live') {
      return {
        id: 'live',
        label: incident ? `Live Incident #${incident.incident_id}` : 'Live Blackboard Stream (Nominal)',
        description: incident
          ? `Reactive blackboard stream bound to active incident #${incident.incident_id} (${STATUS_LABEL[incident.status]}).`
          : 'Connected to live Firestore blackboard. All factory line components running nominal.',
      };
    }
    return TOPOLOGY_SCENARIOS.find((s) => s.id === activeScenario);
  }, [activeScenario, incident]);

  const handleSimulateRipple = (nodeId?: string) => {
    onNotify?.(
      nodeId
        ? `Simulated event ripple triggered from component [${nodeId}]. State propagated across blackboard.`
        : 'Triggered end-to-end telemetry ripple across all 5 architecture layers.',
      'info',
    );
  };

  return (
    <div className="page page-compact topology-view">
      {/* Active Incident Jump & Live Reset controls (TKT-064). Breadcrumb lives only in the global TopHeader (#271). */}
      {(isIncidentOpen || activeScenario !== 'live') && (
        <header className="row wrap" style={{ gap: 12, justifyContent: 'flex-end' }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            {/* Quick Jump to Active Incident (TKT-057 calm animation) */}
            {isIncidentOpen && onOpenIncident && (
              <button
                id="topology-jump-incident"
                type="button"
                className="btn btn-dark btn-sm topology-jump-btn"
                onClick={() => onOpenIncident(incident.incident_id)}
                style={{ gap: 6 }}
              >
                <span className="status-dot red animate-gentle-pulse" style={{ width: 8, height: 8 }} />
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  warning
                </span>
                <span>
                  Incident #{incident.incident_id} · {friendlyDefectName(incident.defect_type)} ({STATUS_LABEL[incident.status]})
                </span>
              </button>
            )}

            {/* Reset to live blackboard state (only shown while a ?state= scenario deep-link is active) */}
            {activeScenario !== 'live' && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setActiveScenario('live');
                  onNotify?.('Topology view reset to live Firestore blackboard state.', 'info');
                }}
                title="Reset to live blackboard state"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  refresh
                </span>
                Live
              </button>
            )}
          </div>
        </header>
      )}

      {/* Scenario Context Banner */}
      <div
        className="glass"
        style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--r-md)',
          borderLeft: '4px solid var(--accent)',
          background: 'linear-gradient(90deg, rgba(99,102,241,0.06) 0%, rgba(255,255,255,0.8) 100%)',
        }}
      >
        <div className="row between wrap" style={{ gap: 8, alignItems: 'center' }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className="chip chip-sm chip-blue mono" style={{ fontWeight: 700 }}>
              Active Mode: {activeScenarioMeta?.label}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>
              {activeScenarioMeta?.description}
            </span>
          </div>
          <div className="row wrap" style={{ gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#4f46e5' }} /> Executing
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#16a34a' }} /> Verified / Done
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#d97706' }} /> Warning / Low Conf
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#dc2626' }} /> Defect / Reset
            </span>
          </div>
        </div>
      </div>

      {/* Tier 1 Glance: Phase Stepper Bar (AC-TOP-23, Issue #227) */}
      <PhaseStepperBar
        incident={incident}
        scenario={activeScenario}
        onScrollToLayer={(layerId) => {
          const el = document.getElementById(layerId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />

      {/* 5-Layer Vertical Architecture Canvas */}
      <TopologyCanvas nodeStates={nodeStates} selectedNodeId={selectedNodeId}>
        <div className="vertical-pipeline topology-swimlanes-grid">
          {/* =================================================================
              WINDOW 1: FACTORY FLOOR (ON-PREMISES EDGE DATA & GATEWAY)
              ================================================================= */}
          <div className="window-boundary-card window-1-boundary" id="window-1-container">
            <div className="window-boundary-header">
              <div className="window-title-group">
                <div
                  className="window-pill window-1-pill"
                  aria-label="Window 1 · Factory Floor (Edge & On-Premises)"
                >
                  <span className="material-symbols-outlined window-icon" aria-hidden="true">
                    factory
                  </span>
                  <span className="window-tag">WINDOW 1</span>
                  <span className="window-separator">·</span>
                  <span className="window-name">Factory Floor (Edge &amp; On-Premises)</span>
                </div>
              </div>
              <div className="window-actions">
                <a
                  href={factoryFloorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-quick-launch"
                  title="Open Standalone Factory Floor Console in new tab"
                  aria-label="Open Standalone Factory Floor Console in new tab"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
                    precision_manufacturing
                  </span>
                  <span>Factory Floor Console ↗</span>
                </a>
              </div>
            </div>

            {/* ========================================================
                LAYER 1: FACTORY FLOOR · EDGE DATA SOURCES
                ======================================================== */}
          <section
            id="phase-1"
            className="pipeline-phase topology-swimlane-card"
            style={{ borderTop: '4px solid #16a34a' }}
          >
            <div className="phase-header">
              <div className="phase-tag-row">
                <span className="phase-badge phase-1-badge">1</span>
                <div className="phase-title-col">
                  <div className="phase-title">Layer 1: Factory Floor · Edge Data Sources</div>
                  <div className="phase-subtitle">
                    CNC Machines, Exit Conveyor Cameras, Vibration/Temp Sensors, Microphones &amp; QR Codes
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip chip-sm chip-green">Physical Edge Tier</span>
                <span className="chip chip-sm chip-blue">5 Data Sources</span>
              </div>
            </div>

            <div className="node-row-5">
              {(['floor-machines', 'floor-cameras', 'floor-sensors', 'floor-mics', 'floor-tags'] as TopologyNodeId[]).map(
                (id) => {
                  const node = getNode(id);
                  if (!node) return null;
                  return (
                    <TopologyNode
                      key={id}
                      node={node}
                      state={nodeStates[id]}
                      selected={selectedNodeId === id}
                      onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                    />
                  );
                },
              )}
            </div>
          </section>

          {/* ========================================================
              LAYER 2: ON-PREMISES GATEWAY · GEMMA EDGE & BRIDGE
              ======================================================== */}
          <section
            id="phase-2"
            className="pipeline-phase topology-swimlane-card"
            style={{ borderTop: '4px solid #d97706' }}
          >
            <div className="phase-header">
              <div className="phase-tag-row">
                <span className="phase-badge phase-2-badge">2</span>
                <div className="phase-title-col">
                  <div className="phase-title">Layer 2: On-Premises Gateway · Gemma Edge &amp; Bridge</div>
                  <div className="phase-subtitle">
                    Gemma 3 2B Local Inference (&gt;95% Pre-Filter) &amp; Industrial OPC-UA / MQTT Protocol Gateway
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip chip-sm chip-amber">On-Prem IPC</span>
                <span className="chip chip-sm chip-blue">&lt; 50ms Divert</span>
              </div>
            </div>

            <div className="node-row-2">
              {(['edge-gemma', 'edge-bridge'] as TopologyNodeId[]).map((id) => {
                const node = getNode(id);
                if (!node) return null;
                return (
                  <TopologyNode
                    key={id}
                    node={node}
                    state={nodeStates[id]}
                    selected={selectedNodeId === id}
                    onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                  />
                );
              })}
            </div>
          </section>
        </div>

        {/* =================================================================
            CROSS-WINDOW EVENT CONDUIT: GOOGLE CLOUD PUB/SUB INGESTION BUS
            ================================================================= */}
        <div
          className="cross-window-bridge"
          id="pubsub-cross-bridge"
          role="group"
          aria-label="Google Cloud Pub/Sub bridge between Window 1 and Window 2"
        >
          <div className="bridge-card">
            <div className="bridge-icon-tile">
              <span className="material-symbols-outlined" aria-hidden="true">
                cloud_sync
              </span>
            </div>
            <div className="bridge-content">
              <div className="bridge-title-row">
                <span className="bridge-title">
                  Google Cloud Pub/Sub · Asynchronous Telemetry &amp; Event Ingestion Bus
                </span>
                <span className="chip chip-sm chip-blue">
                  <span className="chip-dot blue" />Cross-Window Event Conduit
                </span>
              </div>
              <div className="bridge-subtitle">
                Decoupled 100 Hz OPC-UA telemetry buffer &amp; anomalous defect frames stream · Ingestion SLA &lt; 80 ms
              </div>
            </div>
            <div className="bridge-metric-tile">
              <span className="bridge-metric-val">100 Hz</span>
              <span className="bridge-metric-lbl">Stream Ingest</span>
            </div>
          </div>
        </div>

        {/* =================================================================
            WINDOW 2: CLOUD CONTROL PLANE (GOOGLE CLOUD & ADK SWARM)
            ================================================================= */}
        <div
          className={`window-boundary-card window-2-boundary ${window2State.pulseClass}`}
          id="window-2-container"
        >
          <div className="window-boundary-header">
            <div className="window-title-group">
              <div
                className="window-pill window-2-pill"
                aria-label="Window 2 · Cloud Control Plane (Google Cloud & ADK Swarm)"
              >
                <span className="material-symbols-outlined window-icon" aria-hidden="true">
                  cloud
                </span>
                <span className="window-tag">WINDOW 2</span>
                <span className="window-separator">·</span>
                <span className="window-name">Cloud Control Plane (Google Cloud &amp; ADK Swarm)</span>
              </div>
            </div>
          </div>

          {/* ========================================================
              LAYER 3: GOOGLE CLOUD · DATA & AI PLATFORM
              ======================================================== */}
          <section
            id="phase-3"
            className="pipeline-phase topology-swimlane-card"
            style={{ borderTop: '4px solid #2563eb' }}
          >
            <div className="phase-header">
              <div className="phase-tag-row">
                <span className="phase-badge phase-3-badge">3</span>
                <div className="phase-title-col">
                  <div className="phase-title">Layer 3: Google Cloud · Data &amp; AI Platform</div>
                  <div className="phase-subtitle">
                    Cloud Pub/Sub, BigQuery Warehouse, Firestore Shared Blackboard, Vertex RAG &amp; Gemini 2.5
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip chip-sm chip-blue">Enterprise Cloud Tier</span>
                <span className="chip chip-sm chip-green">5 Platform Services</span>
              </div>
            </div>

            <div className="node-row-5">
              {(['gcp-pubsub', 'gcp-bigquery', 'gcp-firestore', 'gcp-rag', 'gcp-gemini'] as TopologyNodeId[]).map(
                (id) => {
                  const node = getNode(id);
                  if (!node) return null;
                  return (
                    <TopologyNode
                      key={id}
                      node={node}
                      state={nodeStates[id]}
                      selected={selectedNodeId === id}
                      onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                    />
                  );
                },
              )}
            </div>
          </section>

          {/* ========================================================
              LAYER 4: AGENT TEAM · GOOGLE ADK MULTI-AGENT SYSTEM
              ======================================================== */}
          <section
            id="phase-4"
            className="pipeline-phase topology-swimlane-card"
            style={{ borderTop: '4px solid #7c3aed' }}
          >
            <div className="phase-header">
              <div className="phase-tag-row">
                <span className="phase-badge phase-4-badge">4</span>
                <div className="phase-title-col">
                  <div className="phase-title">Layer 4: Agent Team · Google ADK Multi-Agent System</div>
                  <div className="phase-subtitle">
                    ADK Orchestrator, Quality Inspector, RCA Swarm (Traceability + Telemetry), Copilot &amp; Continuous Learning
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip chip-sm chip-purple">Google ADK Swarm</span>
                <span className="chip chip-sm chip-green">Confidence Gate &ge; 0.70</span>
              </div>
            </div>

            {/* Row 1: Orchestrator Single Entry/Exit */}
            <div className="node-row-1">
              {getNode('adk-orch') && (
                <TopologyNode
                  node={getNode('adk-orch')!}
                  state={nodeStates['adk-orch']}
                  selected={selectedNodeId === 'adk-orch'}
                  onSelect={(id) => setSelectedNodeId(id)}
                />
              )}
            </div>

            {/* Row 2: Parallel Investigation Agents (QA, Traceability, Process Analyst, Root Cause) */}
            <div className="node-row-4">
              {(['agent-qa', 'agent-tra', 'agent-pa', 'agent-rca'] as TopologyNodeId[]).map((id) => {
                const node = getNode(id);
                if (!node) return null;
                return (
                  <TopologyNode
                    key={id}
                    node={node}
                    state={nodeStates[id]}
                    selected={selectedNodeId === id}
                    onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                  />
                );
              })}
            </div>

            {/* Row 3: Decision Diamond 1 (Confidence Gate) */}
            {getNode('decision-gate-1') && (
              <DecisionGateNode
                node={getNode('decision-gate-1')!}
                state={nodeStates['decision-gate-1']}
                selected={selectedNodeId === 'decision-gate-1'}
                onSelect={(id) => setSelectedNodeId(id)}
              />
            )}

            {/* Row 4: Diagnostic Loop Agents & Forward Resolution Agents */}
            <div className="node-row-5">
              {(['diagnostic-agent', 'technician-photo', 'copilot-live', 'agent-scribe', 'agent-learn'] as TopologyNodeId[]).map(
                (id) => {
                  const node = getNode(id);
                  if (!node) return null;
                  return (
                    <TopologyNode
                      key={id}
                      node={node}
                      state={nodeStates[id]}
                      selected={selectedNodeId === id}
                      onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                    />
                  );
                },
              )}
            </div>
          </section>

          {/* ========================================================
              LAYER 5: HUMAN-IN-THE-LOOP & OPERATIONAL OUTPUTS
              ======================================================== */}
          <section
            id="phase-5"
            className="pipeline-phase topology-swimlane-card"
            style={{ borderTop: '4px solid #db2777' }}
          >
            <div className="phase-header">
              <div className="phase-tag-row">
                <span className="phase-badge phase-5-badge">5</span>
                <div className="phase-title-col">
                  <div className="phase-title">Layer 5: Human-in-the-Loop &amp; Operational Outputs</div>
                  <div className="phase-subtitle">
                    Technician Mobile Copilot, Conveyor Optical Proof (Invariant #3), Shift Leader Sign-Off &amp; 8D Dossiers
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip chip-sm chip-pink">Human Governance</span>
                <span className="chip chip-sm chip-green">Key Invariant #3 Streak &ge; 50</span>
              </div>
            </div>

            {/* Row 1: Field Technician Wrenching & Conveyor Optical Proof */}
            <div className="node-row-2">
              {(['human-tech', 'verify-camera'] as TopologyNodeId[]).map((id) => {
                const node = getNode(id);
                if (!node) return null;
                return (
                  <TopologyNode
                    key={id}
                    node={node}
                    state={nodeStates[id]}
                    selected={selectedNodeId === id}
                    onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                  />
                );
              })}
            </div>

            {/* Row 2: Decision Diamond 2 (Invariant #3 Streak Gate) */}
            {getNode('decision-gate-2') && (
              <DecisionGateNode
                node={getNode('decision-gate-2')!}
                state={nodeStates['decision-gate-2']}
                selected={selectedNodeId === 'decision-gate-2'}
                onSelect={(id) => setSelectedNodeId(id)}
              />
            )}

            {/* Row 3: Penalty Reset, Plant Dashboard, Shift Leader Approval Gate & Output Documents */}
            <div className="node-row-4">
              {(['streak-reset', 'human-dash', 'human-lead', 'output-docs'] as TopologyNodeId[]).map((id) => {
                const node = getNode(id);
                if (!node) return null;
                return (
                  <TopologyNode
                    key={id}
                    node={node}
                    state={nodeStates[id]}
                    selected={selectedNodeId === id}
                    onSelect={(selectedId) => setSelectedNodeId(selectedId)}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </TopologyCanvas>

      {/* Deep-dive Node Inspection SideDrawer */}
      <TopologyNodeDrawer
        node={selectedNode}
        state={selectedState}
        incident={incident}
        onClose={() => setSelectedNodeId(null)}
        onNavigateToIncident={
          incident && onOpenIncident ? () => onOpenIncident(incident.incident_id) : undefined
        }
        onNavigateToTab={onNavigateToTab}
        onSimulateTrigger={(id) => handleSimulateRipple(id)}
      />
    </div>
  );
}
