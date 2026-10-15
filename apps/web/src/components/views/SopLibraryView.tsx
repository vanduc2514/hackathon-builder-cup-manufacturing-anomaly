// SopLibraryView: Knowledge Base document catalogue (manuals, specs, logs, 8D reports).
import React, { useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import { useApi } from '../../lib/api';
import { CATEGORY_LABELS, DOCUMENT_CATEGORIES } from '../../lib/knowledge';
import type { KnowledgeDocumentMeta } from '../../types';
import SopDetailDrawer from '../knowledge/SopDetailDrawer';

interface SopLibraryViewProps {
  requestedCode?: string | number | null;
  requestedId?: string | null;
  onOpenWalkthrough: (id: string) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type SortKey = 'recent' | 'title' | 'pages';

export default function SopLibraryView({
  requestedCode,
  requestedId,
  onOpenWalkthrough,
  onNotify,
}: SopLibraryViewProps): React.ReactElement {
  const { data: documents, loading, error } = useApi<KnowledgeDocumentMeta[]>('/api/knowledge/sops');

  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('All');
  const [machine, setMachine] = useState<string>('All');
  const [sort, setSort] = useState<SortKey>('recent');

  const initialId = requestedId ?? (requestedCode != null ? String(requestedCode) : null);
  const [openDocId, setOpenDocId] = useState<string | null>(initialId);

  // Collect distinct machines across documents
  const allMachines = useMemo(() => {
    if (!documents) return [];
    const set = new Set<string>();
    for (const d of documents) {
      for (const m of d.machines) {
        set.add(m);
      }
    }
    return Array.from(set).sort();
  }, [documents]);

  const visible = useMemo(() => {
    if (!documents) return [];
    const q = query.trim().toLowerCase();
    const list = documents.filter((d) => {
      const matchCat = category === 'All' || d.category === category;
      const matchMach =
        machine === 'All' || d.machines.includes(machine) || d.machine_id === machine;
      const searchBlob = `${d.document_id} ${d.title} ${d.category} ${d.machines.join(' ')} ${d.tags.join(' ')}`.toLowerCase();
      const matchQuery = !q || searchBlob.includes(q);
      return matchCat && matchMach && matchQuery;
    });

    if (sort === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sort === 'pages') {
      return [...list].sort((a, b) => b.pages - a.pages);
    }
    // 'recent' by last_revised or effective_date descending
    return [...list].sort((a, b) => {
      const dateA = a.last_revised ?? a.effective_date ?? '';
      const dateB = b.last_revised ?? b.effective_date ?? '';
      return dateB.localeCompare(dateA);
    });
  }, [documents, query, category, machine, sort]);

  const openDoc = useMemo(() => {
    if (!documents || !openDocId) return null;
    return documents.find((d) => d.document_id === openDocId) ?? null;
  }, [documents, openDocId]);

  const exportCsv = () => {
    const rows = [
      ['document_id', 'category', 'title', 'machines', 'pages', 'last_revised', 'linked_sops'],
      ...visible.map((d) => [
        d.document_id,
        d.category,
        d.title,
        d.machines.join('; '),
        String(d.pages),
        d.last_revised ?? d.effective_date ?? '',
        d.linked_sops.join('; '),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-docs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${visible.length} knowledge documents`, 'info');
  };

  return (
    <div className="page">
      <header className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">SOP & Knowledge Library</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            {documents ? `${documents.length} verified engineering documents` : 'Loading document catalogue…'}{' '}
            · click a row for sections and citations
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="sop-export" type="button" className="btn" onClick={exportCsv} disabled={visible.length === 0}>
            <span className="material-symbols-outlined">file_download</span>
            Export CSV
          </button>
        </div>
      </header>

      <section className="glass fleet-card">
        <div className="row wrap fleet-toolbar">
          <label className="glass-inset search-field row" style={{ flex: '1 1 320px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: 'var(--faint)' }}
            >
              search
            </span>
            <input
              id="sop-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, tag, or document ID…"
              aria-label="Search documents"
            />
          </label>
          <label className="glass-inset search-field row" style={{ flex: '0 0 auto' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: 'var(--faint)' }}
            >
              filter_list
            </span>
            <select
              id="sop-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="All">All categories ({documents?.length ?? 0})</option>
              {DOCUMENT_CATEGORIES.map((c) => {
                const count = documents?.filter((d) => d.category === c).length ?? 0;
                return (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c] ?? c} ({count})
                  </option>
                );
              })}
            </select>
          </label>
          {allMachines.length > 0 && (
            <label className="glass-inset search-field row" style={{ flex: '0 0 auto' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: 'var(--faint)' }}
              >
                precision_manufacturing
              </span>
              <select
                id="sop-machine"
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
                aria-label="Filter by machine"
              >
                <option value="All">All machines</option>
                {allMachines.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="glass-inset search-field row" style={{ flex: '0 0 auto' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: 'var(--faint)' }}
            >
              sort
            </span>
            <select
              id="sop-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort documents"
            >
              <option value="recent">Recently revised</option>
              <option value="title">Document title</option>
              <option value="pages">Page count</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="col center" style={{ padding: '2.5rem', gap: 10 }}>
            <span className="material-symbols-outlined spin" style={{ fontSize: 24, color: 'var(--accent)' }}>
              sync
            </span>
            <span className="kpi-hint">Loading knowledge documents…</span>
          </div>
        ) : error ? (
          <div className="col center" style={{ padding: '2rem', gap: 8 }}>
            <span className="material-symbols-outlined tone-red" style={{ fontSize: 24 }}>
              error
            </span>
            <span className="kpi-hint tone-red">Failed to load documents: {error}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="col center" style={{ padding: '2.5rem', gap: 8 }}>
            <span className="material-symbols-outlined muted" style={{ fontSize: 24 }}>
              folder_off
            </span>
            <span className="kpi-hint">No engineering documents match the selected filters.</span>
          </div>
        ) : (
          <div className="fleet-scroll">
            <table className="fleet-table row-click">
              <thead>
                <tr>
                  <th>Document ID</th>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Machines</th>
                  <th>Pages</th>
                  <th>Revised</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr
                    key={d.document_id}
                    onClick={() => setOpenDocId(d.document_id)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenDocId(d.document_id);
                      }
                    }}
                  >
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                        {d.document_id}
                      </span>
                    </td>
                    <td>
                      <span className="chip" style={{ fontSize: '0.72rem' }}>
                        {CATEGORY_LABELS[d.category] ?? d.category}
                      </span>
                    </td>
                    <td>
                      <div className="col" style={{ gap: 2 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.title}</span>
                        {d.summary && <span className="kpi-hint clamp-1">{d.summary}</span>}
                      </div>
                    </td>
                    <td>
                      {d.machines.length > 0 ? (
                        <span className="mono" style={{ fontSize: '0.78rem' }}>
                          {d.machines.join(', ')}
                        </span>
                      ) : (
                        <span className="kpi-hint">—</span>
                      )}
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem' }}>
                        {d.pages}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                        {d.last_revised ?? d.effective_date ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openDoc && (
        <SopDetailDrawer
          document={openDoc}
          onClose={() => setOpenDocId(null)}
          onOpenWalkthrough={onOpenWalkthrough}
        />
      )}
    </div>
  );
}
