// TechWalkthroughsView: tablet-first video list grouped by machine station; tapping a row opens the player drawer.
import React, { useMemo, useState } from 'react';
import type { ToastTone } from '../../App';
import SideDrawer from '../SideDrawer';
import WalkthroughPlayer from '../knowledge/WalkthroughPlayer';
import WalkthroughRow from '../knowledge/WalkthroughRow';
import TagChip from '../knowledge/TagChip';
import { WALKTHROUGHS, WALKTHROUGH_STATIONS, formatDuration, type Walkthrough } from '../../lib/knowledge';
import { useApi } from '../../lib/api';

interface TechWalkthroughsViewProps {
  requestedId: string | null;
  onOpenSop: (code: number) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

const STATION_ICON: Record<string, string> = {
  'CNC Milling': 'precision_manufacturing',
  'Vision QA · CAM-EOL': 'photo_camera',
  'Injection Molding · IM-05': 'water_drop',
  'Wash Line': 'local_laundry_service',
  'Electrical & Safety': 'electrical_services',
};

export default function TechWalkthroughsView({ requestedId, onOpenSop, onNotify }: TechWalkthroughsViewProps): React.ReactElement {
  const { data: remoteWalkthroughs } = useApi<Walkthrough[]>('/api/knowledge/walkthroughs');
  const allWalkthroughs = remoteWalkthroughs && remoteWalkthroughs.length > 0 ? remoteWalkthroughs : WALKTHROUGHS;

  const [query, setQuery] = useState<string>('');
  const [station, setStation] = useState<string>('All');
  const [requiredOnly, setRequiredOnly] = useState<boolean>(false);
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  const [saved, setSaved] = useState<Set<string>>(new Set(['MW-08', 'WT-CAM', 'WT-LOTO']));
  const [openId, setOpenId] = useState<string | null>(requestedId);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allWalkthroughs.filter(
      (w) =>
        (station === 'All' || w.station === station) &&
        (!requiredOnly || w.required) &&
        (!watchlistOnly || saved.has(w.id)) &&
        (!q || `${w.title} ${w.asset} ${w.author.name} ${w.station} ${w.category}`.toLowerCase().includes(q)),
    );
  }, [allWalkthroughs, query, station, requiredOnly, watchlistOnly, saved]);

  const groups = WALKTHROUGH_STATIONS.map((s) => ({ station: s, items: visible.filter((w) => w.station === s) })).filter((g) => g.items.length > 0);
  const open = allWalkthroughs.find((w) => w.id === openId) ?? null;
  const required = allWalkthroughs.filter((w) => w.required);

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
            Short repair videos grouped by machine station · tap a video to play
          </p>
        </div>
        <button id="wt-upload" type="button" className="btn btn-dark" onClick={() => onNotify('Floor capture upload is not connected in this build', 'info')}>
          <span className="material-symbols-outlined">videocam</span>
          Upload Tech Capture
        </button>
      </header>

      <div className="glass recert-strip">
        <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>
          workspace_premium
        </span>
        <span style={{ fontWeight: 650, fontSize: '0.86rem' }}>Monthly recertification</span>
        <div className="progress" style={{ flex: '1 1 120px', maxWidth: 220 }}>
          <span style={{ width: '80%' }} />
        </div>
        <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
          4 / 5
        </span>
        <span className="kpi-hint" style={{ flex: '1 1 240px' }}>
          Next: Spindle Dynamic Calibration · due in 4 days
        </span>
      </div>

      <div className="col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <label className="glass search-field row" style={{ flex: '1 1 360px', minHeight: 48 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)' }}>
              search
            </span>
            <input id="wt-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search machine, tool or technique…" aria-label="Search video guides" />
            {query && (
              <button type="button" className="link-btn muted" onClick={() => setQuery('')} aria-label="Clear search">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            )}
          </label>
          <button type="button" className={`pill pill-lg ${requiredOnly ? 'pill-on' : ''}`} aria-pressed={requiredOnly} onClick={() => setRequiredOnly((v) => !v)}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              assignment_late
            </span>
            Required ({required.length})
          </button>
          <button id="wt-watchlist" type="button" className={`pill pill-lg ${watchlistOnly ? 'pill-on' : ''}`} aria-pressed={watchlistOnly} onClick={() => setWatchlistOnly((v) => !v)}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              bookmark
            </span>
            Watchlist ({saved.size})
          </button>
        </div>

        <div className="row wrap" style={{ gap: 8 }} role="tablist" aria-label="Machine stations">
          {['All', ...WALKTHROUGH_STATIONS].map((s) => {
            const on = station === s;
            const count = s === 'All' ? allWalkthroughs.length : allWalkthroughs.filter((w) => w.station === s).length;
            return (
              <button key={s} type="button" role="tab" aria-selected={on} className={`pill pill-lg ${on ? 'pill-on' : ''}`} onClick={() => setStation(s)}>
                {s !== 'All' && (
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                    {STATION_ICON[s]}
                  </span>
                )}
                {s === 'All' ? 'All stations' : s} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {groups.length > 0 ? (
        groups.map((g) => (
          <section key={g.station} className="glass fleet-card" aria-label={g.station}>
            <header className="row between station-head">
              <span className="row" style={{ gap: 10 }}>
                <span className="station-icon">
                  <span className="material-symbols-outlined">{STATION_ICON[g.station]}</span>
                </span>
                <span className="card-title">{g.station}</span>
              </span>
              <span className="kpi-hint">
                {g.items.length} video{g.items.length > 1 ? 's' : ''} · {formatDuration(g.items.reduce((s, w) => s + w.durationSec, 0))}
              </span>
            </header>
            {g.items.map((w) => (
              <WalkthroughRow key={w.id} item={w} saved={saved.has(w.id)} onOpen={setOpenId} onToggleSave={toggleSave} />
            ))}
          </section>
        ))
      ) : (
        <div className="glass col" style={{ padding: '2.5rem', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
            video_search
          </span>
          No walkthroughs match these filters.
        </div>
      )}

      {open && (
        <SideDrawer
          width={1040}
          onClose={() => setOpenId(null)}
          eyebrow={
            <>
              <span className="chip chip-accent">{open.station}</span>
              <TagChip {...open.badge} />
              {open.required && <span className="chip chip-red">Required</span>}
            </>
          }
          title={open.title}
        >
          <WalkthroughPlayer key={open.id} item={open} autoPlay embedded onOpenSop={onOpenSop} />
        </SideDrawer>
      )}
    </div>
  );
}
