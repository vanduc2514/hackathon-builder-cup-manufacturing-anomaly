// Sidebar: glass navigation rail with products, closable incident sub-tabs and knowledge hub.
import React, { useEffect, useState } from 'react';

export type DashboardTab = 'products' | 'incident-detail' | 'impact' | 'walkthroughs' | 'sops';

/** An incident opened from a defective product card; shown as a sub-tab under Products. */
export interface IncidentTab {
  id: string;
  product: string;
}

interface SidebarProps {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  incidentTabs: IncidentTab[];
  activeIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onCloseIncident: (id: string) => void;
}

interface NavItemProps {
  id: string;
  icon?: string;
  label: string;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
  sub?: boolean;
}

function NavItem({ id, icon, label, active, onClick, trailing, sub }: NavItemProps): React.ReactElement {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className="row between"
      style={{
        width: '100%',
        gap: '0.7rem',
        padding: sub ? '0.42rem 0.7rem' : '0.58rem 0.75rem',
        borderRadius: 12,
        border: '1px solid',
        borderColor: active ? 'rgba(255,255,255,0.9)' : 'transparent',
        background: active ? 'rgba(255,255,255,0.85)' : 'transparent',
        boxShadow: active ? '0 4px 14px -6px rgba(30,41,90,0.2), inset 0 1px 0 #fff' : 'none',
        color: active ? 'var(--ink)' : 'var(--text)',
        fontWeight: active ? 650 : 500,
        fontSize: sub ? '0.8rem' : '0.86rem',
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
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: active ? 'var(--accent)' : 'var(--muted)' }}
          >
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
  onSelectIncident,
  onCloseIncident,
}: SidebarProps): React.ReactElement {
  const [hubOpen, setHubOpen] = useState<boolean>(true);
  const [dashOpen, setDashOpen] = useState<boolean>(true);

  useEffect(() => {
    if (activeIncidentId) setDashOpen(true);
  }, [activeIncidentId, incidentTabs.length]);

  return (
    <aside
      className="glass glass-strong"
      style={{
        position: 'fixed',
        left: 12,
        top: 12,
        bottom: 12,
        width: 'calc(var(--sidebar-w) - 12px)',
        borderRadius: 24,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.2rem 0.85rem',
        zIndex: 50,
      }}
    >
      <div className="col" style={{ gap: '1.6rem' }}>
        <div className="row" style={{ gap: '0.7rem', padding: '0 0.4rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(160deg, #1f2937, #0b1220)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 6px 14px -4px rgba(11,18,32,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 21 }}>
              precision_manufacturing
            </span>
          </div>
          <div className="col">
            <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Lumina Slate
            </span>
            <span className="eyebrow" style={{ fontSize: '0.6rem' }}>
              Factory Operations
            </span>
          </div>
        </div>

        <div className="col" style={{ gap: '1.3rem' }}>
          <div className="col" style={{ gap: 2 }}>
            <div className="eyebrow" style={{ padding: '0 0.75rem 0.35rem' }}>
              Command Core
            </div>
            <div style={{ position: 'relative' }}>
              <NavItem
                id="nav-products"
                icon="inventory_2"
                label="Products"
                active={currentTab === 'products'}
                onClick={() => onSelectTab('products')}
              />
              {incidentTabs.length > 0 && (
                <button
                  id="nav-products-toggle"
                  type="button"
                  aria-label={dashOpen ? 'Collapse incident tabs' : 'Expand incident tabs'}
                  aria-expanded={dashOpen}
                  onClick={() => setDashOpen((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--faint)',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, transform: dashOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s var(--ease)' }}
                  >
                    expand_more
                  </span>
                </button>
              )}
            </div>
            {dashOpen && incidentTabs.length > 0 && (
              <div
                className="col"
                style={{ marginLeft: '1.55rem', paddingLeft: '0.6rem', borderLeft: '1.5px solid var(--hair-strong)', gap: 2, margin: '2px 0 4px 1.55rem' }}
              >
                {incidentTabs.map((t) => {
                  const on = currentTab === 'incident-detail' && activeIncidentId === t.id;
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
                        className="row"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          gap: 6,
                          padding: '0.4rem 0.2rem 0.4rem 0.55rem',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: on ? 650 : 500,
                          color: on ? 'var(--ink)' : 'var(--text)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--red)' }}>
                          warning
                        </span>
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
              Resources &amp; Ops
            </div>
            <NavItem
              id="nav-knowledge-hub"
              icon="menu_book"
              label="Knowledge Hub"
              active={false}
              onClick={() => setHubOpen((v) => !v)}
              trailing={
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 18,
                    color: 'var(--faint)',
                    transform: hubOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.25s var(--ease)',
                  }}
                >
                  expand_more
                </span>
              }
            />
            {hubOpen && (
              <div
                className="col"
                style={{ marginLeft: '1.55rem', paddingLeft: '0.6rem', borderLeft: '1.5px solid var(--hair-strong)', gap: 2 }}
              >
                <NavItem
                  id="nav-sop-library"
                  label="SOP Library"
                  sub
                  active={currentTab === 'sops'}
                  onClick={() => onSelectTab('sops')}
                />
                <NavItem
                  id="nav-walkthroughs"
                  label="Tech Walkthroughs"
                  sub
                  active={currentTab === 'walkthroughs'}
                  onClick={() => onSelectTab('walkthroughs')}
                />
              </div>
            )}
            <NavItem
              id="nav-impact"
              icon="trending_up"
              label="Impact"
              active={currentTab === 'impact'}
              onClick={() => onSelectTab('impact')}
            />
          </div>
        </div>
      </div>

      <div
        className="glass-inset row between"
        style={{ padding: '0.6rem 0.7rem', borderRadius: 14 }}
      >
        <div className="row" style={{ gap: '0.6rem', minWidth: 0 }}>
          <div
            style={{
              position: 'relative',
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
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              person
            </span>
          </div>
          <div className="col" style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 650 }}>Devon Vance</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Lead Plant Ops</span>
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--faint)' }}>
          unfold_more
        </span>
      </div>
    </aside>
  );
}
