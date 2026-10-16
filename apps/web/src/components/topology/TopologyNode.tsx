// Interactive topology node card for the 5-layer workflow architecture (Issue #205 & Issue #211).
import React from 'react';
import type { TopologyNodeDefinition, TopologyNodeState } from '../../types';
import DecisionGateNode from './DecisionGateNode';

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
    chipClass: 'chip-neutral',
    borderColor: 'var(--glass-border)',
  },
  nominal: {
    label: 'Nominal',
    chipClass: 'chip-neutral',
    borderColor: 'rgba(15,23,42,0.12)',
  },
  active: {
    label: 'Active',
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
  warning: {
    label: 'Warning',
    chipClass: 'chip-amber',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(245,165,36,0.5)',
    ringColor: '0 0 0 2px rgba(245,165,36,0.25)',
  },
  danger: {
    label: 'Breach / Alarm',
    chipClass: 'chip-danger',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(229,72,77,0.5)',
    ringColor: '0 0 0 2px rgba(229,72,77,0.25)',
  },
  pending_approval: {
    label: 'Approval Required',
    chipClass: 'chip-amber',
    dotClass: 'animate-pulse-glow',
    borderColor: 'rgba(245,165,36,0.5)',
    ringColor: '0 0 0 2px rgba(245,165,36,0.25)',
  },
  locked: {
    label: 'Locked',
    chipClass: 'chip-neutral',
    borderColor: 'rgba(15,23,42,0.18)',
  },
  done: {
    label: 'Verified',
    chipClass: 'chip-green',
    borderColor: 'rgba(18,161,80,0.35)',
  },
  completed: {
    label: 'Completed',
    chipClass: 'chip-green',
    borderColor: 'rgba(18,161,80,0.35)',
  },
  error: {
    label: 'Alert',
    chipClass: 'chip-danger',
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
  if (node.isDecisionGate) {
    return <DecisionGateNode node={node} state={state} selected={selected} onSelect={onSelect} />;
  }

  const cfg = STATUS_CONFIG[state.status] || STATUS_CONFIG.idle;

  return (
    <div
      id={`node-${node.id}`}
      data-node={node.id}
      data-node-id={node.id}
      data-status={state.status}
      data-selected={selected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-label={`${node.label} (${node.tier}) - Status: ${cfg.label}. Click to inspect details.`}
      aria-expanded={selected}
      className={`node-card topology-node-card ${selected ? 'selected topology-node-selected' : ''}`}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      {/* Node Header: Icon, Name, Sublabel and Status Badge */}
      <div className="node-header">
        <div className="node-icon-title">
          <div className="node-icon-tile" aria-hidden="true">
            <span className="material-symbols-outlined">{node.icon}</span>
          </div>
          <div className="node-title-group">
            <div className="node-name" title={node.label}>
              {node.label}
            </div>
            <div className="node-sublabel" title={node.sublabel}>
              {node.sublabel}
            </div>
          </div>
        </div>
        <span
          className={`chip chip-sm ${cfg.chipClass} status-badge`}
          title={`Status: ${state.badgeText ?? cfg.label}`}
        >
          {cfg.dotClass && <span className={`dot ${cfg.dotClass}`} style={{ width: 6, height: 6 }} />}
          <span className="status-badge-text">{state.badgeText ?? cfg.label}</span>
        </span>
      </div>

      {/* JTBD / Summary */}
      <p className="node-jtbd">{state.summary || node.jtbd}</p>

      {/* Node Footer: Primary Metrics / Specs */}
      <div className="node-footer">
        <span className="node-metric">
          Tier: <b>{node.tier}</b>
        </span>
        {state.isInferred && (
          <span
            className="chip chip-sm chip-blue"
            style={{ fontSize: '10px', padding: '1px 6px' }}
            title="Operational state inferred from incident blackboard lifecycle"
          >
            Inferred
          </span>
        )}
        {node.techStack && node.techStack.length > 0 && (
          <span className="node-metric">
            <b>{node.techStack[0]}</b>
          </span>
        )}
      </div>
    </div>
  );
}
