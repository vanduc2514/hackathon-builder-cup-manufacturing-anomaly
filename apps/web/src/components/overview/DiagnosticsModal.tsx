// DiagnosticsModal: glass dialog with one machine's latest readings and its sensor history chart.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MultiMachineTelemetryResponse } from '../../types';
import type { FleetRow } from '../../lib/fleet';
import SensorHistoryChart from '../incident/SensorHistoryChart';

interface DiagnosticsModalProps {
  row: FleetRow;
  telemetry: MultiMachineTelemetryResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export default function DiagnosticsModal({ row, telemetry, loading, error, onClose }: DiagnosticsModalProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const points = telemetry?.series?.[row.id] ?? [];
  const last = points[points.length - 1];
  const stats: { label: string; value: string }[] = [
    { label: 'Vibration RMS', value: row.vibration !== null ? `${row.vibration.toFixed(2)} mm/s` : '—' },
    { label: 'Spindle Load', value: row.load !== null ? `${row.load.toFixed(1)}%` : '—' },
    { label: 'Spindle Speed', value: row.rpm !== null ? `${row.rpm.toLocaleString()} rpm` : '—' },
    { label: 'Bearing Temp', value: last ? `${last.temperature_c.toFixed(1)} °C` : '—' },
  ];

  return createPortal(
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="glass glass-strong modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${row.id} diagnostics`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ gap: 12 }}>
          <div>
            <div className="eyebrow">Diagnostics · {row.bay}</div>
            <h3 className="card-title" style={{ fontSize: '1.2rem' }}>
              {row.id}
            </h3>
            <div className="card-sub">
              {row.part}
              {row.op ? ` · ${row.op}` : ''}
              {telemetry ? ` · source: ${telemetry.source}` : ''}
            </div>
          </div>
          <button type="button" className="btn btn-sm" aria-label="Close diagnostics" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="diag-stats">
          {stats.map((s) => (
            <div key={s.label} className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
              <div className="eyebrow">{s.label}</div>
              <div className="mono" style={{ fontWeight: 650, fontSize: '1rem', color: 'var(--ink)' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <SensorHistoryChart machine={row.id} data={telemetry} loading={loading} error={error} />
      </div>
    </div>,
    document.body,
  );
}
