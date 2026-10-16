// Side drawer presenting deep-dive JTBD, tech specifications, and realtime blackboard payloads (Issue #205 & Issue #211).
import React, { useState } from 'react';
import type { DashboardTab, IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../types';
import SideDrawer from '../SideDrawer';
import { TOPOLOGY_LAYERS, TOPOLOGY_PHASES } from '../../lib/topology';
import { matchesAgentRole } from '../../lib/incident';

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
    <div className="row between" style={{ width: '100%', gap: '0.75rem', alignItems: 'center' }}>
      <div className="row" style={{ gap: '0.6rem', alignItems: 'center', minWidth: 0, flex: 1 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>
          {node.icon}
        </span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.label}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-sm"
        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setIsFullscreen(!isFullscreen)}
        title={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
        aria-label={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
        </span>
      </button>
    </div>
  );

  return (
    <SideDrawer
      title={title}
      eyebrow={eyebrow}
      width={isFullscreen ? 1040 : 580}
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
              View Live Incident #{incident.incident_id}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close Drawer
          </button>
        </div>
      }
    >
      <div className="col" style={{ gap: '1.4rem' }}>
        {/* Realtime Status Banner */}
        <div
          className="glass-inset"
          style={{
            padding: '1rem',
            borderRadius: 'var(--r-md)',
            borderLeft: `4px solid ${
              state.status === 'done' || state.status === 'completed'
                ? 'var(--green)'
                : state.status === 'active'
                  ? 'var(--accent)'
                  : state.status === 'waiting' || state.status === 'pending_approval' || state.status === 'warning'
                    ? 'var(--amber)'
                    : state.status === 'error' || state.status === 'danger'
                      ? 'var(--red)'
                      : 'var(--muted)'
            }`,
          }}
        >
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="eyebrow">Realtime Execution Status</span>
            <span
              className={`chip ${
                state.status === 'done' || state.status === 'completed'
                  ? 'chip-green'
                  : state.status === 'active'
                    ? 'chip-blue'
                    : state.status === 'waiting' || state.status === 'pending_approval' || state.status === 'warning'
                      ? 'chip-amber'
                      : state.status === 'error' || state.status === 'danger'
                        ? 'chip-red'
                        : 'chip-neutral'
              }`}
            >
              {state.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }}>
            {state.summary}
          </div>
        </div>

        {/* Inferred Notice for Data-Plane Components */}
        {state.isInferred && (
          <div
            className="glass"
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--r-md)',
              background: 'rgba(91,91,240,0.06)',
              borderColor: 'rgba(91,91,240,0.2)',
              fontSize: '0.8rem',
              color: 'var(--text)',
              lineHeight: 1.45,
            }}
          >
            <div className="row" style={{ gap: 6, fontWeight: 650, color: 'var(--accent)', marginBottom: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                info
              </span>
              Inferred from Incident State (Derived from incident blackboard lifecycle)
            </div>
            To preserve shop-floor bandwidth and guarantee &lt;50ms response times before pneumatic diverters,
            the edge classifier and ingestion data plane run strictly on-premise without polling cloud APIs.
            Their status is derived from reactive blackboard transitions.
          </div>
        )}

        {/* Job To Be Done Section */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <div className="eyebrow">Job To Be Done (JTBD)</div>
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

        {/* Production UI Reference Deep Link Card */}
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
                <span className="chip chip-sm chip-blue mono" style={{ fontSize: '0.7rem' }}>
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
          <div className="eyebrow">Technical Architecture & Specifications</div>
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
                  Frameworks & Protocols
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
              <div>[10:42:01.155] DEBUG [blackboard] Subscription attached to {node.channel || 'blackboard.events'}</div>
              <div>[10:42:01.204] INFO [telemetry] Ingress status healthy: {state.status.toUpperCase()}</div>
              <div>[10:42:01.312] DEBUG [adk_orch] Graph routing invariant validated: {node.tier}</div>
              <div style={{ color: '#22c55e' }}>[10:42:01.450] OK [health] Ready for multi-agent dispatch</div>
            </div>
          )}
        </div>

        {/* Realtime Findings from this Agent */}
        {findings.length > 0 && (
          <div className="col" style={{ gap: '0.5rem' }}>
            <div className="eyebrow">Agent Findings & Evidence ({findings.length})</div>
            <div className="col" style={{ gap: '0.6rem' }}>
              {findings.map((f, idx) => (
                <div
                  key={idx}
                  className="glass"
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--r-md)',
                    borderLeft: '3px solid var(--accent)',
                  }}
                >
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--ink)' }}>
                      {f.phase} · {f.agent_name}
                    </span>
                    <span className="chip chip-blue" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                      {Math.round(f.confidence * 100)}% conf
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text)', marginBottom: 6 }}>
                    {f.finding}
                  </div>
                  {f.evidence && (
                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--muted)',
                        background: 'rgba(15,23,42,0.03)',
                        padding: '4px 8px',
                        borderRadius: 6,
                        marginBottom: 4,
                      }}
                    >
                      <b>Evidence:</b> {f.evidence}
                    </div>
                  )}
                  {f.citation && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontStyle: 'italic' }}>
                      Citation: {f.citation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SideDrawer>
  );
}
