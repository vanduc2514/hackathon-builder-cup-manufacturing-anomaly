import React, { useState } from 'react';
import type { ActiveAnomalyStatus, PubSubDeliveryReport } from '../types';
import OperatorKeyInput from './OperatorKeyInput';

interface Props {
  activeAnomaly?: ActiveAnomalyStatus | null;
  onInject: (scenario: string, machineId?: string, severity?: number, mode?: string) => Promise<boolean>;
  onReset: () => Promise<boolean>;
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
  authError?: string | null;
  deliveryReports?: PubSubDeliveryReport[];
}

export default function AnomalyConsole({
  activeAnomaly,
  onInject,
  onReset,
  apiKey = '',
  onApiKeyChange,
  authError,
  deliveryReports,
}: Props): React.ReactElement {
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
        <span className="section-title">
          <span className="material-symbols-outlined accent-icon">bolt</span>Anomaly Control Console
        </span>
        <div className="mode-tabs">
          <button
            type="button"
            className={`tab-btn ${mode === 'demo' ? 'active' : ''}`}
            onClick={() => setMode('demo')}
          >
            Demo (90s)
          </button>
          <button
            type="button"
            className={`tab-btn ${mode === 'fast' ? 'active' : ''}`}
            onClick={() => setMode('fast')}
          >
            Fast (8s)
          </button>
        </div>
      </div>

      {onApiKeyChange && (
        <OperatorKeyInput
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          authError={authError}
        />
      )}

      {activeAnomaly?.scenario && (
        <div className="banner-alert">
          <span className="pulse-dot" />
          <span>
            <b>ACTIVE:</b> {activeAnomaly.scenario} on <code className="mono">{activeAnomaly.machine_id}</code> ({activeAnomaly.tool_id}) • Elapsed: {activeAnomaly.elapsed_seconds.toFixed(1)}s
          </span>
        </div>
      )}
      <div className="btn-grid">
        <button
          type="button"
          className="action-btn btn-danger"
          disabled={busy}
          onClick={() => act(() => onInject('cnc_tool_wear', 'CNC-02', 1.0, mode))}
        >
          <span className="material-symbols-outlined">warning</span> Trigger Scenario 1: CNC Tool Wear
        </button>
        <button
          type="button"
          className="action-btn btn-amber"
          disabled={busy}
          onClick={() => act(() => onInject('im_damp_material', 'IM-05', 1.0, mode))}
        >
          <span className="material-symbols-outlined">water_drop</span> Trigger Scenario 2: IM Damp Material
        </button>
        <button
          type="button"
          className="action-btn btn-plain"
          disabled={busy}
          onClick={() => act(onReset)}
        >
          <span className="material-symbols-outlined">restart_alt</span> Reset to Baseline
        </button>
      </div>

      {deliveryReports && deliveryReports.length > 0 && (
        <div className="pubsub-dispatch-panel">
          <div className="pubsub-panel-title">
            <span className="material-symbols-outlined text-sm accent-icon">cloud_done</span>
            <span>Cloud Pub/Sub Ingestion Dispatch Guarantees</span>
          </div>
          <div className="pubsub-grid">
            {deliveryReports.map((report, idx) => {
              const isDelivered = report.status === 'delivered';
              const isBuffered = report.status === 'buffered';
              const badgeClass = isDelivered
                ? 'badge-delivered'
                : isBuffered
                ? 'badge-buffered'
                : 'badge-failed';
              const statusLabel = isDelivered
                ? 'DELIVERED (ACK)'
                : isBuffered
                ? 'BUFFERED (LOCAL)'
                : 'FAILED';

              return (
                <div key={`${report.topic}-${idx}`} className="pubsub-report-card">
                  <div className="pubsub-report-head">
                    <span className="pubsub-topic-name mono">{report.topic}</span>
                    <span className={`pubsub-badge ${badgeClass}`}>{statusLabel}</span>
                  </div>
                  <div className="pubsub-report-body">
                    <div className="pubsub-metric">
                      <span className="pubsub-metric-label">Message ID:</span>
                      <span className="pubsub-metric-value mono" title={report.message_id}>
                        {report.message_id.length > 22
                          ? `${report.message_id.slice(0, 8)}...${report.message_id.slice(-8)}`
                          : report.message_id}
                      </span>
                    </div>
                    <div className="pubsub-metric">
                      <span className="pubsub-metric-label">Latency:</span>
                      <span className="pubsub-metric-value mono">{report.latency_ms.toFixed(1)} ms</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
