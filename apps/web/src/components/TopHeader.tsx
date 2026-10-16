// TopHeader: breadcrumb, active-anomaly pill, quick-jump palette, alert sound toggle, signed-in identity and sign-out.
import React, { useEffect, useRef, useState } from 'react';
import type { DashboardTab } from './Sidebar';
import { LINE_NAME } from '../lib/fleet';
import { ROLE_ICON, ROLE_LABEL, logout, useSession } from '../lib/auth';

interface TopHeaderProps {
  crumb: string;
  openIncidentCount: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenIncidents: () => void;
  onJump: (tab: DashboardTab) => void;
  navOpen?: boolean;
  onToggleNav?: () => void;
}

const JUMP_TARGETS: { tab: DashboardTab; label: string; hint: string; icon: string }[] = [
  { tab: 'overview', label: 'Line Overview', hint: 'Cell Line 1 · fleet telemetry, SPC & OEE', icon: 'dashboard' },
  { tab: 'topology', label: 'System Topology', hint: '4-phase multi-agent architecture & live state diagram', icon: 'account_tree' },
  { tab: 'walkthroughs', label: 'Tech Walkthroughs', hint: 'Repair videos by machine station', icon: 'smart_display' },
  { tab: 'impact', label: 'Knowledge Base', hint: 'Signed-off 8D fixes · scrap, downtime & CO₂ saved', icon: 'local_library' },
  { tab: 'sops', label: 'SOP Change Log', hint: 'Procedures & revisions', icon: 'history' },
];

export default function TopHeader({
  crumb,
  openIncidentCount,
  soundOn,
  onToggleSound,
  onOpenIncidents,
  onJump,
  navOpen = false,
  onToggleNav,
}: TopHeaderProps): React.ReactElement {
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const user = useSession()?.user;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const results = JUMP_TARGETS.filter((t) =>
    `${t.label} ${t.hint}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <header className="app-header">
      <div className="row" style={{ gap: '0.6rem', minWidth: 0, pointerEvents: 'auto', flex: '1 1 auto' }}>
        <button
          id="header-menu"
          type="button"
          className="btn glass header-menu-btn"
          aria-label="Open navigation"
          aria-expanded={Boolean(navOpen)}
          aria-controls="app-sidebar"
          onClick={onToggleNav}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="row header-crumb">
          <span>{LINE_NAME}</span>
          <span style={{ color: 'var(--faint)' }}>/</span>
          <b>{crumb}</b>
        </div>
      </div>

      <div className="row" style={{ gap: '0.75rem', pointerEvents: 'auto', flexShrink: 0 }}>
        {openIncidentCount > 0 && (
          <button id="header-anomaly" type="button" className="chip chip-red" onClick={onOpenIncidents} style={{ height: 34, padding: '0 14px', fontSize: '0.78rem' }}>
            <span className="dot animate-pulse-glow" />
            <span className="header-anomaly-text">{openIncidentCount} Active Anomal{openIncidentCount > 1 ? 'ies' : 'y'}</span>
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button
            id="header-search"
            type="button"
            className="btn glass header-search"
            aria-label="Search telemetry or jump to view"
            onClick={() => setPaletteOpen((v) => !v)}
            style={{ borderRadius: 999, color: 'var(--text)', fontWeight: 500 }}
          >
            <span className="row" style={{ gap: 6 }}>
              <span className="material-symbols-outlined">search</span>
              <span className="header-search-label">Search telemetry or jump to…</span>
            </span>
            <span className="kbd header-search-kbd">⌘K</span>
          </button>
          {paletteOpen && (
            <div
              className="glass glass-strong"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: 'min(360px, calc(100vw - 24px))',
                padding: 8,
                borderRadius: 18,
                animation: 'toastIn 0.3s var(--ease) both',
                zIndex: 60,
              }}
            >
              <input
                ref={inputRef}
                id="header-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) {
                    onJump(results[0].tab);
                    setPaletteOpen(false);
                  }
                }}
                placeholder="Search views, machines, SOPs…"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 12,
                  border: '1px solid var(--hair-strong)',
                  background: 'rgba(255,255,255,0.8)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  marginBottom: 6,
                }}
              />
              {results.map((r) => (
                <button
                  key={r.tab}
                  type="button"
                  onClick={() => {
                    onJump(r.tab);
                    setPaletteOpen(false);
                  }}
                  className="row"
                  style={{
                    width: '100%',
                    gap: 10,
                    padding: '0.55rem 0.6rem',
                    border: 'none',
                    background: 'transparent',
                    borderRadius: 10,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(91,91,240,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--accent)' }}>
                    {r.icon}
                  </span>
                  <span className="col">
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{r.hint}</span>
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="muted" style={{ fontSize: '0.78rem', padding: '0.6rem' }}>
                  No matches
                </div>
              )}
            </div>
          )}
        </div>

        <button
          id="header-sound"
          type="button"
          className="btn glass"
          aria-label={soundOn ? 'Mute anomaly alert sound' : 'Unmute anomaly alert sound'}
          aria-pressed={soundOn}
          onClick={onToggleSound}
          style={{ borderRadius: 999, width: 44, height: 44, padding: 0, color: 'var(--text)' }}
        >
          <span className="material-symbols-outlined">{soundOn ? 'volume_up' : 'volume_off'}</span>
        </button>

        {user && (
          <div className="row" style={{ gap: '0.7rem', paddingLeft: '0.4rem' }}>
            <div className="col header-role-text" style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 650 }}>{ROLE_LABEL[user.role]}</span>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                background: 'linear-gradient(160deg, #1f2937, #0b1220)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {ROLE_ICON[user.role]}
              </span>
            </div>
          </div>
        )}

        <button
          id="header-sign-out"
          type="button"
          className="btn glass"
          aria-label="Sign out"
          title="Sign out"
          onClick={logout}
          style={{ borderRadius: 999, width: 44, height: 44, padding: 0, color: 'var(--text)' }}
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </div>
    </header>
  );
}
