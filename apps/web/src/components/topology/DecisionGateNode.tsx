// Decision Gate diamond node for 5-layer workflow architecture (Issue #211).
import React from 'react';
import type { TopologyNodeDefinition, TopologyNodeState } from '../../types';

interface DecisionGateNodeProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  selected: boolean;
  onSelect: (id: TopologyNodeDefinition['id']) => void;
}

export default function DecisionGateNode({
  node,
  state,
  selected,
  onSelect,
}: DecisionGateNodeProps): React.ReactElement {
  const isGate1 = node.id === 'decision-gate-1';

  return (
    <div className="decision-diamond-wrapper">
      <div
        id={node.id}
        data-node={node.id}
        data-node-id={node.id}
        data-status={state.status}
        data-selected={selected ? 'true' : 'false'}
        role="button"
        tabIndex={0}
        aria-label={`${node.label} - Status: ${state.status}. Click to inspect gate specifications.`}
        aria-expanded={selected}
        className={`decision-diamond-card ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.id);
          }
        }}
      >
        <div className="diamond-badge">
          <span className="material-symbols-outlined">{node.icon || 'diamond'}</span>
        </div>
        <div className="diamond-title">{node.label}</div>
        <div className="diamond-sub">{node.sublabel}</div>

        <div className="diamond-branches">
          {isGate1 ? (
            <>
              <span className="diamond-branch-pill red">NO (&lt; 0.70): Diagnostic Evidence Request</span>
              <span className="diamond-branch-pill green">YES (&ge; 0.70): Proceed to Copilot & 8D Scribe</span>
            </>
          ) : (
            <>
              <span className="diamond-branch-pill red">NO (Defect Detected): Reset Streak to 0/50 & Escalate Alarm</span>
              <span className="diamond-branch-pill green">YES (Streak &ge; 50): Certified Clean &rarr; Unlock Approval</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
