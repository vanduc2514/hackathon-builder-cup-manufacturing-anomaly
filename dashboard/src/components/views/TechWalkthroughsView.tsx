// TechWalkthroughsView: Knowledge Hub video guides — featured player, searchable/filterable library, watchlist and recertification.
import React, { useEffect, useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import WalkthroughPlayer from '../knowledge/WalkthroughPlayer';
import WalkthroughCard from '../knowledge/WalkthroughCard';
import { WALKTHROUGHS, WALKTHROUGH_FILTERS } from '../../lib/knowledge';

interface TechWalkthroughsViewProps {
  featuredId: string;
  onFeature: (id: string) => void;
  onOpenSop: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type SortKey = 'latest' | 'watched' | 'required';

/** Library grid excludes the master walkthrough, which is always available in the featured player. */
const LIBRARY = WALKTHROUGHS.filter((w) => w.id !== 'MW-08');

export default function TechWalkthroughsView({ featuredId, onFeature, onOpenSop, onNotify }: TechWalkthroughsViewProps): React.ReactElement {
  const [query, setQuery] = useState<string>('');
  const [filter, setFilter] = useState<string>('All');
  const [sort, setSort] = useState<SortKey>('latest');
  const [saved, setSaved] = useState<Set<string>>(new Set(['MW-08', 'WT-CAM', 'WT-LOTO']));
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const featured = WALKTHROUGHS.find((w) => w.id === featuredId) ?? WALKTHROUGHS[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = LIBRARY.filter(
      (w) =>
        (filter === 'All' || w.topics.includes(filter)) &&
        (!watchlistOnly || saved.has(w.id)) &&
        (sort !== 'required' || w.required) &&
        (!q || `${w.title} ${w.asset} ${w.author.name} ${w.category}`.toLowerCase().includes(q)),
    );
    return sort === 'watched' ? [...list].sort((a, b) => b.views - a.views) : list;
  }, [query, filter, sort, watchlistOnly, saved]);

  const play = (id: string) => {
    setAutoPlay(true);
    onFeature(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSave = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
            <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>• {WALKTHROUGHS.length} active tutorials</span>
          </div>
          <h1 className="page-title">Tech Walkthroughs</h1>
          <p className="muted" style={{ fontSize: '0.88rem', marginTop: 4, maxWidth: 640 }}>
            Bite-sized, 2-minute master technician video guides, real repair captures from past incidents, and interactive equipment teardowns.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="wt-watchlist" type="button" className={`btn ${watchlistOnly ? 'btn-accent' : ''}`} aria-pressed={watchlistOnly} onClick={() => setWatchlistOnly((v) => !v)}>
            <span className="material-symbols-outlined">bookmark_added</span>
            Watchlist
            <span className="chip chip-accent" style={{ padding: '0 7px', fontSize: '0.66rem' }}>
              {saved.size}
            </span>
          </button>
          <button id="wt-guidelines" type="button" className="btn" onClick={() => onNotify('Recording guidelines are not attached in this build', 'info')}>
            <span className="material-symbols-outlined">verified_user</span>
            Recording Guidelines
          </button>
          <button id="wt-upload" type="button" className="btn btn-dark" onClick={() => onNotify('Floor capture upload is not connected in this build', 'info')}>
            <span className="material-symbols-outlined">videocam</span>
            Upload Tech Capture
          </button>
        </div>
      </header>

      <WalkthroughPlayer key={featured.id} item={featured} autoPlay={autoPlay} onOpenSop={onOpenSop} />

      <label className="glass row search-field">
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)' }}>
          search
        </span>
        <input id="wt-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search video guides by tool, technician, technique, or equipment model…" aria-label="Search video guides" />
        <span className="kbd">ESC Clear</span>
      </label>

      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 6 }} role="tablist" aria-label="Video categories">
          {['All', ...WALKTHROUGH_FILTERS].map((f) => {
            const count = f === 'All' ? LIBRARY.length : LIBRARY.filter((w) => w.topics.includes(f)).length;
            const on = filter === f;
            return (
              <button key={f} type="button" role="tab" aria-selected={on} className={`pill ${on ? 'pill-on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'Master Tech Verified' && (
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    verified
                  </span>
                )}
                {f === 'All' ? 'All Videos' : f} ({count})
              </button>
            );
          })}
        </div>
        <div className="seg">
          {(
            [
              ['latest', 'Latest Uploads'],
              ['watched', 'Most Watched'],
              ['required', 'Required Shift A'],
            ] as [SortKey, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>
              {k === 'required' && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
          {visible.map((w) => (
            <WalkthroughCard key={w.id} item={w} playing={w.id === featured.id} saved={saved.has(w.id)} onPlay={play} onToggleSave={toggleSave} />
          ))}
        </div>
      ) : (
        <div className="glass col" style={{ padding: '2.5rem', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
            video_search
          </span>
          No walkthroughs match these filters.
        </div>
      )}

      <section className="glass grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', padding: '1.4rem', gap: '1.6rem', alignItems: 'center' }}>
        <div className="col" style={{ gap: 10 }}>
          <div className="recert-banner">
            <img src="/knowledge/wt-hero.jpg" alt="" />
            <div className="row" style={{ position: 'relative', gap: 10 }}>
              <span className="mono" style={{ width: 38, height: 38, borderRadius: 999, background: '#fff', color: 'var(--ink)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.78rem' }}>
                DV
              </span>
              <div className="col">
                <span className="row" style={{ gap: 8, fontWeight: 650, color: '#fff' }}>
                  Devon Vance
                  <span className="chip" style={{ padding: '0 7px', fontSize: '0.62rem' }}>
                    Station L01
                  </span>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>Lead Plant Operator • Shift A Active</span>
              </div>
            </div>
          </div>
          <div className="row between" style={{ fontSize: '0.86rem' }}>
            <span style={{ fontWeight: 650 }}>Monthly Micro-Learning Recertification</span>
            <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.78rem' }}>
              4 of 5 Completed
            </span>
          </div>
          <div className="progress">
            <span style={{ width: '80%' }} />
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>Next required module: Spindle Dynamic Calibration (due in 4 days)</span>
        </div>
        <div className="row wrap" style={{ gap: 16, alignItems: 'center' }}>
          <div className="col" style={{ gap: 6, flex: '1 1 240px' }}>
            <span className="row" style={{ gap: 8, fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 650 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>
                workspace_premium
              </span>
              Skill Verification &amp; Walkthrough Requests
            </span>
            <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.55 }}>
              Completed all mandatory walkthroughs? Export your updated Quality Guild endorsement or record an in-situ video capture directly from the floor terminal.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button id="wt-certificate" type="button" className="btn" onClick={() => onNotify('Certificate export is not connected in this build', 'info')}>
              <span className="material-symbols-outlined">card_membership</span>
              Skill Certificate
            </button>
            <button id="wt-request" type="button" className="btn btn-accent" onClick={() => onNotify('Walkthrough requests are not connected in this build', 'info')}>
              <span className="material-symbols-outlined">add_to_queue</span>
              Request Walkthrough
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
