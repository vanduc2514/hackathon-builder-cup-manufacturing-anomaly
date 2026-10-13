// CausalTreeTabs: Analysis step tabs — clickable 5-Whys causal tree, Ishikawa 6M factors and supporting evidence.
import React, { useState } from 'react';
import type { AgentFinding } from '../../types';
import type { CausalChain } from '../../lib/eightD';
import { isIshikawaCategoryCausal } from '../../lib/incident';

interface CausalTreeTabsProps {
  chain: CausalChain;
  ishikawa: Record<string, string[]> | null;
  evidence: AgentFinding[];
  rcaFinding?: string;
}

type Tab = 'whys' | 'ishikawa' | 'evidence';

export default function CausalTreeTabs({ chain, ishikawa, evidence, rcaFinding }: CausalTreeTabsProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>('whys');
  const nodes = chain.nodes;
  const [selected, setSelected] = useState<number>(nodes.length);
  const ishCount = ishikawa ? Object.values(ishikawa).filter((v) => v.length > 0).length : 0;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'whys', label: '5-Whys tree', count: nodes.length },
    { id: 'ishikawa', label: 'Ishikawa 6M', count: ishCount },
    { id: 'evidence', label: 'Evidence', count: evidence.length },
  ];

  return (
    <div className="inset col" style={{ gap: 12 }}>
      <div className="seg" role="tablist" aria-label="Root cause views" style={{ alignSelf: 'flex-start' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            disabled={t.count === 0}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="mono" style={{ opacity: 0.6 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'whys' &&
        (nodes.length === 0 ? (
          <p className="placeholder">The causal chain appears as the agents report findings.</p>
        ) : (
          <>
            <ol className="why-tree" role="tree" aria-label="5-Whys causal tree">
              {nodes.map((n, i) => {
                const root = i === nodes.length - 1;
                const open = selected === n.level;
                return (
                  <li key={n.level} role="treeitem" aria-expanded={open} className={`why-node ${root ? 'why-root' : ''} ${open ? 'why-open' : ''}`}>
                    <button type="button" className="why-head" onClick={() => setSelected(open ? 0 : n.level)}>
                      <span className="why-dot mono">{root ? '★' : n.level}</span>
                      <span className="col" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <span className="why-q">
                          Why {n.level}? {n.question}
                        </span>
                        <span className="why-a">{n.answer}</span>
                      </span>
                      {root && <span className="chip chip-red">Root cause</span>}
                      <span className="material-symbols-outlined why-chevron" style={{ fontSize: 18 }}>
                        expand_more
                      </span>
                    </button>
                    {open && (
                      <div className="why-detail">
                        <span className="kpi-hint">Source: {n.source}</span>
                        {n.evidence && <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{n.evidence}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <span className="kpi-hint">
              {chain.origin === 'agent'
                ? '5-Whys supplied by the Root Cause agent.'
                : 'Built from the agents’ findings and the 8D report (the Root Cause agent sent no 5-Whys for this incident).'}
            </span>
          </>
        ))}

      {tab === 'ishikawa' && ishikawa && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {Object.entries(ishikawa).map(([cat, items]) => {
            const causal = isIshikawaCategoryCausal(cat, items, rcaFinding);
            return (
              <div key={cat} className="stat" style={{ borderColor: causal ? 'rgba(229,72,77,0.3)' : 'var(--hair)' }}>
                <span style={{ color: causal ? '#c9343a' : '#0e8a43', fontWeight: 700 }}>
                  {cat}
                  {causal ? ' · causal' : ''}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-2)' }}>{items.join('; ') || '—'}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="col" style={{ gap: 8 }}>
          {evidence.map((f, i) => (
            <div key={`${f.agent_id}-${i}`} className="stat">
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{f.agent_name}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{f.evidence}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
