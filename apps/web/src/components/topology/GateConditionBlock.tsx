// Explicit Decision Gate condition branch block, replacing text labels on the arrow (AC-TOP-26, #256).
import React from 'react';
import type { GateBlockStatus } from '../../lib/topology';
import type { GateConditionBlock as GateConditionBlockModel } from '../../types';

interface GateConditionBlockProps {
  block: GateConditionBlockModel;
  status: GateBlockStatus;
}

export default function GateConditionBlock({
  block,
  status,
}: GateConditionBlockProps): React.ReactElement {
  const isYes = block.kind === 'yes';

  return (
    <div
      id={block.id}
      data-node={block.id}
      data-gate-block={block.id}
      data-tone={block.tone}
      data-status={status}
      role="note"
      aria-label={`${isYes ? 'YES' : 'NO'} branch: ${block.label}`}
      className={`gate-condition-block tone-${block.tone} status-${status}`}
    >
      <span className="material-symbols-outlined gate-condition-icon" aria-hidden="true">
        {isYes ? 'check_circle' : 'cancel'}
      </span>
      <span className="gate-condition-label">{block.label}</span>
    </div>
  );
}
