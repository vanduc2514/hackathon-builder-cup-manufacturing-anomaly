// MachineFleetTable: filterable machine list with live vibration, spindle load, status and incident jump-off.
import React, { useMemo, useState } from 'react';
import type { FleetRow, FleetStatus } from '../../lib/fleet';

interface MachineFleetTableProps {
  rows: FleetRow[];
  loading: boolean;
  onOpenIncident: (incidentId: string) => void;
  onDiagnostics: (machineId: string) => void;
}

type Filter = 'all' | 'nominal' | 'anomaly';

const STATUS_CHIP: Record<FleetStatus, { label: string; cls: string }> = {
  nominal: { label: 'Nominal', cls: 'chip-green' },
  watch: { label: 'Watch', cls: 'chip-amber' },
  critical: { label: 'CRITICAL', cls: 'chip-red' },
  signoff: { label: 'Sign-off', cls: 'chip-amber' },
  offline: { label: 'No signal', cls: '' },
};

const isAnomaly = (r: FleetRow) => r.status !== 'nominal' && r.status !== 'offline';

export default function MachineFleetTable({ rows, loading, onOpenIncident, onDiagnostics }: MachineFleetTableProps): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('anomaly');
  const [query, setQuery] = useState<string>('');

  const counts = {
    all: rows.length,
    nominal: rows.filter((r) => r.status === 'nominal').length,
    anomaly: rows.filter(isAnomaly).length,
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'nominal' && r.status !== 'nominal') return false;
      if (filter === 'anomaly' && !isAnomaly(r)) return false;
      return !q || `${r.id} ${r.bay} ${r.part} ${r.op}`.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  return (
    <section className="glass fleet-card">
      <div className="row between wrap fleet-toolbar">
        <div className="row" style={{ gap: 6 }} role="tablist" aria-label="Machine status filter">
          {(['anomaly', 'nominal', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`pill ${filter === f ? 'pill-on' : ''} ${f === 'anomaly' ? 'pill-anomaly' : ''} ${f === 'anomaly' && counts.anomaly ? 'pill-alert' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'anomaly' && counts.anomaly > 0 && <span className="dot" />}
              {f === 'all' ? 'All' : f === 'nominal' ? 'Nominal' : 'Anomaly'} ({counts[f]})
            </button>
          ))}
        </div>
        <label className="glass-inset search-field row fleet-search">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--faint)' }}>
            search
          </span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter machine or bay…" aria-label="Filter machine or bay" />
        </label>
      </div>

      <div className="fleet-scroll">
        <table className="fleet-table">
          <thead>
            <tr>
              <th>Machine ID</th>
              <th>Part Model</th>
              <th>Vibration RMS</th>
              <th>Spindle Load</th>
              <th>Status</th>
              <th>Incident ID</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const hot = r.status === 'critical';
              const chip = STATUS_CHIP[r.status];
              return (
                <tr key={r.id} className={hot ? 'row-hot' : undefined}>
                  <td>
                    <span className="row" style={{ gap: 6, fontWeight: 650, color: 'var(--ink)' }}>
                      {r.id}
                      {isAnomaly(r) && r.bay !== '—' && <span style={{ fontWeight: 500 }}>({r.bay})</span>}
                      {hot && (
                        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--red)' }}>
                          error
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="col">
                      <span>{r.part}</span>
                      {r.op && <span className="kpi-hint">{r.op}</span>}
                    </span>
                  </td>
                  <td className="mono" style={{ color: hot ? '#c9343a' : undefined, fontWeight: hot ? 650 : 500 }}>
                    {r.vibration !== null ? `${r.vibration.toFixed(2)} mm/s${hot ? ' (!)' : ''}` : '—'}
                  </td>
                  <td className="mono" style={{ color: hot ? '#c9343a' : undefined, fontWeight: hot ? 650 : 500 }}>
                    {r.load !== null ? `${r.load.toFixed(1)}%` : '—'}
                  </td>
                  <td>
                    <span className={`chip ${chip.cls}`} style={hot ? { fontWeight: 750 } : undefined}>
                      <span className="dot" />
                      {chip.label}
                    </span>
                  </td>
                  <td className="mono">
                    {r.incidentId ? (
                      <button type="button" className="incident-link" onClick={() => onOpenIncident(r.incidentId as string)}>
                        {r.incidentId}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--faint)' }}>None</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.incidentId ? (
                      <button
                        id={`fleet-open-${r.id}`}
                        type="button"
                        className="btn btn-dark btn-sm"
                        onClick={() => onOpenIncident(r.incidentId as string)}
                      >
                        OPEN {r.incidentId}
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </button>
                    ) : (
                      <button id={`fleet-diag-${r.id}`} type="button" className="btn btn-sm" onClick={() => onDiagnostics(r.id)}>
                        Diagnostics
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="kpi-hint" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  {loading ? 'Loading telemetry…' : 'No machines match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
