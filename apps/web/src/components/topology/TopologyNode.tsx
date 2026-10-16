// Interactive topology node card for the 4-phase execution graph (Issue #205).
import React from 'react';
import type { TopologyNodeDefinition, TopologyNodeState } from '../../types';

interface TopologyNodeProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  selected: boolean;
  onSelect: (id: TopologyNodeDefinition['id']) => void;
}

const STATUS_CONFIG: Record<
  TopologyNodeState['status'],
  { label: string; chipClass: string; dotClass?: string; borderColor?: string; ringColor?: string }
> = {
  idle: {
    label: 'Standby',
    chipClass: 'chip-muted',
    borderColor: 'var(--glass-border)',
  },
  active: {
    label: 'Executing',
    chipClass: 'chip-blue',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(91,91,240,0.45)',
    ringColor: '0 0 0 2px rgba(91,91,240,0.25)',
  },
  waiting: {
    label: 'Awaiting Evidence',
    chipClass: 'chip-amber',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(245,165,36,0.45)',
    ringColor: '0 0 0 2px rgba(245,165,36,0.2)',
  },
  pending_approval: {
    label: 'Approval Required',
    chipClass: 'chip-amber',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(245,165,36,0.5)',
    ringColor: '0 0 0 2px rgba(245,165,36,0.25)',
  },
  done: {
    label: 'Verified',
    chipClass: 'chip-green',
    borderColor: 'rgba(18,161,80,0.35)',
  },
  error: {
    label: 'Alert',
    chipClass: 'chip-red',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(229,72,77,0.5)',
    ringColor: '0 0 0 2px rgba(229,72,77,0.25)',
  },
};

export default function TopologyNode({
  node,
  state,
  selected,
  onSelect,
}: TopologyNodeProps): React.ReactElement {
  const cfg = STATUS_CONFIG[state.status];

  return (
    <div
      id={`topology-node-${node.id}`}
      data-node-id={node.id}
      data-status={state.status}
      data-selected={selected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-label={`${node.label} (${node.tier}) - Status: ${cfg.label}. Click to inspect details.`}
      aria-expanded={selected}
      className={`glass topology-node-card ${selected ? 'topology-node-selected' : ''}`}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        padding: '0.85rem 1rem',
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        textAlign: 'left',
        outline: 'none',
        border: selected ? '2px solid var(--accent)' : `1px solid ${cfg.borderColor}`,
        boxShadow: selected
          ? '0 8px 24px -4px rgba(91,91,240,0.28), inset 0 1px 0 rgba(255,255,255,0.95)'
          : cfg.ringColor
            ? `${cfg.ringColor}, var(--glass-shadow)`
            : 'var(--glass-shadow)',
        background: selected ? 'rgba(255,255,255,0.9)' : 'var(--glass-bg)',
        transition: 'all 0.25s var(--ease)',
        minHeight: 110,
        position: 'relative',
      }}
    >
      {/* Top row: Tier badge and live status chip */}
      <div className="row between" style={{ gap: '0.5rem', width: '100%' }}>
        <span
          className="chip"
          style={{
            fontSize: '0.7rem',
            fontWeight: 650,
            padding: '2px 8px',
            background: 'rgba(15,23,42,0.06)',
            color: 'var(--ink-2)',
            borderRadius: 6,
          }}
        >
          {node.tier}
        </span>
        <span
          className={`chip ${cfg.chipClass} row`}
          style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            gap: 5,
            borderRadius: 999,
          }}
        >
          {cfg.dotClass && <span className={`dot ${cfg.dotClass}`} style={{ width: 6, height: 6 }} />}
          {state.badgeText ?? cfg.label}
        </span>
      </div>

      {/* Main row: Icon and Node identification */}
      <div className="row" style={{ gap: '0.75rem', alignItems: 'center' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: selected
              ? 'linear-gradient(145deg, var(--accent), var(--accent-2))'
              : 'rgba(15,23,42,0.06)',
            color: selected ? '#ffffff' : 'var(--ink)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            transition: 'background 0.2s var(--ease), color 0.2s var(--ease)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            {node.icon}
          </span>
        </div>
        <div className="col" style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.92rem',
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {node.label}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {node.sublabel}
          </div>
        </div>
      </div>

      {/* Summary message */}
      <div
        style={{
          fontSize: '0.78rem',
          lineHeight: 1.35,
          color: 'var(--text)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {state.summary}
      </div>

      {/* Footer tags */}
      <div className="row wrap" style={{ gap: 4, marginTop: 'auto', paddingTop: '0.2rem' }}>
        {state.isInferred && (
          <span
            className="chip"
            style={{
              fontSize: '0.66rem',
              padding: '1px 6px',
              background: 'rgba(91,91,240,0.08)',
              color: 'var(--accent)',
              borderRadius: 4,
            }}
            title="Operational state inferred from incident lifecycle without direct cloud telemetry polling"
          >
            Inferred Data Plane
          </span>
        )}
        {node.techStack.slice(0, 2).map((tech) => (
          <span
            key={tech}
            className="chip"
            style={{
              fontSize: '0.66rem',
              padding: '1px 6px',
              background: 'rgba(15,23,42,0.04)',
              color: 'var(--muted)',
              borderRadius: 4,
            }}
          >
            {tech}
          </span>
        ))}
        {node.techStack.length > 2 && (
          <span
            style={{
              fontSize: '0.66rem',
              color: 'var(--faint)',
              alignSelf: 'center',
            }}
          >
            +{node.techStack.length - 2}
          </span>
        )}
      </div>
    </div>
  );
}
