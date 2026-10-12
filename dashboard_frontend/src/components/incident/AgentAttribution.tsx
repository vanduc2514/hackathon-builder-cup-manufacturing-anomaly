// AgentAttribution: collapsed "agent trail" naming which agent produced a step's evidence, with confidence, source and time.
import React from 'react';
import type { AgentFinding } from '../../types';
import { agentIcon, formatClock } from '../../lib/incident';

interface AgentAttributionProps {
  findings: (AgentFinding | undefined)[];
}

export default function AgentAttribution({ findings }: AgentAttributionProps): React.ReactElement | null {
  const present = findings.filter((f): f is AgentFinding => Boolean(f));
  if (present.length === 0) return null;
  return (
    <details className="agent-trail">
      <summary className="row" style={{ gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          smart_toy
        </span>
        Agent trail ({present.length})
        <span className="material-symbols-outlined agent-trail-chevron" style={{ fontSize: 16 }}>
          expand_more
        </span>
      </summary>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        {present.map((f, i) => (
          <div key={`${f.agent_id}-${f.timestamp}-${i}`} className="row wrap" style={{ gap: '4px 12px', fontSize: '0.74rem', color: 'var(--muted)' }}>
            <span className="row" style={{ gap: 6, color: 'var(--ink)', fontWeight: 650 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>
                {agentIcon(f.agent_id, f.agent_name)}
              </span>
              {f.agent_name}
            </span>
            <span className="mono">{(f.confidence * 100).toFixed(0)}% confidence</span>
            <span className="mono" style={{ flex: '1 1 200px', minWidth: 0 }}>
              {f.citation}
            </span>
            <span className="mono">{formatClock(f.timestamp)} UTC</span>
          </div>
        ))}
      </div>
    </details>
  );
}
