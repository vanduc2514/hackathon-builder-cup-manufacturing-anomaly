// SopLibraryView: Knowledge Hub SOPs as a scannable table; a row opens the SOP drawer with its diff log.
import React, { useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import SopDetailDrawer, { sopCode } from '../knowledge/SopDetailDrawer';
import { SOPS, SOP_CATEGORIES, type Sop } from '../../lib/knowledge';

interface SopLibraryViewProps {
  requestedCode: number | null;
  onOpenWalkthrough: (id: string) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type SortKey = 'recent' | 'numeric';

/** The most recent AI-proposed revision is surfaced as the single action item above the table. */
const PENDING_REVIEW = SOPS[0];

export default function SopLibraryView({ requestedCode, onOpenWalkthrough, onNotify }: SopLibraryViewProps): React.ReactElement {
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<SortKey>('recent');
  const [openCode, setOpenCode] = useState<number | null>(requestedCode);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = SOPS.filter(
      (s) =>
        (category === 'All' || s.category === category) &&
        (!q || `${sopCode(s.code)} ${s.code} ${s.title} ${s.station} ${s.category}`.toLowerCase().includes(q)),
    );
    return sort === 'numeric' ? [...list].sort((a, b) => a.code - b.code) : list;
  }, [query, category, sort]);

  const open = SOPS.find((s) => s.code === openCode) ?? null;
  const latest = PENDING_REVIEW.changes[0];

  const exportCsv = () => {
    const rows = [
      ['code', 'rev', 'station', 'category', 'title', 'updated'],
      ...visible.map((s) => [sopCode(s.code), s.rev, s.station, s.category, s.title, s.updated]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sop-library-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${visible.length} procedures`, 'info');
  };

  return (
    <div className="page">
      <header className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">SOP Library</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            {SOPS.length} active procedures · click a row to see details and the change log
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="sop-export" type="button" className="btn" onClick={exportCsv}>
            <span className="material-symbols-outlined">file_download</span>
            Export CSV
          </button>
          <button id="sop-new" type="button" className="btn btn-dark" onClick={() => onNotify('Procedure authoring is not connected in this build', 'info')}>
            <span className="material-symbols-outlined">add</span>
            New Procedure
          </button>
        </div>
      </header>

      <button type="button" id="sop-review-revision" className="glass action-strip" onClick={() => setOpenCode(PENDING_REVIEW.code)}>
        <span className="chip" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}>
          Needs review
        </span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <b className="mono" style={{ color: 'var(--accent)' }}>
            {sopCode(PENDING_REVIEW.code)}
          </b>{' '}
          revised to Rev {latest.rev} · {latest.reason}
        </span>
        <span className="row" style={{ gap: 4, fontWeight: 650, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
          Review changes
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_forward
          </span>
        </span>
      </button>

      <section className="glass fleet-card">
        <div className="row wrap fleet-toolbar">
          <label className="glass-inset search-field row" style={{ flex: '1 1 320px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--faint)' }}>
              search
            </span>
            <input id="sop-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by SOP #, title or machine (CNC-02)…" aria-label="Search procedures" />
          </label>
          <label className="glass-inset search-field row" style={{ flex: '0 0 auto' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--faint)' }}>
              filter_list
            </span>
            <select id="sop-category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="All">All categories ({SOPS.length})</option>
              {SOP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({SOPS.filter((s) => s.category === c).length})
                </option>
              ))}
            </select>
          </label>
          <label className="glass-inset search-field row" style={{ flex: '0 0 auto' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--faint)' }}>
              sort
            </span>
            <select id="sop-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort procedures">
              <option value="recent">Recently updated</option>
              <option value="numeric">SOP number</option>
            </select>
          </label>
        </div>

        <div className="fleet-scroll">
          <table className="fleet-table row-click">
            <thead>
              <tr>
                <th>SOP</th>
                <th>Procedure</th>
                <th>Machine / Station</th>
                <th>Rev</th>
                <th>Updated</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((s: Sop) => (
                <tr
                  key={s.code}
                  tabIndex={0}
                  onClick={() => setOpenCode(s.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenCode(s.code);
                    }
                  }}
                  aria-label={`Open ${sopCode(s.code)} ${s.title}`}
                >
                  <td className="mono" style={{ fontWeight: 700, color: s.safety ? '#c9343a' : 'var(--accent)' }}>
                    {sopCode(s.code)}
                  </td>
                  <td style={{ whiteSpace: 'normal', minWidth: 280 }}>
                    <span className="row" style={{ gap: 6, fontWeight: 600, color: 'var(--ink)' }}>
                      {s.safety && (
                        <span className="material-symbols-outlined" title="Safety-critical" style={{ fontSize: 16, color: 'var(--red)' }}>
                          lock
                        </span>
                      )}
                      {s.title}
                    </span>
                    <span className="kpi-hint">{s.category}</span>
                  </td>
                  <td>{s.station}</td>
                  <td className="mono">{s.rev}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.updated}</td>
                  <td style={{ textAlign: 'right', color: 'var(--faint)' }}>
                    <span className="material-symbols-outlined">chevron_right</span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="kpi-hint" style={{ textAlign: 'center', padding: '2rem' }}>
                    No procedures match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <SopDetailDrawer
          sop={open}
          onClose={() => setOpenCode(null)}
          onOpenWalkthrough={onOpenWalkthrough}
          onSideLink={(sop) => onNotify(`${sop.sideLink.label} for ${sopCode(sop.code)} is not attached in this build`, 'info')}
        />
      )}
    </div>
  );
}
