// StreakInvariantPreview: Live Invariant #3 verification streak & reset indicator for TopologyNodeDrawer (TKT-061 #246)
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

interface StreakInvariantPreviewProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident: IncidentState | null;
}

export default function StreakInvariantPreview({
  node: _node,
  state: _state,
  incident,
}: StreakInvariantPreviewProps): React.ReactElement {
  const count = incident?.verification_count ?? 42;
  const target = incident?.verification_target ?? 50;
  const pct = Math.min(100, Math.round((count / Math.max(1, target)) * 100));
  const isApproved = count >= target;
  const isResetNode = _node.id === 'streak-reset';

  return (
    <div
      className="glass"
      style={{
        padding: '1rem',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%)',
        border: `1px solid ${isResetNode ? 'rgba(239, 68, 68, 0.35)' : 'rgba(99,102,241,0.22)'}`,
      }}
      aria-label="Embedded Invariant 3 Verification Streak"
    >
      <div className="row between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: isResetNode ? '#dc2626' : isApproved ? '#16a34a' : 'var(--accent)' }}
          >
            {isResetNode ? 'emergency_home' : isApproved ? 'verified' : 'verified_user'}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            Invariant #3 · Post-Repair Verification Streak
          </span>
        </div>
        <span
          className={`chip chip-sm ${isResetNode ? 'chip-red' : isApproved ? 'chip-green' : 'chip-blue'}`}
          style={{ fontSize: '0.7rem' }}
        >
          {isResetNode ? 'RESET TO 0/50' : `${count} / ${target} Clean Parts`}
        </span>
      </div>

      {/* Progress Bar & KPI */}
      <div style={{ marginBottom: 10 }}>
        <div className="row between" style={{ fontSize: '0.74rem', marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)' }}>Conveyor Defect-Free Counter</span>
          <span className="mono" style={{ fontWeight: 700, color: isResetNode ? '#dc2626' : '#16a34a' }}>
            {pct}% ({count}/{target})
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: 'rgba(15,23,42,0.08)',
            borderRadius: 9999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: isResetNode
                ? '#ef4444'
                : 'linear-gradient(90deg, #10b981, #059669)',
              borderRadius: 9999,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* 50-Part Matrix (compact grid of 2 rows x 25 dots) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(25, 1fr)',
          gap: 3,
          padding: '8px 10px',
          background: 'rgba(15,23,42,0.03)',
          borderRadius: 8,
          marginBottom: 10,
        }}
        aria-label="50 consecutive part verification matrix"
      >
        {Array.from({ length: target }).map((_, idx) => {
          const isDone = idx < count;
          return (
            <div
              key={idx}
              style={{
                height: 8,
                borderRadius: 2,
                background: isResetNode && idx === count ? '#ef4444' : isDone ? '#10b981' : 'rgba(15,23,42,0.12)',
              }}
              title={`Part #${idx + 1}: ${isDone ? 'Verified Clean' : 'Pending'}`}
            />
          );
        })}
      </div>

      {/* Strict Law Callout */}
      <div
        style={{
          padding: '6px 8px',
          borderRadius: 6,
          background: isResetNode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.06)',
          fontSize: '0.72rem',
          lineHeight: 1.4,
          color: isResetNode ? '#991b1b' : 'var(--text)',
        }}
      >
        <strong>Strict Product Evidence Law:</strong> Shift leader approval remains locked until 50 consecutive defect-free parts pass exit conveyor. Any defect immediately resets streak to 0/50.
      </div>
    </div>
  );
}
