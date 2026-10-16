// Sidebar: glass navigation rail — operational loop (overview, incidents), knowledge loop, backend link and shift.
import React, { useEffect, useState } from 'react';
import { ROLE_ICON, ROLE_LABEL, useSession } from '../lib/auth';
import { LINE_LABEL, shiftLabel } from '../lib/fleet';

export type DashboardTab = 'overview' | 'topology' | 'incident-detail' | 'impact' | 'walkthroughs' | 'sops';

/** An incident opened from the overview; shown as a closable sub-tab under Incidents. */
export interface IncidentTab {
  id: string;
  product: string;
}

export interface BackendLink {
  ok: boolean;
  latencyMs: number | null;
}

interface SidebarProps {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  incidentTabs: IncidentTab[];
  activeIncidentId: string | null;
  openIncidentCount: number;
  link: BackendLink | null;
  onOpenIncidents: () => void;
  onSelectIncident: (id: string) => void;
  onCloseIncident: (id: string) => void;
  navOpen?: boolean;
  onCloseNav?: () => void;
}

interface NavItemProps {
  id: string;
  icon?: string;
  label: string;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}

function NavItem({ id, icon, label, active, onClick, trailing }: NavItemProps): React.ReactElement {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="row between"
      style={{
        width: '100%',
        gap: '0.7rem',
        padding: '0.58rem 0.75rem',
        borderRadius: 12,
        border: '1px solid',
        borderColor: active ? 'rgba(255,255,255,0.9)' : 'transparent',
        background: active ? 'rgba(255,255,255,0.85)' : 'transparent',
        boxShadow: active ? '0 4px 14px -6px rgba(30,41,90,0.2), inset 0 1px 0 #fff' : 'none',
        color: active ? 'var(--ink)' : 'var(--text)',
        fontWeight: active ? 650 : 500,
        fontSize: '0.86rem',
        textAlign: 'left',
        transition: 'all 0.25s var(--ease)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.45)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span className="row" style={{ gap: '0.7rem', minWidth: 0 }}>
        {icon && (
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: active ? 'var(--accent)' : 'var(--muted)' }}>
            {icon}
          </span>
        )}
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </span>
      {trailing}
    </button>
  );
}

export default function Sidebar({
  currentTab,
  onSelectTab,
  incidentTabs,
  activeIncidentId,
  openIncidentCount,
  link,
  onOpenIncidents,
  onSelectIncident,
  onCloseIncident,
  navOpen = false,
  onCloseNav,
}: SidebarProps): React.ReactElement {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const incidentsActive = currentTab === 'incident-detail';
  const user = useSession()?.user;

  return (
    <aside
      id="app-sidebar"
      className="glass glass-strong app-sidebar"
      data-open={navOpen ? 'true' : 'false'}
      aria-label="Application navigation"
    >
      <div className="col" style={{ gap: '1.4rem' }}>
        <div className="col" style={{ gap: '0.9rem', padding: '0 0.4rem' }}>
          <div className="row between" style={{ gap: '0.65rem' }}>
            <div className="row" style={{ gap: '0.65rem' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: 'linear-gradient(160deg, #1f2937, #0b1220)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  boxShadow: '0 6px 14px -4px rgba(11,18,32,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                K
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                KAIZEN AGENT
              </span>
            </div>
            {onCloseNav && (
              <button
                type="button"
                className="btn btn-sm mobile-sidebar-close"
                aria-label="Close navigation"
                onClick={onCloseNav}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
          <div className="btn glass-inset line-select" style={{ cursor: 'default' }} title="Production line">
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{LINE_LABEL}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--faint)' }}>
              unfold_more
            </span>
          </div>
        </div>

        <div className="divider" />

        <div className="col" style={{ gap: '1.3rem' }}>
          <div className="col" style={{ gap: 2 }}>
            <div className="eyebrow" style={{ padding: '0 0.75rem 0.35rem' }}>
              Operational Loop
            </div>
            <NavItem
              id="nav-overview"
              icon="dashboard"
              label="Line Overview"
              active={currentTab === 'overview'}
              onClick={() => onSelectTab('overview')}
            />
            <NavItem
              id="nav-topology"
              icon="account_tree"
              label="System Topology"
              active={currentTab === 'topology'}
              onClick={() => onSelectTab('topology')}
            />
            <NavItem
              id="nav-incidents"
              icon="warning"
              label="Incidents"
              active={incidentsActive}
              onClick={onOpenIncidents}
              trailing={
                openIncidentCount > 0 ? (
                  <span className="chip chip-red" style={{ padding: '1px 8px' }}>
                    {openIncidentCount}
                  </span>
                ) : undefined
              }
            />
            {incidentTabs.length > 0 && (
              <div
                className="col"
                style={{ paddingLeft: '0.6rem', borderLeft: '1.5px solid var(--hair-strong)', gap: 2, margin: '2px 0 4px 1.55rem' }}
              >
                {incidentTabs.map((t) => {
                  const on = incidentsActive && activeIncidentId === t.id;
                  return (
                    <div
                      key={t.id}
                      className="subtab row"
                      data-active={on}
                      style={{
                        borderRadius: 10,
                        background: on ? 'rgba(91,91,240,0.14)' : 'transparent',
                        transition: 'background 0.2s var(--ease)',
                      }}
                    >
                      <button
                        id={`nav-incident-tab-${t.id}`}
                        type="button"
                        onClick={() => onSelectIncident(t.id)}
                        title={`${t.product} · #${t.id}`}
                        className="row mono"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          gap: 6,
                          padding: '0.4rem 0.2rem 0.4rem 0.55rem',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          fontSize: '0.76rem',
                          fontWeight: on ? 650 : 500,
                          color: on ? 'var(--ink)' : 'var(--text)',
                        }}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.id}</span>
                      </button>
                      <button
                        type="button"
                        className="subtab-close"
                        aria-label={`Close incident tab ${t.id}`}
                        onClick={() => onCloseIncident(t.id)}
                        style={{
                          width: 24,
                          height: 24,
                          marginRight: 4,
                          borderRadius: 7,
                          border: 'none',
                          background: 'transparent',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--muted)',
                          flexShrink: 0,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          close
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="col" style={{ gap: 2 }}>
            <div className="eyebrow" style={{ padding: '0 0.75rem 0.35rem' }}>
              Knowledge Loop
            </div>
            <NavItem
              id="nav-walkthroughs"
              icon="smart_display"
              label="Tech Walkthroughs"
              active={currentTab === 'walkthroughs'}
              onClick={() => onSelectTab('walkthroughs')}
            />
            <NavItem
              id="nav-impact"
              icon="local_library"
              label="Knowledge Base"
              active={currentTab === 'impact'}
              onClick={() => onSelectTab('impact')}
            />
            <NavItem
              id="nav-sop-library"
              icon="history"
              label="SOP Change Log"
              active={currentTab === 'sops'}
              onClick={() => onSelectTab('sops')}
            />
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: '0.7rem', paddingTop: '1rem' }}>
        <div className="row" style={{ gap: 8, padding: '0 0.4rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
          <span
            className={link?.ok ? 'animate-pulse-glow' : undefined}
            style={{ width: 7, height: 7, borderRadius: 999, background: link?.ok ? 'var(--green)' : 'var(--red)' }}
          />
          {link?.ok ? `Connected | Latency: ${link.latencyMs ?? '—'}ms` : link ? 'Backend offline' : 'Connecting…'}
        </div>
        <span className="chip" style={{ alignSelf: 'flex-start', marginLeft: '0.4rem', fontSize: '0.74rem', padding: '4px 11px' }}>
          {shiftLabel(now)}
        </span>
        {user && (
          <div className="glass-inset row" style={{ padding: '0.6rem 0.7rem', borderRadius: 14, gap: '0.6rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: 'linear-gradient(160deg, #1f2937, #0b1220)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {ROLE_ICON[user.role]}
              </span>
            </div>
            <div className="col" style={{ minWidth: 0 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 650 }}>{ROLE_LABEL[user.role]}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
