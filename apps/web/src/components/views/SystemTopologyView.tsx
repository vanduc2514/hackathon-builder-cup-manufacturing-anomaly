// SystemTopologyView: 4-Phase multi-agent system architecture and realtime execution graph (Issue #205).
import React, { useMemo, useState } from 'react';
import type { IncidentState, TopologyNodeId } from '../../types';
import type { ToastTone } from '../../App';
import {
  TOPOLOGY_NODES,
  TOPOLOGY_PHASES,
  deriveNodeStates,
  derivePhaseStates,
} from '../../lib/topology';
import TopologyCanvas from '../topology/TopologyCanvas';
import TopologyNode from '../topology/TopologyNode';
import TopologyNodeDrawer from '../topology/TopologyNodeDrawer';
import { STATUS_LABEL, friendlyDefectName } from '../../lib/incident';

interface SystemTopologyViewProps {
  incident: IncidentState | null;
  onOpenIncident?: (incidentId: string) => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
}

export default function SystemTopologyView({
  incident,
  onOpenIncident,
  onNotify,
}: SystemTopologyViewProps): React.ReactElement {
  const [selectedNodeId, setSelectedNodeId] = useState<TopologyNodeId | null>(null);

  const nodeStates = useMemo(() => deriveNodeStates(incident), [incident]);
  const phaseStates = useMemo(() => derivePhaseStates(incident, nodeStates), [incident, nodeStates]);

  const selectedNode = useMemo(
    () => TOPOLOGY_NODES.find((n) => n.id === selectedNodeId) ?? null,
    [selectedNodeId],
  );
  const selectedState = selectedNodeId ? nodeStates[selectedNodeId] : null;

  const isIncidentOpen = incident && !['normal', 'closed', 'dismissed'].includes(incident.status);

  return (
    <div className="page page-compact topology-view">
      {/* Header section with page title & active incident quick-link */}
      <header className="row between wrap" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 4, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <h1 className="page-title page-title-sm">System Architecture &amp; Execution Graph</h1>
            <span
              className="chip chip-blue"
              style={{ fontSize: '0.74rem', padding: '2px 8px', fontWeight: 650 }}
            >
              11 Nodes · 4 Phases
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: 'var(--muted)', maxWidth: 840 }}>
            Reactive operational loop: On-premise Gemma 3 2B edge filter &rarr; Cloud Pub/Sub &amp; ADK multi-agent
            swarm &rarr; Gemini Live multimodal copilot &rarr; Invariant #3 verification streak &rarr; Shift-leader governance.
          </p>
        </div>

        {/* Status pill & incident jumper */}
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          {isIncidentOpen && onOpenIncident ? (
            <button
              id="topology-jump-incident"
              type="button"
              className="btn btn-dark btn-sm animate-pulse-glow"
              onClick={() => onOpenIncident(incident.incident_id)}
              style={{ gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                warning
              </span>
              <span>
                Active Incident #{incident.incident_id} · {friendlyDefectName(incident.defect_type)} (
                {STATUS_LABEL[incident.status]})
              </span>
            </button>
          ) : (
            <div
              className="chip chip-green row"
              style={{ fontSize: '0.78rem', padding: '6px 12px', gap: 6 }}
            >
              <span className="dot" style={{ width: 8, height: 8 }} />
              <span>Line Health Nominal · All 11 Nodes Standby</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onNotify?.('Architecture topology refreshed to latest blackboard state', 'info')}
            title="Refresh topology state"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              refresh
            </span>
          </button>
        </div>
      </header>

      {/* Architecture legend & 5-tier guidance card */}
      <div
        className="glass"
        style={{
          padding: '0.85rem 1.2rem',
          borderRadius: 'var(--r-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        <div className="row between wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div className="row wrap" style={{ gap: '0.9rem', alignItems: 'center' }}>
            <span className="eyebrow" style={{ color: 'var(--ink)' }}>
              Operational Tiers:
            </span>
            <div className="row wrap" style={{ gap: 6, fontSize: '0.74rem' }}>
              <span className="chip" style={{ background: 'rgba(15,23,42,0.06)' }}>
                <b>Tier 1 &amp; 2:</b> Glance (&lt;1s) · Gemma Edge &amp; Pneumatic Diverter
              </span>
              <span className="chip" style={{ background: 'rgba(15,23,42,0.06)' }}>
                <b>Tier 3 &amp; 4:</b> Focus (&lt;5s) · Ingestion &amp; ADK Reasoning Swarm
              </span>
              <span className="chip" style={{ background: 'rgba(15,23,42,0.06)' }}>
                <b>Tier 5:</b> Deep Dive · Gemini Live Multimodal &amp; Shift Leader Approval
              </span>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span className="row" style={{ gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} /> Executing
            </span>
            <span className="row" style={{ gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--green)' }} /> Verified
            </span>
            <span className="row" style={{ gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--amber)' }} /> Awaiting / Sign-off
            </span>
            <span className="row" style={{ gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--hair-strong)' }} /> Standby
            </span>
          </div>
        </div>
      </div>

      {/* Interactive 4-Phase Swimlanes & Bezier Canvas */}
      <TopologyCanvas nodeStates={nodeStates}>
        <div className="topology-swimlanes-grid">
          {TOPOLOGY_PHASES.map((phase) => {
            const phaseState = phaseStates[phase.id];
            const nodesInPhase = TOPOLOGY_NODES.filter((n) => n.phase === phase.id);

            const isPhaseActive = phaseState.status === 'active';
            const isPhaseCompleted = phaseState.status === 'completed';

            return (
              <section
                key={phase.id}
                id={`topology-swimlane-${phase.id}`}
                data-phase={phase.id}
                className="glass topology-swimlane-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  padding: '1rem',
                  borderRadius: 'var(--r-lg)',
                  borderTop: `4px solid ${phase.lampHex}`,
                  background: isPhaseActive
                    ? 'rgba(255,255,255,0.75)'
                    : 'var(--glass-bg)',
                  boxShadow: isPhaseActive
                    ? `0 12px 32px -8px ${phase.lampHex}33, var(--glass-shadow)`
                    : 'var(--glass-shadow)',
                  transition: 'all 0.3s var(--ease)',
                }}
              >
                {/* Phase Swimlane Header */}
                <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <div className="col" style={{ gap: 2 }}>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: phase.lampHex,
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                        }}
                      >
                        {phase.letter}
                      </span>
                      <h2 style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--ink)' }}>
                        {phase.name}
                      </h2>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                      {phase.vietnameseName}
                    </div>
                  </div>

                  <span
                    className={`chip ${
                      isPhaseCompleted
                        ? 'chip-green'
                        : isPhaseActive
                          ? 'chip-blue'
                          : 'chip-muted'
                    }`}
                    style={{ fontSize: '0.68rem', padding: '2px 7px' }}
                  >
                    {isPhaseCompleted
                      ? 'Completed'
                      : isPhaseActive
                        ? 'Active Phase'
                        : 'Standby'}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text)',
                    lineHeight: 1.35,
                    margin: '0 0 0.3rem 0',
                  }}
                >
                  {phase.description}
                </p>

                {/* Nodes in this Phase */}
                <div
                  className="col"
                  style={{
                    gap: '0.85rem',
                    flex: 1,
                  }}
                >
                  {nodesInPhase.map((node) => (
                    <TopologyNode
                      key={node.id}
                      node={node}
                      state={nodeStates[node.id]}
                      selected={selectedNodeId === node.id}
                      onSelect={(id) => setSelectedNodeId(id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
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
      />
    </div>
  );
}
