// TelemetryAlertsPanel: threshold alerts raised by the process monitor (incident.telemetry_alerts).
import React from 'react';
import type { TelemetryAlert } from '../../types';
import { formatClock } from '../../lib/incident';

interface TelemetryAlertsPanelProps {
  alerts: TelemetryAlert[];
  machine: string | null;
}

export default function TelemetryAlertsPanel({ alerts, machine }: TelemetryAlertsPanelProps): React.ReactElement {
  const sorted = alerts.slice().reverse();
  const forMachine = machine ? sorted.filter((a) => a.machine_id === machine).length : 0;
  return (
    <div className="col" style={{ gap: 8 }} id="incident-telemetry-alerts">
      <div className="row between">
        <span className="eyebrow">Telemetry alerts</span>
        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
          {alerts.length} total{machine ? ` · ${forMachine} on ${machine}` : ''}
        </span>
      </div>
      {sorted.length === 0 ? (
        <p style={{ fontSize: '0.86rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          No threshold alerts recorded for this incident.
        </p>
      ) : (
        <ul className="col" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 240, overflow: 'auto' }}>
          {sorted.map((a, i) => {
            const hot = a.anomaly_score >= 0.5;
            return (
              <li
                key={`${a.machine_id}-${a.timestamp}-${a.metric_name}-${i}`}
                className="row wrap"
                style={{ gap: '4px 12px', padding: '6px 4px', borderBottom: '1px solid var(--hair)', fontSize: '0.78rem' }}
              >
                <span className={`chip mono ${hot ? 'chip-red' : 'chip-amber'}`} style={{ fontWeight: 700 }}>
                  {a.machine_id}
                </span>
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {formatClock(a.timestamp)} UTC
                </span>
                <span style={{ flex: '1 1 220px', color: 'var(--ink)' }}>{a.message}</span>
                <span className="mono" style={{ fontWeight: 650 }}>
                  {a.metric_name} {a.metric_value} / {a.threshold}
                </span>
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {a.operating_status} · score {a.anomaly_score.toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
