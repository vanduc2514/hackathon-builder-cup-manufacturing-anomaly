// Side drawer presenting deep-dive JTBD, tech specifications, and realtime blackboard payloads (Issue #205 & Issue #211).
import React, { useState } from 'react';
import type { DashboardTab, IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../types';
import SideDrawer from '../SideDrawer';
import { TOPOLOGY_LAYERS, TOPOLOGY_PHASES } from '../../lib/topology';
import { matchesAgentRole } from '../../lib/incident';
import { getDrawerPreviewComponent } from './drawer-previews';
import StaticPreviewSVG from './drawer-previews/StaticPreviewSVG';
import NoPreviewPlaceholder from './drawer-previews/NoPreviewPlaceholder';
import { hasStaticSvg } from './drawer-previews/svgManifest';

interface TopologyNodeDrawerProps {
  node: TopologyNodeDefinition | null;
  state: TopologyNodeState | null;
  incident: IncidentState | null;
  onClose: () => void;
  onNavigateToIncident?: () => void;
  onNavigateToTab?: (tab: DashboardTab) => void;
  onSimulateTrigger?: (nodeId: string) => void;
}

export default function TopologyNodeDrawer({
  node,
  state,
  incident,
  onClose,
  onNavigateToIncident,
  onNavigateToTab,
  onSimulateTrigger,
}: TopologyNodeDrawerProps): React.ReactElement | null {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [simulating, setSimulating] = useState(false);

  if (!node || !state) return null;

  const layer = TOPOLOGY_LAYERS.find((l) => l.id === node.layer || l.id === node.phase);
  const phase = TOPOLOGY_PHASES.find((p) => p.id === node.phase);

  const findings = incident?.findings?.filter((f) => {
    if (node.id === 'agent-qa') return matchesAgentRole(f, 'quality_inspector');
    if (node.id === 'agent-tra') return matchesAgentRole(f, 'traceability');
    if (node.id === 'agent-pa') return matchesAgentRole(f, 'process_analyst');
    if (node.id === 'agent-rca') return matchesAgentRole(f, 'root_cause');
    if (node.id === 'copilot-live') return matchesAgentRole(f, 'technician_copilot');
    if (node.id === 'agent-scribe') return matchesAgentRole(f, 'incident_scribe');
    if (node.id === 'agent-learn') return matchesAgentRole(f, 'continuous_learning');
    return false;
  }) ?? [];

  const handleCopyPayload = () => {
    const jsonStr = JSON.stringify(node.payload ?? state.details, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    });
  };

  const handleTrigger = () => {
    setSimulating(true);
    if (onSimulateTrigger) {
      onSimulateTrigger(node.id);
    }
    setTimeout(() => setSimulating(false), 1200);
  };

  const eyebrow = (
    <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      {layer ? (
        <span className={`chip ${layer.badgeColor}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          {layer.name.split('·')[0].trim()}
        </span>
      ) : phase ? (
        <span className="chip chip-blue" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Phase {phase.letter} · {phase.name}
        </span>
      ) : null}
      <span className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(15,23,42,0.06)' }}>
        {node.tier}
      </span>
      {node.isDecisionGate && (
        <span className="chip chip-purple" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Decision Gate
        </span>
      )}
    </div>
  );

  const title = (
    <div className="row" style={{ gap: '0.6rem', alignItems: 'center', minWidth: 0, flex: 1 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>
        {node.icon}
      </span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {node.label}
      </span>
    </div>
  );

  const headerActions = (
    <button
      type="button"
      className="drawer-fullscreen-btn"
      onClick={() => setIsFullscreen(!isFullscreen)}
      title={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
      aria-label={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
        {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
      </span>
    </button>
  );

  const previewComponent = getDrawerPreviewComponent(node, state, incident);

  return (
    <SideDrawer
      title={title}
      eyebrow={eyebrow}
      headerActions={headerActions}
      isFullscreen={isFullscreen}
      width={580}
      onClose={onClose}
      footer={
        <div className="row between" style={{ width: '100%', gap: 12 }}>
          {onNavigateToIncident && incident && (
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() => {
                onClose();
                onNavigateToIncident();
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                warning
              </span>
              Jump to Incident #{incident.incident_id}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Done
          </button>
        </div>
      }
    >
      <div className="col" style={{ gap: '1.25rem' }}>
        {/* Execution Status Badge Banner */}
        <div
          className="glass"
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--r-md)',
            borderLeft: `4px solid ${
              state.status === 'danger'
                ? '#dc2626'
                : state.status === 'warning'
                ? '#d97706'
                : state.status === 'active'
                ? '#4f46e5'
                : state.status === 'done'
                ? '#16a34a'
                : 'var(--muted)'
            }`,
          }}
        >
          <div className="row between" style={{ marginBottom: 4, alignItems: 'center' }}>
            <span className="eyebrow" style={{ fontSize: '0.68rem' }}>
              Realtime Node Execution State
            </span>
            <span
              className={`chip chip-sm ${
                state.status === 'danger'
                  ? 'chip-red'
                  : state.status === 'warning'
                  ? 'chip-amber'
                  : state.status === 'active'
                  ? 'chip-blue'
                  : state.status === 'done'
                  ? 'chip-green'
                  : 'chip-slate'
              }`}
            >
              {state.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 650, color: 'var(--ink)' }}>
            {state.summary}
          </div>
          {state.badgeText && (
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
              {state.badgeText}
            </div>
          )}
        </div>

        {/* Embedded Live Component Preview (TKT-061 #246) + Designer schematic
            fallback (TKT-076 / Issue #277 — AC-TOP-28b/28c). Hierarchy:
            (1) custom React preview if registered, else
            (2) static SVG from /previews/topology/<nodeId>.svg if a file
                exists for this node, else
            (3) "No preview" placeholder so the drawer layout never collapses. */}
        {(previewComponent || hasStaticSvg(node.id)) && (
          <div className="col" style={{ gap: '0.5rem' }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="eyebrow">
                {previewComponent
                  ? 'Live Component Telemetry & Verification Preview'
                  : 'Topology Schematic Preview'}
              </div>
              <span
                className={`chip chip-sm mono ${previewComponent ? 'chip-blue' : 'chip-slate'}`}
                style={{ fontSize: '0.68rem' }}
              >
                {previewComponent ? 'Interactive' : 'Static'}
              </span>
            </div>
            {previewComponent ? previewComponent : <StaticPreviewSVG nodeId={node.id} />}
          </div>
        )}
        {!previewComponent && !hasStaticSvg(node.id) && (
          <div className="col" style={{ gap: '0.5rem' }}>
            <div className="eyebrow">Topology Schematic Preview</div>
            <NoPreviewPlaceholder nodeId={node.id} />
          </div>
        )}

        {/* JTBD Section (Jobs-to-be-Done) */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <div className="eyebrow">Architecture Role &amp; JTBD (Jobs To Be Done)</div>
          <div
            className="glass"
            style={{
              padding: '0.9rem 1rem',
              borderRadius: 'var(--r-md)',
              fontSize: '0.86rem',
              lineHeight: 1.5,
              color: 'var(--ink)',
            }}
          >
            {node.jtbd}
          </div>
        </div>

        {/* Production UI Reference Deep Link Card (TKT-060 #245) */}
        {node.uiRef && (
          <div className="col" style={{ gap: '0.5rem' }}>
            <div className="eyebrow">Production UI Surface Reference</div>
            <div
              className="glass"
              style={{
                padding: '1rem',
                borderRadius: 'var(--r-md)',
                border: '1px solid rgba(91,91,240,0.25)',
                background: 'linear-gradient(180deg, rgba(244,246,255,0.7) 0%, rgba(255,255,255,0.9) 100%)',
              }}
            >
              <div className="row between" style={{ marginBottom: 8, alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700 }}>
                  {node.uiRef.surface}
                </span>
                <span className="chip chip-sm chip-blue" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                  {node.uiRef.component}
                </span>
              </div>
              <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 12 }}>
                Route: {node.uiRef.route}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  if (node.uiRef?.targetTab && onNavigateToTab) {
                    onClose();
                    onNavigateToTab(node.uiRef.targetTab);
                  } else if (onNavigateToIncident) {
                    onClose();
                    onNavigateToIncident();
                  }
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  open_in_new
                </span>
                {node.uiRef.ctaLabel}
              </button>
            </div>
          </div>
        )}

        {/* Technical Architecture & Specifications */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <div className="eyebrow">Technical Architecture &amp; Specifications</div>
          <div className="glass" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--r-md)' }}>
            <div className="col" style={{ gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                  Tier Responsibility
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {node.tierDescription}
                </div>
              </div>

              {node.sla && (
                <div className="row between" style={{ borderTop: '1px solid var(--hair)', paddingTop: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Service Level Agreement (SLA)</span>
                  <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)' }}>
                    {node.sla}
                  </span>
                </div>
              )}

              {node.channel && (
                <div className="row between" style={{ borderTop: '1px solid var(--hair)', paddingTop: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Channel / Protocol</span>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {node.channel}
                  </span>
                </div>
              )}

              {node.fallback && (
                <div className="row between" style={{ borderTop: '1px solid var(--hair)', paddingTop: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Fallback Strategy</span>
                  <span style={{ fontSize: '0.76rem', color: 'var(--ink-2)', maxWidth: '60%', textAlign: 'right' }}>
                    {node.fallback}
                  </span>
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>
                  Frameworks &amp; Protocols
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {node.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="chip"
                      style={{
                        fontSize: '0.74rem',
                        padding: '3px 9px',
                        background: 'rgba(15,23,42,0.06)',
                        color: 'var(--ink-2)',
                        fontWeight: 500,
                      }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Payload & Action Controls */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Component Runtime Payload</span>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                onClick={handleCopyPayload}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  content_copy
                </span>
                {copiedPayload ? 'Copied!' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-dark"
                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                onClick={handleTrigger}
                disabled={simulating}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  bolt
                </span>
                {simulating ? 'Simulating...' : 'Simulate Trigger'}
              </button>
            </div>
          </div>
          <div
            className="glass"
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--r-md)',
              background: '#0f172a',
              color: '#f8fafc',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            <pre className="mono" style={{ margin: 0, fontSize: '0.74rem', lineHeight: 1.5 }}>
              {JSON.stringify(node.payload ?? state.details, null, 2)}
            </pre>
          </div>
        </div>

        {/* Diagnostics Log Stream Toggle */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ justifyContent: 'space-between', width: '100%' }}
            onClick={() => setShowLogs(!showLogs)}
          >
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                terminal
              </span>
              View Live Diagnostics Log Stream
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {showLogs ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showLogs && (
            <div
              className="glass"
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--r-md)',
                background: '#090d16',
                color: '#94a3b8',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                maxHeight: 140,
                overflowY: 'auto',
              }}
            >
              <div>[10:42:01.120] INFO [topology] Component initialized: {node.id}</div>
              <div>[10:42:01.134] INFO [blackboard] Subscription stream active: status={state.status}</div>
              <div>[10:42:01.198] DEBUG [orchestrator] Route linked: {node.uiRef?.route ?? 'standalone'}</div>
              {findings.map((f, i) => (
                <div key={i} style={{ color: '#60a5fa' }}>
                  [Finding {i + 1}] {f.finding}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SideDrawer>
  );
}
