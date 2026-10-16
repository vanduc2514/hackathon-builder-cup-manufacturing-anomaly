// Side drawer presenting deep-dive JTBD, tech specifications, production UI deep links, and realtime payloads.
import React, { useState } from 'react';
import type { DashboardTab, IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../types';
import SideDrawer from '../SideDrawer';
import { NODE_PAYLOADS, TOPOLOGY_LAYERS, TOPOLOGY_PHASES } from '../../lib/topology';
import { matchesAgentRole } from '../../lib/incident';

interface TopologyNodeDrawerProps {
  node: TopologyNodeDefinition | null;
  state: TopologyNodeState | null;
  incident: IncidentState | null;
  onClose: () => void;
  onNavigateToIncident?: () => void;
  onSelectTab?: (tab: DashboardTab) => void;
}

export default function TopologyNodeDrawer({
  node,
  state,
  incident,
  onClose,
  onNavigateToIncident,
  onSelectTab,
}: TopologyNodeDrawerProps): React.ReactElement | null {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [showJsonRaw, setShowJsonRaw] = useState(false);

  if (!node || !state) return null;

  const layer = TOPOLOGY_LAYERS.find((l) => l.id === node.layer);
  const phase = TOPOLOGY_PHASES.find((p) => p.id === node.phase);
  const payload = NODE_PAYLOADS[node.id];

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
    if (!payload) return;
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleDeepLinkClick = () => {
    if (!node.uiRef) return;
    if (node.uiRef.targetTab) {
      onSelectTab?.(node.uiRef.targetTab);
    }
    if (node.uiRef.incidentTarget || node.uiRef.targetTab === 'incident-detail') {
      onNavigateToIncident?.();
    }
    onClose();
  };

  const eyebrow = (
    <div className="row wrap" style={{ gap: '0.4rem', alignItems: 'center' }}>
      <span className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px', background: layer?.badgeColor ? `${layer.badgeColor}22` : undefined, color: layer?.badgeColor || 'var(--accent)' }}>
        {layer?.name.split(' · ')[0] ?? node.layer}
      </span>
      {phase && (
        <span className="chip chip-blue" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Phase {phase.letter} · {phase.name}
        </span>
      )}
      <span className="chip" style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(15,23,42,0.06)' }}>
        {node.tier}
      </span>
      {node.isGate && (
        <span className="chip chip-amber" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Decision Gateway
        </span>
      )}
    </div>
  );

  const title = (
    <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>
        {node.icon}
      </span>
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 650, color: 'var(--ink)' }}>{node.label}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 400 }}>{node.sublabel}</div>
      </div>
    </div>
  );

  return (
    <SideDrawer
      title={title}
      eyebrow={eyebrow}
      width={600}
      onClose={onClose}
      footer={
        <div className="row between" style={{ width: '100%', gap: 12 }}>
          {node.uiRef && (
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={handleDeepLinkClick}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                open_in_new
              </span>
              {node.uiRef.ctaLabel}
            </button>
          )}
          {onNavigateToIncident && incident && !node.uiRef && (
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
              state.status === 'done'
                ? 'var(--green)'
                : state.status === 'active'
                  ? 'var(--accent)'
                  : state.status === 'waiting' || state.status === 'pending_approval'
                    ? 'var(--amber)'
                    : state.status === 'error'
                      ? 'var(--red)'
                      : 'var(--muted)'
            }`,
          }}
        >
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="eyebrow">Realtime Execution Status</span>
            <span
              className={`chip ${
                state.status === 'done'
                  ? 'chip-green'
                  : state.status === 'active'
                    ? 'chip-blue'
                    : state.status === 'waiting' || state.status === 'pending_approval'
                      ? 'chip-amber'
                      : state.status === 'error'
                        ? 'chip-red'
                        : 'chip-muted'
              }`}
            >
              {state.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }}>
            {state.summary}
          </div>

          {/* Node Metrics Chips if available */}
          {node.metrics && node.metrics.length > 0 && (
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              {node.metrics.map((m) => (
                <div
                  key={m.label}
                  className="glass"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '0.75rem',
                    background: 'rgba(255,255,255,0.7)',
                  }}
                >
                  <span style={{ color: 'var(--muted)', marginRight: 5 }}>{m.label}:</span>
                  <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{m.value}</span>
                </div>
              ))}
            </div>
          )}
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
              Inferred from Incident State (Dữ liệu suy ra từ trạng thái sự cố)
            </div>
            To preserve shop-floor bandwidth and guarantee &lt;50ms response times before pneumatic diverters,
            the edge classifier and ingestion data plane run strictly on-premise without polling cloud APIs.
            Their status is derived from reactive blackboard transitions.
          </div>
        )}

        {/* Actual UI Reference (Production Deep Link Card) */}
        {node.uiRef && (
          <div className="col" style={{ gap: '0.5rem' }}>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>
                visibility
              </span>
              Actual UI Reference (Production Deep Link)
            </div>
            <div
              className="glass"
              style={{
                padding: '1rem',
                borderRadius: 'var(--r-md)',
                border: '1px solid rgba(91,91,240,0.25)',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(240,244,255,0.5) 100%)',
              }}
            >
              <div className="row between wrap" style={{ gap: 8, marginBottom: 8 }}>
                <span
                  className="chip chip-blue"
                  style={{ fontSize: '0.74rem', fontWeight: 600, padding: '3px 8px' }}
                >
                  {node.uiRef.surface}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'rgba(15,23,42,0.05)', padding: '2px 8px', borderRadius: 4 }}
                >
                  {node.uiRef.route}
                </span>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 650,
                  color: 'var(--ink)',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
                  code
                </span>
                {node.uiRef.component}
              </div>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text)',
                  lineHeight: 1.45,
                  margin: '0 0 12px 0',
                }}
              >
                {node.uiRef.previewDescription}
              </p>
              <button
                type="button"
                className="btn btn-dark btn-sm"
                onClick={handleDeepLinkClick}
                style={{ width: '100%', justifyContent: 'center', gap: 8 }}
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
          <div className="eyebrow">Technical Architecture & SLAs</div>
          <div className="glass" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--r-md)' }}>
            <div className="col" style={{ gap: '0.75rem' }}>
              {node.sla && (
                <div className="row between" style={{ fontSize: '0.8rem', paddingBottom: 6, borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                  <span style={{ color: 'var(--muted)' }}>Latency SLA:</span>
                  <span className="mono" style={{ fontWeight: 650, color: 'var(--accent)' }}>{node.sla}</span>
                </div>
              )}
              {node.channel && (
                <div className="row between" style={{ fontSize: '0.8rem', paddingBottom: 6, borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                  <span style={{ color: 'var(--muted)' }}>Pub/Sub & Event Channel:</span>
                  <span className="mono" style={{ fontWeight: 550, color: 'var(--ink)', fontSize: '0.74rem' }}>{node.channel}</span>
                </div>
              )}
              {node.fallback && (
                <div className="row between" style={{ fontSize: '0.8rem', paddingBottom: 6, borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                  <span style={{ color: 'var(--muted)' }}>Fallback Strategy:</span>
                  <span style={{ fontWeight: 550, color: 'var(--ink)' }}>{node.fallback}</span>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                  Tier Responsibility
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {node.tierDescription}
                </div>
              </div>
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

        {/* Extracted Blackboard Payloads */}
        <div className="col" style={{ gap: '0.5rem' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Blackboard State & Telemetry</span>
            {payload && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowJsonRaw(!showJsonRaw)}
                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              >
                {showJsonRaw ? 'Show Key-Value' : 'Show Raw JSON'}
              </button>
            )}
          </div>

          {!showJsonRaw ? (
            <div
              className="glass"
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--r-md)',
                overflow: 'hidden',
              }}
            >
              <div className="col" style={{ gap: 2 }}>
                {Object.entries(state.details).map(([key, val]) => (
                  <div
                    key={key}
                    className="row between"
                    style={{
                      padding: '0.45rem 0.6rem',
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      background: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {key}
                    </span>
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>
                      {val === null || val === undefined
                        ? '—'
                        : Array.isArray(val)
                          ? val.join(', ')
                          : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="glass"
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--r-md)',
                background: 'rgba(15,23,42,0.92)',
                color: '#f8fafc',
                position: 'relative',
              }}
            >
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Live Payload (JSON)
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleCopyPayload}
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                  }}
                >
                  {copiedPayload ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: '0.76rem',
                  lineHeight: 1.45,
                  overflowX: 'auto',
                  maxHeight: 280,
                  color: '#38bdf8',
                }}
              >
                {JSON.stringify(payload ?? state.details, null, 2)}
              </pre>
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
