import React from 'react';
import { useFactoryStream } from './useFactoryStream';
import MachineBay from './components/MachineBay';
import ConveyorBelt from './components/ConveyorBelt';
import EdgeFilterCard from './components/EdgeFilterCard';
import AnomalyConsole from './components/AnomalyConsole';
import { ROLE_ICON, logout, useSession } from './lib/auth';

export default function App(): React.ReactElement {
  const session = useSession();
  const {
    packet,
    connected,
    injectAnomaly,
    resetFactory,
    authError,
    deliveryReports,
  } = useFactoryStream();
  const machines = packet?.machines || packet?.telemetry || [];
  const parts = packet?.recent_parts || packet?.parts || [];

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <header className="glass-card header-bar">
        <div className="header-brand">
          <img className="brand-icon" src="/logo.png" alt="kAIzen logo" />
          <div>
            <h1 className="brand-h1">kAIzen Factory Floor</h1>
            <p className="brand-p">Window 1: Physical Telemetry & Machine Simulator</p>
          </div>
        </div>
        <div className="header-chips">
          <div className="chip"><span className="material-symbols-outlined text-sm">pin_drop</span>Plant 04 • Da Nang</div>
          <div className="chip"><span className={`dot ${connected ? 'dot-green' : 'dot-amber'}`} />Pub/Sub: {connected ? 'Live' : 'Standby'}</div>
          <div className="chip chip-accent mono">Tick: #{packet?.tick_index ?? 0}</div>
          {session && (
            <div className="chip" style={{ gap: 8, paddingLeft: 8 }}>
              <span className="material-symbols-outlined text-sm accent">{ROLE_ICON[session.user.role] || 'person'}</span>
              <span>{session.user.display_name}</span>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                style={{
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: '2px',
                  borderRadius: '4px',
                }}
              >
                <span className="material-symbols-outlined text-sm">logout</span>
              </button>
            </div>
          )}
        </div>
      </header>


      <main className="content-stack">
        <AnomalyConsole
          activeAnomaly={packet?.active_anomaly}
          onInject={injectAnomaly}
          onReset={resetFactory}
          authError={authError}
          deliveryReports={deliveryReports}
        />
        <MachineBay machines={machines} />
        <div className="split-grid">
          <ConveyorBelt parts={parts} />
          <EdgeFilterCard stats={packet?.edge_stats} />
        </div>
      </main>

      <footer className="footer-bar faint text-xs">
        <span>kAIzen Platform • simulator/ui/</span>
        <span className="mono">Lumina Slate Liquid Glass</span>
      </footer>
    </div>
  );
}
