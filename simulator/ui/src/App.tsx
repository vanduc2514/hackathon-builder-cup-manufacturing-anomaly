import React from 'react';
import { useFactoryStream } from './useFactoryStream';
import MachineBay from './components/MachineBay';
import ConveyorBelt from './components/ConveyorBelt';
import EdgeFilterCard from './components/EdgeFilterCard';
import AnomalyConsole from './components/AnomalyConsole';

export default function App(): React.ReactElement {
  const {
    packet,
    connected,
    injectAnomaly,
    resetFactory,
    apiKey,
    setApiKey,
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
          <div className="brand-icon"><span className="material-symbols-outlined">factory</span></div>
          <div>
            <h1 className="brand-h1">Kaizen Factory Floor</h1>
            <p className="brand-p">Window 1: Physical Telemetry & Machine Simulator</p>
          </div>
        </div>
        <div className="header-chips">
          <div className="chip"><span className="material-symbols-outlined text-sm">pin_drop</span>Plant 04 • Da Nang</div>
          <div className="chip"><span className={`dot ${connected ? 'dot-green' : 'dot-amber'}`} />Pub/Sub: {connected ? 'Live' : 'Standby'}</div>
          <div className="chip chip-accent mono">Tick: #{packet?.tick_index ?? 0}</div>
        </div>
      </header>

      <main className="content-stack">
        <AnomalyConsole
          activeAnomaly={packet?.active_anomaly}
          onInject={injectAnomaly}
          onReset={resetFactory}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
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
        <span>Kaizen Agent Platform • simulator/ui/</span>
        <span className="mono">Lumina Slate Liquid Glass</span>
      </footer>
    </div>
  );
}
