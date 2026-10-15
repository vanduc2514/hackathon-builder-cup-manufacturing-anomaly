import React, { useState } from 'react';
import type { ActiveAnomalyStatus } from '../types';

interface Props {
  activeAnomaly?: ActiveAnomalyStatus | null;
  onInject: (scenario: string, machineId?: string, severity?: number, mode?: string) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}

export default function AnomalyConsole({ activeAnomaly, onInject, onReset }: Props): React.ReactElement {
  const [mode, setMode] = useState<'demo' | 'fast'>('demo');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div className="glass-card flex-col">
      <div className="section-head">
        <span className="section-title"><span className="material-symbols-outlined accent-icon">bolt</span>Anomaly Control Console</span>
        <div className="mode-tabs">
          <button type="button" className={`tab-btn ${mode === 'demo' ? 'active' : ''}`} onClick={() => setMode('demo')}>Demo (90s)</button>
          <button type="button" className={`tab-btn ${mode === 'fast' ? 'active' : ''}`} onClick={() => setMode('fast')}>Fast (8s)</button>
        </div>
      </div>
      {activeAnomaly?.scenario && (
        <div className="banner-alert">
          <span className="pulse-dot" />
          <span><b>ACTIVE:</b> {activeAnomaly.scenario} on <code className="mono">{activeAnomaly.machine_id}</code> ({activeAnomaly.tool_id}) • Elapsed: {activeAnomaly.elapsed_seconds.toFixed(1)}s</span>
        </div>
      )}
      <div className="btn-grid">
        <button type="button" className="action-btn btn-danger" disabled={busy} onClick={() => act(() => onInject('cnc_tool_wear', 'CNC-02', 1.0, mode))}>
          <span className="material-symbols-outlined">warning</span> Trigger Scenario 1: CNC Tool Wear
        </button>
        <button type="button" className="action-btn btn-amber" disabled={busy} onClick={() => act(() => onInject('im_damp_material', 'IM-05', 1.0, mode))}>
          <span className="material-symbols-outlined">water_drop</span> Trigger Scenario 2: IM Damp Material
        </button>
        <button type="button" className="action-btn btn-plain" disabled={busy} onClick={() => act(onReset)}>
          <span className="material-symbols-outlined">restart_alt</span> Reset to Baseline
        </button>
      </div>
    </div>
  );
}
