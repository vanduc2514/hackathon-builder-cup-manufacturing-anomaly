// SopLibraryView: Knowledge Hub SOP runbooks — action banner, searchable/filterable cards, AR runbooks and compliance footer.
import React, { useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import SopCard from '../knowledge/SopCard';
import { SOPS, SOP_CATEGORIES, type Sop } from '../../lib/knowledge';

interface SopLibraryViewProps {
  onOpenWalkthrough: (id: string) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type SortKey = 'recent' | 'numeric';

const sopId = (s: Sop) => `sop-${s.code}`;

export default function SopLibraryView({ onOpenWalkthrough, onNotify }: SopLibraryViewProps): React.ReactElement {
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('All');
  const [sort, setSort] = useState<SortKey>('recent');
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = SOPS.filter(
      (s) =>
        (category === 'All' || s.category === category) &&
        (!q || `sop #${s.code} ${s.title} ${s.summary} ${s.tags.map((t) => t.label).join(' ')}`.toLowerCase().includes(q)),
    );
    return sort === 'numeric' ? [...list].sort((a, b) => a.code - b.code) : list;
  }, [query, category, sort]);

  const launch = (sop: Sop) => {
    if (sop.walkthroughId) onOpenWalkthrough(sop.walkthroughId);
    else onNotify(`No guided walkthrough is recorded for SOP #${sop.code} yet`, 'info');
  };

  const reviewRevision = () => {
    setCategory('All');
    setQuery('');
    window.setTimeout(() => {
      document.getElementById(sopId(SOPS[0]))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(SOPS[0].code);
      window.setTimeout(() => setHighlight(null), 2200);
    }, 50);
  };

  const exportCsv = () => {
    const rows = [['code', 'rev', 'category', 'title', 'updated'], ...visible.map((s) => [`SOP #${s.code}`, s.rev, s.category, s.title, s.updated])];
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
      <header className="row between wrap" style={{ gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span className="chip chip-accent" style={{ color: 'var(--ink)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>
                menu_book
              </span>
              Knowledge Hub
            </span>
            <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>• {SOPS.length} active procedures</span>
          </div>
          <h1 className="page-title">SOP Library</h1>
          <p className="muted" style={{ fontSize: '0.88rem', marginTop: 4, maxWidth: 620 }}>
            Auto-vectorized technical runbooks, machine calibration procedures, and AI-verified countermeasures across operational lines.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="sop-audit" type="button" className="btn" onClick={() => onNotify('Audit matrix is not connected in this build', 'info')}>
            <span className="material-symbols-outlined">fact_check</span>
            Audit Matrix
          </button>
          <button id="sop-export" type="button" className="btn" onClick={exportCsv}>
            <span className="material-symbols-outlined">file_download</span>
            Export (CSV)
          </button>
          <button id="sop-new" type="button" className="btn btn-dark" onClick={() => onNotify('Procedure authoring is not connected in this build', 'info')}>
            <span className="material-symbols-outlined">add</span>
            New Procedure
          </button>
        </div>
      </header>

      <section className="glass row between wrap" style={{ padding: '1.2rem 1.4rem', gap: 16, borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start', flex: '1 1 520px' }}>
          <span style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
              precision_manufacturing
            </span>
          </span>
          <div className="col" style={{ gap: 4 }}>
            <div className="row wrap mono" style={{ gap: 8, fontSize: '0.74rem' }}>
              <span className="chip" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontFamily: 'var(--font-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Action Required
              </span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>SOP #209</span>
              <span style={{ color: 'var(--faint)' }}>//</span>
              <span className="row" style={{ gap: 5, color: 'var(--text)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--red)' }} />
                Linked Incident: <strong>INC-A389F1</strong>
              </span>
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 650, letterSpacing: '-0.02em' }}>
              CNC-02 Spindle Damper Zero-Set &amp; Dynamic Balancing
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
              AI-assisted parameter revision generated from Root Cause 8D investigation. Spindle radial harmonic runout tolerance tightened from{' '}
              <span className="mono" style={{ color: '#c9343a', fontWeight: 700 }}>
                ±0.004mm
              </span>{' '}
              to{' '}
              <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                ±0.0015mm
              </span>
              .
            </p>
            {showDiff && (
              <pre className="mono" style={{ marginTop: 6, padding: '0.6rem 0.8rem', borderRadius: 10, background: 'rgba(240,242,255,0.85)', fontSize: '0.76rem', lineHeight: 1.6 }}>
                <span style={{ color: '#c9343a' }}>- radial_runout_tolerance_mm: 0.004{'\n'}</span>
                <span style={{ color: '#0e8a43' }}>+ radial_runout_tolerance_mm: 0.0015{'\n'}</span>
                <span style={{ color: '#0e8a43' }}>+ pre_run_check: laser_auto_offset   # 8D-INC-A389F1</span>
              </pre>
            )}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button id="sop-diff-log" type="button" className="btn" aria-expanded={showDiff} onClick={() => setShowDiff((v) => !v)}>
            <span className="material-symbols-outlined">{showDiff ? 'visibility_off' : 'visibility'}</span>
            Diff Log
          </button>
          <button id="sop-review-revision" type="button" className="btn btn-accent" onClick={reviewRevision}>
            Review Revised Tolerances
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </section>

      <div className="row between wrap" style={{ gap: 12 }}>
        <label className="glass row search-field" style={{ flex: '1 1 420px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)' }}>
            search
          </span>
          <input
            id="sop-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search procedures by title, machine code (CNC-02), tag…"
            aria-label="Search procedures"
          />
          {query && (
            <button type="button" className="link-btn muted" onClick={() => setQuery('')} aria-label="Clear search">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                close
              </span>
            </button>
          )}
        </label>
        <label className="glass row search-field" style={{ flex: '0 0 auto', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--muted)' }}>
            sort
          </span>
          <select id="sop-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort procedures">
            <option value="recent">Recently Updated</option>
            <option value="numeric">Numerical Index</option>
          </select>
        </label>
      </div>

      <div className="row wrap" style={{ gap: 6 }} role="tablist" aria-label="Procedure categories">
        {['All', ...SOP_CATEGORIES].map((c) => {
          const count = c === 'All' ? SOPS.length : SOPS.filter((s) => s.category === c).length;
          const on = category === c;
          return (
            <button key={c} type="button" role="tab" aria-selected={on} className={`pill ${on ? 'pill-on' : ''}`} onClick={() => setCategory(c)}>
              {c === 'All' ? 'All Procedures' : c} ({count})
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))' }}>
          {visible.map((s) => (
            <div key={s.code} id={sopId(s)} className={highlight === s.code ? 'flash-ring' : undefined} style={{ display: 'flex', borderRadius: 'var(--r-lg)' }}>
              <SopCard
                sop={s}
                onLaunch={launch}
                onSideLink={(sop) => onNotify(`${sop.sideLink.label} for SOP #${sop.code} is not attached in this build`, 'info')}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="glass col" style={{ padding: '2.5rem', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
            search_off
          </span>
          No procedures match “{query}”.
        </div>
      )}

      <section className="glass grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', padding: '1.6rem', gap: '1.6rem', alignItems: 'center' }}>
        <div className="col" style={{ gap: 12 }}>
          <span className="chip chip-accent" style={{ alignSelf: 'flex-start', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.64rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              view_in_ar
            </span>
            Spatial Engineering Engine
          </span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>Spatial Runbook AR Walkthroughs</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.55 }}>
            Field technicians on Line-01 can overlay 3D holographic step indicators directly onto CNC tooling heads using paired optical tablets or AR visors.
          </p>
          {[
            { icon: 'check_circle', title: 'Sub-Millimeter Step Guidance', sub: 'Real-time torque wrench sync over Bluetooth Mesh' },
            { icon: 'bolt', title: 'Automatic Zero-Error Capture', sub: 'Computer vision verification stamps ISO sign-off' },
          ].map((f) => (
            <div key={f.title} className="row" style={{ gap: 12, padding: '0.7rem 0.9rem', borderRadius: 12, background: 'rgba(240,242,255,0.75)' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>
                {f.icon}
              </span>
              <div className="col">
                <span style={{ fontWeight: 650, fontSize: '0.9rem' }}>{f.title}</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{f.sub}</span>
              </div>
            </div>
          ))}
          <div className="row" style={{ gap: 12, marginTop: 4 }}>
            <button id="sop-launch-simulator" type="button" className="btn btn-dark" onClick={() => onOpenWalkthrough('MW-08')}>
              <span className="material-symbols-outlined">play_circle</span>
              Launch Simulator
            </button>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>Compatible with Lumina Slate Tab v2</span>
          </div>
        </div>
        <figure style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', aspectRatio: '4 / 3', background: '#0b1220' }}>
          <img src="/knowledge/sop-ar-feed.jpg" alt="Technician tablet showing an AR runbook overlay beside a CNC machining center" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <figcaption className="glass glass-strong row between" style={{ position: 'absolute', left: 14, right: 14, bottom: 14, padding: '0.6rem 0.9rem', borderRadius: 14 }}>
            <span className="col">
              <span className="row" style={{ gap: 6, fontSize: '0.8rem', fontWeight: 650 }}>
                <span className="animate-pulse-glow" style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
                Active Runbook Feed // Spindle Head 01-A
              </span>
              <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                Target Bearing Tolerance 0.0015mm
              </span>
            </span>
            <span className="chip mono">FPS: 60.0</span>
          </figcaption>
        </figure>
      </section>

      <footer className="glass row between wrap" style={{ padding: '1rem 1.4rem', gap: 12 }}>
        <div className="row wrap" style={{ gap: 14, fontSize: '0.84rem' }}>
          <span className="row" style={{ gap: 6, fontWeight: 700, fontSize: '1rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />
            {SOPS.length} Active Procedures
          </span>
          <span className="row" style={{ gap: 5, color: 'var(--text)', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>
              verified
            </span>
            100% OSHA &amp; ISO-9001 Compliant
          </span>
          <span style={{ color: 'var(--muted)' }}>
            First-Pass Adherence: <strong style={{ color: 'var(--ink)' }}>94.2%</strong>
          </span>
        </div>
        <span className="chip chip-accent">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            event_repeat
          </span>
          2 scheduled for Q2 review
        </span>
      </footer>
    </div>
  );
}
