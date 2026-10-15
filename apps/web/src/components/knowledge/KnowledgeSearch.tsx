// KnowledgeSearch: ask-a-question box over verified 8D fixes, SOPs and walkthrough videos, with source-typed results.
import React, { useMemo, useState } from 'react';
import type { VerifiedSolution } from '../../lib/eightD';
import { searchKnowledge, type SearchHit } from '../../lib/knowledgeSearch';

interface KnowledgeSearchProps {
  solutions: VerifiedSolution[];
  onOpenSolution: (incidentId: string) => void;
  onOpenSop: (code: number) => void;
  onOpenWalkthrough: (id: string) => void;
}

const SUGGESTIONS = ['Why does CNC-02 leave scratches?', 'How do we fix tool wear on T07?', 'Spindle vibration after insert change', 'Moisture splay on IM-05'];

const KIND: Record<SearchHit['kind'], { label: string; icon: string; cls: string }> = {
  solution: { label: 'Verified 8D fix', icon: 'verified', cls: 'chip-green' },
  sop: { label: 'SOP', icon: 'description', cls: 'chip-accent' },
  video: { label: 'Walkthrough', icon: 'smart_display', cls: '' },
};

export default function KnowledgeSearch({ solutions, onOpenSolution, onOpenSop, onOpenWalkthrough }: KnowledgeSearchProps): React.ReactElement {
  const [query, setQuery] = useState<string>('');
  const [asked, setAsked] = useState<string>('');
  const hits = useMemo(() => searchKnowledge(asked, solutions), [asked, solutions]);

  const ask = (q: string) => {
    setQuery(q);
    setAsked(q);
  };

  const open = (h: SearchHit) => {
    if (h.kind === 'solution') onOpenSolution(h.id);
    else if (h.kind === 'sop') onOpenSop(Number(h.id));
    else onOpenWalkthrough(h.id);
  };

  return (
    <section className="glass fleet-card" aria-label="Knowledge search">
      <div className="col" style={{ gap: 10, padding: '1rem 1.25rem' }}>
        <span className="card-title">
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
            manage_search
          </span>
          Ask the knowledge base
        </span>
        <form
          className="row wrap"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            setAsked(query);
          }}
        >
          <label className="glass-inset search-field row" style={{ flex: '1 1 360px', minHeight: 46 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--faint)' }}>
              chat
            </span>
            <input
              id="esg-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask in plain words, e.g. “how did we fix scratches on CNC-02?”"
              aria-label="Ask the knowledge base"
            />
          </label>
          <button type="submit" className="btn btn-dark" disabled={!query.trim()}>
            Search
          </button>
        </form>
        <div className="row wrap" style={{ gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="pill" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {asked && (
        <div className="col">
          {hits.length === 0 ? (
            <p className="kpi-hint" style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--hair)' }}>
              No matching fixes, SOPs or videos for “{asked}”.
            </p>
          ) : (
            hits.map((h) => {
              const k = KIND[h.kind];
              return (
                <button key={`${h.kind}-${h.id}`} type="button" className="list-row search-hit" onClick={() => open(h)}>
                  <span className={`chip ${k.cls}`} style={{ flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {k.icon}
                    </span>
                    {k.label}
                  </span>
                  <span className="col" style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{h.title}</span>
                    <span className="kpi-hint clamp-2">{h.snippet}</span>
                  </span>
                  <span className="material-symbols-outlined" style={{ color: 'var(--faint)' }}>
                    chevron_right
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
