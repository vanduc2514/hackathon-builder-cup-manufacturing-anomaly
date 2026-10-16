// Decision diamond component for confidence and verification gates (Issue #211).
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../types';

interface TopologyDecisionGateProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident?: IncidentState | null;
  selected?: boolean;
  onSelect: (node: TopologyNodeDefinition) => void;
}

export default function TopologyDecisionGate({
  node,
  state,
  incident,
  selected = false,
  onSelect,
}: TopologyDecisionGateProps): React.ReactElement {
  const isConfidenceGate = node.id === 'decision-gate-1';
  const isVerificationGate = node.id === 'decision-gate-2' || node.id === 'gatekeeper-qa';

  const verificationCount = incident?.verification_count ?? 0;
  const verificationTarget = incident?.verification_target ?? 50;
  const progressPct = Math.min(100, Math.round((verificationCount / verificationTarget) * 100));

  return (
    <div
      className={`decision-diamond-wrapper ${selected ? 'selected' : ''}`}
      style={{
        margin: '12px auto',
        width: '100%',
        maxWidth: 620,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        id={node.id}
        data-node={node.id}
        data-node-id={node.id}
        className={`decision-diamond-card ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(node)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node);
          }
        }}
        style={{
          width: '100%',
          cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          border: selected
            ? '2px solid var(--accent)'
            : state.status === 'active'
              ? '2px solid var(--accent)'
              : state.status === 'done'
                ? '2px solid var(--green)'
                : '1.5px solid rgba(91, 91, 240, 0.35)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 20px',
          boxShadow: selected
            ? '0 0 0 4px rgba(91, 91, 240, 0.25), 0 12px 28px rgba(91, 91, 240, 0.18)'
            : '0 4px 20px rgba(91, 91, 240, 0.1)',
          transition: 'all 0.2s ease',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          className="row between"
          style={{
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div
            className="row"
            style={{
              gap: 8,
              alignItems: 'center',
              margin: '0 auto',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 20,
                color: 'var(--accent)',
                background: 'rgba(91, 91, 240, 0.1)',
                padding: '4px',
                borderRadius: '50%',
              }}
            >
              {node.icon || 'diamond'}
            </span>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {node.label}
            </span>
          </div>

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
            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
          >
            {state.status.toUpperCase()}
          </span>
        </div>

        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--muted)',
            marginBottom: 10,
            lineHeight: 1.4,
          }}
        >
          {node.sublabel}
        </div>

        {/* Verification streak gauge for Gate 2 */}
        {isVerificationGate && incident && (
          <div
            className="streak-gauge-card"
            style={{
              background: 'rgba(244, 246, 255, 0.85)',
              border: '1px solid rgba(91, 91, 240, 0.2)',
              borderRadius: 'var(--r-sm)',
              padding: '8px 12px',
              margin: '8px 0 12px 0',
              textAlign: 'left',
            }}
          >
            <div className="row between" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Invariant #3 Proof Streak</span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {verificationCount} / {verificationTarget} Clean Parts ({progressPct}%)
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: 'rgba(15,23,42,0.08)',
                borderRadius: 'var(--r-full)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: progressPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--accent), #10b981)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Branch Pills */}
        <div
          className="row wrap"
          style={{
            gap: 8,
            justifyContent: 'center',
            paddingTop: 8,
            borderTop: '1px dashed rgba(15, 23, 42, 0.12)',
          }}
        >
          {isConfidenceGate && (
            <>
              <span
                className="chip chip-red"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                NO (&lt; 0.70): Diagnostic Evidence Request
              </span>
              <span
                className="chip chip-green"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                YES (&ge; 0.70): Proceed to Copilot &amp; Scribe
              </span>
            </>
          )}

          {isVerificationGate && (
            <>
              <span
                className="chip chip-red"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                NO (Defect Detected): Reset Streak to 0/50 &amp; Escalate
              </span>
              <span
                className="chip chip-green"
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 10px',
                  fontWeight: 600,
                }}
              >
                YES (Streak &ge; 50): Certified Clean &rarr; Unlock Sign-Off
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
