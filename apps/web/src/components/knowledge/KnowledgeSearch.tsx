// KnowledgeSearch: debounced search over verified 8D fixes and backend domain knowledge base.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { VerifiedSolution } from '../../lib/eightD';
import { fetchJson } from '../../lib/api';
import { searchVerifiedSolutions, type SearchHit } from '../../lib/knowledgeSearch';
import type { RAGSearchResult } from '../../types';

interface KnowledgeSearchProps {
  solutions: VerifiedSolution[];
  onOpenSolution: (incidentId: string) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenWalkthrough: (id: string) => void;
}

const SUGGESTIONS = [
  'Why does CNC-02 leave scratches?',
  'Spindle vibration diagnostics',
  'IM-05 cavity sink marks',
  'Honeycomb dryer maintenance',
];

const KIND: Record<SearchHit['kind'], { label: string; icon: string; cls: string }> = {
  solution: { label: 'Verified 8D fix', icon: 'verified', cls: 'chip-green' },
  sop: { label: 'KB Document', icon: 'description', cls: 'chip-accent' },
  video: { label: 'Walkthrough', icon: 'smart_display', cls: '' },
};

export default function KnowledgeSearch({
  solutions,
  onOpenSolution,
  onOpenDocument,
  onOpenWalkthrough,
}: KnowledgeSearchProps): React.ReactElement {
  const [query, setQuery] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [backendHits, setBackendHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Client-side verified 8D solutions
  const solutionHits = useMemo(
    () => (activeQuery.trim() ? searchVerifiedSolutions(activeQuery, solutions) : []),
    [activeQuery, solutions],
  );

  // Combined hits: live 8D solutions ranked above KB documents
  const allHits = useMemo(() => {
    return [...solutionHits, ...backendHits];
  }, [solutionHits, backendHits]);

  // Execute backend search with AbortController
  const executeSearch = (q: string) => {
    const trimmed = q.trim();
    setActiveQuery(trimmed);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (!trimmed) {
      setBackendHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const url = `/api/knowledge/search?q=${encodeURIComponent(trimmed)}&limit=10`;
    fetchJson<RAGSearchResult>(url, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const hits: SearchHit[] = res.citations.map((c) => ({
          kind: 'sop' as const,
          id: c.document_id,
          page: c.page_number,
          title: `${c.title}${c.page_number ? ` (p. ${c.page_number})` : ''}`,
          snippet: c.snippet,
          score: c.relevance_score,
        }));
        setBackendHits(hits);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setBackendHits([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      });
  };

  // 300ms debounce on input change
  useEffect(() => {
    if (!query.trim()) {
      executeSearch('');
      return;
    }
    const timer = window.setTimeout(() => {
      executeSearch(query);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const openHit = (h: SearchHit) => {
    if (h.kind === 'solution') {
      onOpenSolution(h.id);
    } else if (h.kind === 'sop') {
      onOpenDocument(h.id);
    } else {
      onOpenWalkthrough(h.id);
    }
  };

  const handleSuggestion = (s: string) => {
    setQuery(s);
    executeSearch(s);
  };

  return (
    <section className="glass fleet-card" aria-label="Knowledge search">
      <div className="col" style={{ gap: 10, padding: '1rem 1.25rem' }}>
        <span className="card-title">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: 'var(--accent)' }}
          >
            manage_search
          </span>
          Ask the knowledge base
        </span>
        <form
          className="row wrap"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            executeSearch(query);
          }}
        >
          <label
            className="glass-inset search-field row"
            style={{ flex: '1 1 360px', minHeight: 46 }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20, color: 'var(--faint)' }}
            >
              chat
            </span>
            <input
              id="esg-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask in plain words, e.g. “why does CNC-02 leave scratches?”"
              aria-label="Ask the knowledge base"
            />
          </label>
          <button type="submit" className="btn btn-dark" disabled={!query.trim() || loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div className="row wrap" style={{ gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="pill"
              onClick={() => handleSuggestion(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {activeQuery && (
        <div className="col">
          {loading && allHits.length === 0 ? (
            <p
              className="kpi-hint"
              style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--hair)' }}
            >
              Searching domain manuals, maintenance logs and 8D reports…
            </p>
          ) : error ? (
            <p
              className="kpi-hint tone-red"
              style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--hair)' }}
            >
              Search error: {error}
            </p>
          ) : allHits.length === 0 ? (
            <p
              className="kpi-hint"
              style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--hair)' }}
            >
              No matching fixes, manuals or logs for “{activeQuery}”.
            </p>
          ) : (
            allHits.map((h) => {
              const k = KIND[h.kind];
              return (
                <button
                  key={`${h.kind}-${h.id}-p${h.page ?? 0}`}
                  type="button"
                  className="list-row search-hit"
                  onClick={() => openHit(h)}
                >
                  <span className={`chip ${k.cls}`} style={{ flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {k.icon}
                    </span>
                    {k.label}
                  </span>
                  <span className="col" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{h.title}</span>
                    <span className="kpi-hint clamp-2">{h.snippet}</span>
                  </span>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--faint)' }}
                  >
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
