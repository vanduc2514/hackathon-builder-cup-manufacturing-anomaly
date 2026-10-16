// SystemTopologyView: 5-Layer Industrial Architecture & Multi-Phase Execution Graph (Issue #211).
import React, { useMemo, useState } from 'react';
import type { DashboardTab, IncidentState, TopologyNodeDefinition, TopologyNodeId } from '../../types';
import type { ToastTone } from '../../App';
import {
  TOPOLOGY_LAYERS,
  TOPOLOGY_NODES,
  TOPOLOGY_PHASES,
  TOPOLOGY_SCENARIOS,
  deriveLayerStates,
  deriveNodeStates,
  derivePhaseStates,
} from '../../lib/topology';
import TopologyCanvas from '../topology/TopologyCanvas';
import TopologyNode from '../topology/TopologyNode';
import TopologyDecisionGate from '../topology/TopologyDecisionGate';
import TopologyNodeDrawer from '../topology/TopologyNodeDrawer';
import { STATUS_LABEL, friendlyDefectName } from '../../lib/incident';

interface SystemTopologyViewProps {
  incident: IncidentState | null;
  onOpenIncident?: (incidentId: string) => void;
  onSelectTab?: (tab: DashboardTab) => void;
  onNotify?: (text: string, tone?: ToastTone) => void;
}

export default function SystemTopologyView({
  incident,
  onOpenIncident,
  onSelectTab,
  onNotify,
}: SystemTopologyViewProps): React.ReactElement {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('live');
  const [viewMode, setViewMode] = useState<'5-layer' | '4-phase'>('5-layer');
  const [selectedNodeId, setSelectedNodeId] = useState<TopologyNodeId | null>(null);

  // Active incident state based on live SSE stream or interactive scenario
  const activeIncident = useMemo(() => {
    if (selectedScenarioId === 'live') {
      return incident;
    }
    const scenario = TOPOLOGY_SCENARIOS.find((s) => s.id === selectedScenarioId);
    return scenario ? scenario.mockIncident : incident;
  }, [selectedScenarioId, incident]);

  const nodeStates = useMemo(() => deriveNodeStates(activeIncident), [activeIncident]);
  const phaseStates = useMemo(() => derivePhaseStates(activeIncident, nodeStates), [activeIncident, nodeStates]);
  const layerStates = useMemo(() => deriveLayerStates(nodeStates), [nodeStates]);

  const selectedNode = useMemo(
    () => TOPOLOGY_NODES.find((n) => n.id === selectedNodeId) ?? null,
    [selectedNodeId],
  );
  const selectedState = selectedNodeId ? nodeStates[selectedNodeId] : null;

  const isIncidentOpen = activeIncident && !['normal', 'closed', 'dismissed'].includes(activeIncident.status);

  const handleSelectNode = (node: TopologyNodeDefinition | TopologyNodeId) => {
    const id = typeof node === 'string' ? node : node.id;
    setSelectedNodeId(id);
  };

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
              28 Components · 5 Layers · 4 Phases
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: 'var(--muted)', maxWidth: 880 }}>
            Full-stack industrial autonomy: On-premise Gemma 3 sub-50ms edge vision &rarr; Cloud Pub/Sub &amp; BigQuery data plane &rarr; Google ADK multi-agent reasoning swarm with confidence gating &rarr; Gemini Live multimodal technician copilot &rarr; Key Invariant #3 continuous optical verification &rarr; Shift-Leader digital governance.
          </p>
        </div>

        {/* Status pill & incident jumper */}
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          {isIncidentOpen && onOpenIncident && activeIncident ? (
            <button
              id="topology-jump-incident"
              type="button"
              className="btn btn-dark btn-sm animate-pulse-glow"
              onClick={() => onOpenIncident(activeIncident.incident_id)}
              style={{ gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                warning
              </span>
              <span>
                Active Incident #{activeIncident.incident_id} · {friendlyDefectName(activeIncident.defect_type)} (
                {STATUS_LABEL[activeIncident.status]})
              </span>
            </button>
          ) : (
            <div
              className="chip chip-green row"
              style={{ fontSize: '0.78rem', padding: '6px 12px', gap: 6 }}
            >
              <span className="dot" style={{ width: 8, height: 8 }} />
              <span>Line Health Nominal · All 28 Nodes Standby</span>
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

      {/* Interactive Scenario Switcher & Layout Controls */}
      <div
        className="glass"
        style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--r-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        <div className="row between wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <span className="eyebrow" style={{ color: 'var(--ink)' }}>
              Interactive Demo Scenarios:
            </span>
            <div className="row wrap" style={{ gap: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${selectedScenarioId === 'live' ? 'btn-dark' : ''}`}
                onClick={() => {
                  setSelectedScenarioId('live');
                  onNotify?.('Switched to Live Blackboard SSE Stream', 'info');
                }}
                style={{ fontSize: '0.74rem', padding: '3px 10px' }}
              >
                <span className="dot" style={{ width: 6, height: 6, background: selectedScenarioId === 'live' ? '#10b981' : 'var(--muted)', marginRight: 5 }} />
                Live Blackboard Stream
              </button>

              {TOPOLOGY_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  className={`btn btn-sm ${selectedScenarioId === sc.id ? 'btn-dark' : ''}`}
                  onClick={() => {
                    setSelectedScenarioId(sc.id);
                    onNotify?.(`Simulating Scenario: ${sc.name}`, 'info');
                  }}
                  style={{ fontSize: '0.74rem', padding: '3px 10px' }}
                  title={sc.description}
                >
                  <span className="chip" style={{ fontSize: '0.66rem', padding: '1px 5px', marginRight: 5, background: 'rgba(255,255,255,0.2)' }}>
                    {sc.badge.split(':')[0]}
                  </span>
                  {sc.name}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
            <span className="eyebrow" style={{ fontSize: '0.72rem' }}>Layout:</span>
            <div
              className="row"
              style={{
                background: 'rgba(15,23,42,0.06)',
                padding: 2,
                borderRadius: 'var(--r-sm)',
                gap: 2,
              }}
            >
              <button
                type="button"
                className={`btn btn-sm ${viewMode === '5-layer' ? 'btn-dark' : ''}`}
                onClick={() => setViewMode('5-layer')}
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: 'none',
                }}
              >
                5-Layer Pipeline
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === '4-phase' ? 'btn-dark' : ''}`}
                onClick={() => setViewMode('4-phase')}
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: 'none',
                }}
              >
                4-Phase Swimlanes
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="row between wrap" style={{ gap: 12, alignItems: 'center', paddingTop: 4, borderTop: '1px solid rgba(15,23,42,0.05)' }}>
          <div className="row wrap" style={{ gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} /> Executing (Đang chạy)
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--green)' }} /> Verified (Hoàn tất)
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--amber)' }} /> Awaiting / Gated (Chờ bằng chứng)
            </span>
            <span className="row" style={{ gap: 4, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--hair-strong)' }} /> Standby (Sẵn sàng)
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
            Click any component or diamond decision gate to inspect technical specs, JSON telemetry, and production UI deep links.
          </div>
        </div>
      </div>

      {/* Main Graph Content */}
      <TopologyCanvas nodeStates={nodeStates}>
        {viewMode === '5-layer' ? (
          /* 5-Layer Vertical Industrial Architecture Pipeline */
          <div className="vertical-pipeline" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {TOPOLOGY_LAYERS.map((layer) => {
              const layerState = layerStates[layer.id];
              const nodesInLayer = TOPOLOGY_NODES.filter((n) => n.layer === layer.id);

              return (
                <section
                  key={layer.id}
                  id={`topology-layer-${layer.id}`}
                  data-layer={layer.id}
                  className="glass pipeline-phase"
                  style={{
                    padding: '1.1rem 1.25rem',
                    borderRadius: 'var(--r-lg)',
                    borderLeft: `5px solid ${layer.badgeColor}`,
                    background: layerState?.status === 'active'
                      ? 'rgba(255, 255, 255, 0.85)'
                      : 'var(--glass-bg)',
                    boxShadow: layerState?.status === 'active'
                      ? `0 12px 32px -8px ${layer.badgeColor}33, var(--glass-shadow)`
                      : 'var(--glass-shadow)',
                    transition: 'all 0.3s var(--ease)',
                  }}
                >
                  {/* Layer Header */}
                  <div className="row between wrap" style={{ gap: 10, marginBottom: '0.9rem', alignItems: 'center' }}>
                    <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
                      <span
                        className="chip"
                        style={{
                          background: `${layer.badgeColor}22`,
                          color: layer.badgeColor,
                          fontWeight: 750,
                          fontSize: '0.76rem',
                          padding: '3px 10px',
                        }}
                      >
                        {layer.name.split(' · ')[0]}
                      </span>
                      <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                          {layer.name.split(' · ')[1] ?? layer.name}
                        </h2>
                        <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                          {layer.subtitle}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`chip ${
                        layerState?.status === 'completed'
                          ? 'chip-green'
                          : layerState?.status === 'active'
                            ? 'chip-blue'
                            : 'chip-muted'
                      }`}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    >
                      {layerState?.status === 'completed'
                        ? 'Layer Completed'
                        : layerState?.status === 'active'
                          ? 'Active Execution'
                          : 'Standby'}
                    </span>
                  </div>

                  {/* Nodes and Gates in this Layer */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '0.85rem',
                      alignItems: 'stretch',
                    }}
                  >
                    {nodesInLayer.map((node) => {
                      if (node.isGate) {
                        return (
                          <div
                            key={node.id}
                            style={{
                              gridColumn: '1 / -1',
                              margin: '4px 0',
                            }}
                          >
                            <TopologyDecisionGate
                              node={node}
                              state={nodeStates[node.id]}
                              incident={activeIncident}
                              selected={selectedNodeId === node.id}
                              onSelect={handleSelectNode}
                            />
                          </div>
                        );
                      }

                      return (
                        <TopologyNode
                          key={node.id}
                          node={node}
                          state={nodeStates[node.id]}
                          selected={selectedNodeId === node.id}
                          onSelect={handleSelectNode}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /* 4-Phase Lifecycle Swimlanes */
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
                    {nodesInPhase.map((node) => {
                      if (node.isGate) {
                        return (
                          <TopologyDecisionGate
                            key={node.id}
                            node={node}
                            state={nodeStates[node.id]}
                            incident={activeIncident}
                            selected={selectedNodeId === node.id}
                            onSelect={handleSelectNode}
                          />
                        );
                      }
                      return (
                        <TopologyNode
                          key={node.id}
                          node={node}
                          state={nodeStates[node.id]}
                          selected={selectedNodeId === node.id}
                          onSelect={handleSelectNode}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </TopologyCanvas>

      {/* Deep-dive Node Inspection SideDrawer */}
      <TopologyNodeDrawer
        node={selectedNode}
        state={selectedState}
        incident={activeIncident}
        onClose={() => setSelectedNodeId(null)}
        onNavigateToIncident={
          activeIncident && onOpenIncident ? () => onOpenIncident(activeIncident.incident_id) : undefined
        }
        onSelectTab={onSelectTab}
      />
    </div>
  );
}
