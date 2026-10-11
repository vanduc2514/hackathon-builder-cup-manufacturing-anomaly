// AgentAttribution: footer naming which agent produced a step's evidence, with confidence, citation and time.
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
    <footer className="col" style={{ gap: 6, paddingTop: 12, borderTop: '1px solid var(--hair)' }}>
      {present.map((f, i) => (
        <div key={`${f.agent_id}-${f.timestamp}-${i}`} className="row wrap" style={{ gap: '6px 14px', fontSize: '0.76rem', color: 'var(--muted)' }}>
          <span className="row" style={{ gap: 6, color: 'var(--ink)', fontWeight: 650 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>
              {agentIcon(f.agent_id, f.agent_name)}
            </span>
            {f.agent_name}
          </span>
          {f.phase && <span className="chip mono">Phase {f.phase.replace(/^phase\s+/i, '')}</span>}
          <span className="mono">{(f.confidence * 100).toFixed(1)}% conf</span>
          <span className="mono">{f.citation}</span>
          <span className="mono" style={{ marginLeft: 'auto' }}>
            {formatClock(f.timestamp)} UTC
          </span>
        </div>
      ))}
    </footer>
  );
}
