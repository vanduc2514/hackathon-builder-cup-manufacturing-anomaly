// TopHeader: floating glass pills with quick-jump palette, UTC clock and operator identity.
import React, { useEffect, useRef, useState } from 'react';
import type { DashboardTab } from './Sidebar';

interface TopHeaderProps {
  onJump: (tab: DashboardTab) => void;
}

const JUMP_TARGETS: { tab: DashboardTab; label: string; hint: string; icon: string }[] = [
  { tab: 'products', label: 'Products', hint: 'Line-01 · 5 products · end-of-line quality', icon: 'inventory_2' },
  { tab: 'impact', label: 'Kaizen & Impact', hint: 'What-if sustainability calculator', icon: 'eco' },
  { tab: 'sops', label: 'SOP Library', hint: 'Procedures & runbooks', icon: 'menu_book' },
  { tab: 'walkthroughs', label: 'Tech Walkthroughs', hint: 'Expert repair videos', icon: 'smart_display' },
];

export default function TopHeader({ onJump }: TopHeaderProps): React.ReactElement {
  const [timeStr, setTimeStr] = useState<string>('');
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const tick = () => setTimeStr(new Date().toISOString().substring(11, 19));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

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
    <header
      style={{
        position: 'fixed',
        top: 12,
        left: 'calc(var(--sidebar-w) + 12px)',
        right: 16,
        height: 'calc(var(--header-h) - 8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 0.25rem',
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      <div className="row" style={{ gap: '0.75rem', pointerEvents: 'auto' }}>
        <div style={{ position: 'relative' }}>
          <button
            id="header-search"
            type="button"
            className="btn glass"
            onClick={() => setPaletteOpen((v) => !v)}
            style={{ borderRadius: 999, color: 'var(--text)', fontWeight: 500, minWidth: 240, height: 44, justifyContent: 'space-between' }}
          >
            <span className="row" style={{ gap: 6 }}>
              <span className="material-symbols-outlined">search</span>
              Jump to asset…
            </span>
            <span className="kbd">⌘K</span>
          </button>
          {paletteOpen && (
            <div
              className="glass glass-strong"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: 360,
                padding: 8,
                borderRadius: 18,
                animation: 'toastIn 0.3s var(--ease) both',
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

        <div className="btn glass mono" style={{ borderRadius: 999, cursor: 'default', fontWeight: 500, height: 44, color: 'var(--text)' }}>
          <span className="material-symbols-outlined">schedule</span>
          {timeStr || '--:--:--'} UTC
        </div>

        <div className="row" style={{ gap: '0.7rem', paddingLeft: '0.4rem' }}>
          <div className="col" style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 650, lineHeight: 1.2 }}>Devon Vance</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Lead Plant Ops</span>
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
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              person
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
