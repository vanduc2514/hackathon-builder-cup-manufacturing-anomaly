// TechWalkthroughsView: tablet-first video list grouped by station; tapping a row opens the player.
import React, { useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import SideDrawer from '../SideDrawer';
import WalkthroughPlayer from '../knowledge/WalkthroughPlayer';
import WalkthroughRow from '../knowledge/WalkthroughRow';
import { useApi } from '../../lib/api';
import type { WalkthroughMeta } from '../../types';

interface TechWalkthroughsViewProps {
  requestedId: string | null;
  onOpenSop?: (code: number | string) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

export default function TechWalkthroughsView({
  requestedId,
  onOpenSop,
  onNotify,
}: TechWalkthroughsViewProps): React.ReactElement {
  const { data: walkthroughs, loading, error } = useApi<WalkthroughMeta[]>('/api/knowledge/walkthroughs');

  const [query, setQuery] = useState<string>('');
  const [station, setStation] = useState<string>('All');
  const [requiredOnly, setRequiredOnly] = useState<boolean>(false);
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(requestedId);

  const items = walkthroughs ?? [];

  // Extract unique stations/assets
  const stations = useMemo(() => {
    const set = new Set<string>();
    for (const w of items) {
      if (w.asset) set.add(w.asset);
    }
    return Array.from(set).sort();
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (w) =>
        (station === 'All' || w.asset === station || w.category === station) &&
        (!requiredOnly || w.required) &&
        (!watchlistOnly || saved.has(w.id)) &&
        (!q || `${w.title} ${w.asset ?? ''} ${w.category ?? ''}`.toLowerCase().includes(q)),
    );
  }, [items, query, station, requiredOnly, watchlistOnly, saved]);

  const open = useMemo(() => {
    return items.find((w) => w.id === openId) ?? null;
  }, [items, openId]);

  const requiredCount = useMemo(() => items.filter((w) => w.required).length, [items]);

  const toggleSave = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="page">
      <header className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Tech Walkthroughs</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            Short repair videos and procedural captures · tap a video to play
          </p>
        </div>
        <button
          id="wt-upload"
          type="button"
          className="btn btn-dark"
          onClick={() => onNotify('Floor capture upload is not connected in this build', 'info')}
        >
          <span className="material-symbols-outlined">videocam</span>
          Upload Tech Capture
        </button>
      </header>

      {loading ? (
        <div className="col center" style={{ padding: '3rem', gap: 10 }}>
          <span className="material-symbols-outlined spin" style={{ fontSize: 24, color: 'var(--accent)' }}>
            sync
          </span>
          <span className="kpi-hint">Loading walkthrough catalogue…</span>
        </div>
      ) : error ? (
        <div className="col center" style={{ padding: '2rem', gap: 8 }}>
          <span className="material-symbols-outlined tone-red" style={{ fontSize: 24 }}>
            error
          </span>
          <span className="kpi-hint tone-red">Failed to load walkthroughs: {error}</span>
        </div>
      ) : items.length === 0 ? (
        <div
          className="glass empty-state col center"
          style={{ padding: '3.5rem 1.5rem', textAlign: 'center', gap: 12, margin: '1rem 0' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--muted)' }}>
            video_library
          </span>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--ink)', fontWeight: 650 }}>
            No video walkthroughs available yet
          </h3>
          <p className="muted" style={{ margin: 0, maxWidth: 440, fontSize: '0.9rem', lineHeight: 1.5 }}>
            Floor captures uploaded by technicians will appear here once ingested and indexed in Cloud Storage.
          </p>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="glass search-field row" style={{ flex: '1 1 360px', minHeight: 48 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)' }}>
                search
              </span>
              <input
                id="wt-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search machine, tool or technique…"
                aria-label="Search video guides"
              />
              {query && (
                <button
                  type="button"
                  className="link-btn muted"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    close
                  </span>
                </button>
              )}
            </label>
            <button
              type="button"
              className={`pill pill-lg ${requiredOnly ? 'pill-on' : ''}`}
              aria-pressed={requiredOnly}
              onClick={() => setRequiredOnly((v) => !v)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                assignment_late
              </span>
              Required ({requiredCount})
            </button>
            <button
              id="wt-watchlist"
              type="button"
              className={`pill pill-lg ${watchlistOnly ? 'pill-on' : ''}`}
              aria-pressed={watchlistOnly}
              onClick={() => setWatchlistOnly((v) => !v)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                bookmark
              </span>
              Watchlist ({saved.size})
            </button>
          </div>

          {stations.length > 0 && (
            <div className="row wrap" style={{ gap: 8 }} role="tablist" aria-label="Machine stations">
              <button
                type="button"
                role="tab"
                aria-selected={station === 'All'}
                className={`pill pill-lg ${station === 'All' ? 'pill-on' : ''}`}
                onClick={() => setStation('All')}
              >
                All stations ({items.length})
              </button>
              {stations.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={station === s}
                  className={`pill pill-lg ${station === s ? 'pill-on' : ''}`}
                  onClick={() => setStation(s)}
                >
                  {s} ({items.filter((w) => w.asset === s).length})
                </button>
              ))}
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {visible.map((item) => (
              <WalkthroughRow
                key={item.id}
                item={item}
                saved={saved.has(item.id)}
                onOpen={(id) => setOpenId(id)}
                onToggleSave={toggleSave}
              />
            ))}
          </div>
        </div>
      )}

      {open && (
        <SideDrawer
          onClose={() => setOpenId(null)}
          title={open.title}
          eyebrow={
            <>
              <span className="chip chip-accent">{open.category ?? 'Walkthrough'}</span>
              {open.asset && <span className="mono chip">{open.asset}</span>}
              {open.required && <span className="chip chip-red">Required</span>}
            </>
          }
        >
          <WalkthroughPlayer item={open} embedded autoPlay onOpenSop={onOpenSop} />
        </SideDrawer>
      )}
    </div>
  );
}
