// LiveTelemetryStrip: latest machine telemetry packet — status, RPM, anomaly score, tool and timestamp.
import React from 'react';
import type { MachineTelemetryPayload } from '../../types';
import { formatClock } from '../../lib/incident';

interface LiveTelemetryStripProps {
  telemetry: MachineTelemetryPayload;
}

export default function LiveTelemetryStrip({ telemetry: t }: LiveTelemetryStripProps): React.ReactElement {
  const hot = t.anomaly_score >= 0.5;
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: 'Operating status', value: t.operating_status },
    { label: 'Spindle RPM', value: t.rpm.toLocaleString('en-US') },
    { label: 'Anomaly score', value: t.anomaly_score.toFixed(2), tone: hot ? '#c9343a' : '#0e8a43' },
    { label: 'Tool', value: t.tool_id ?? '—' },
    { label: 'Last packet', value: `${formatClock(t.timestamp)} UTC` },
  ];
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}
      aria-label={`${t.machine_id} latest telemetry packet`}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid var(--hair)', borderRadius: 12, padding: '0.5rem 0.7rem' }}
        >
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{c.label}</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem', color: c.tone ?? 'var(--ink)' }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
