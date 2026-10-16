// IncidentsEmptyView: nominal line state display when no active anomalies are being investigated.
import React from 'react';
import type { IncidentSummary } from '../../types';
import { useApi } from '../../lib/api';
import { LINE_LABEL } from '../../lib/fleet';

interface IncidentsEmptyViewProps {
  onOpenSimulation: () => void;
  onNavigateHome: () => void;
}

function statusChipClass(status: string): string {
  switch (status) {
    case 'closed':
      return 'chip-green';
    case 'repairing':
    case 'verifying':
      return 'chip-amber';
    case 'escalated':
      return 'chip-red';
    default:
      return 'chip-accent';
  }
}

function formatTimestamp(ts?: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export default function IncidentsEmptyView({
  onOpenSimulation,
  onNavigateHome,
}: IncidentsEmptyViewProps): React.ReactElement {
  const { data: recent, error, loading } = useApi<IncidentSummary[]>('/api/incidents/history?limit=5');

  return (
    <div
      className="page"
      style={{
        gap: '1.5rem',
        maxWidth: 1040,
        margin: '0 auto',
        width: '100%',
        minWidth: 0,
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}
    >
      <header className="col" style={{ gap: 6 }}>
        <nav aria-label="Breadcrumb" className="row" style={{ gap: 8, fontSize: '0.84rem', color: 'var(--text)' }}>
          <button type="button" className="crumb" onClick={onNavigateHome}>
            Overview
          </button>
          <span>/</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Incidents</span>
        </nav>
      </header>

      <section
        className="glass glass-strong col"
        style={{
          borderRadius: 24,
          padding: '2.5rem 1.75rem',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--green-soft)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--green)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 44 }}>
            check_circle
          </span>
        </div>

        <div className="col" style={{ gap: 6, maxWidth: 560 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 750,
              color: 'var(--ink)',
              margin: 0,
              letterSpacing: '-0.02em',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            All systems nominal on {LINE_LABEL}
          </h1>
          <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.95rem' }}>
            No active anomalies
          </p>
        </div>

        <div className="row wrap" style={{ gap: '0.75rem', marginTop: '0.75rem', justifyContent: 'center' }}>
          <button
            id="incidents-empty-inject-btn"
            type="button"
            className="btn btn-dark"
            onClick={onOpenSimulation}
            style={{ minHeight: 44, padding: '0 1.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
              sensors
            </span>
            Incident &amp; Factory Monitor
          </button>
          <button
            id="incidents-empty-back-btn"
            type="button"
            className="btn glass"
            onClick={onNavigateHome}
            style={{ minHeight: 44, padding: '0 1.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
              arrow_back
            </span>
            Back to Line Overview
          </button>
        </div>
      </section>

      <section className="glass col" style={{ borderRadius: 24, padding: '1.5rem', gap: '1rem' }}>
        <div className="row between wrap" style={{ gap: '0.5rem' }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              Recent Incidents
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
              Latest incidents on this line
            </span>
          </div>
          {recent && recent.length > 0 && (
            <span className="chip chip-accent mono">{recent.length} recent</span>
          )}
        </div>

        {loading && (
          <div className="col" style={{ padding: '2rem 1rem', alignItems: 'center', color: 'var(--text)' }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 24, marginBottom: 8 }}>
              progress_activity
            </span>
            <span style={{ fontSize: '0.9rem' }}>Loading recent incident history…</span>
          </div>
        )}

        {error && (
          <div
            className="row"
            style={{
              padding: '1rem',
              borderRadius: 14,
              background: 'var(--red-soft)',
              border: '1px solid var(--hair-strong)',
              color: 'var(--red)',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            <span className="material-symbols-outlined">error</span>
            <span style={{ fontSize: '0.88rem' }}>Failed to load incident history: {error}</span>
          </div>
        )}

        {!loading && !error && (!recent || recent.length === 0) && (
          <div
            className="col"
            style={{
              padding: '2.5rem 1rem',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'var(--text)',
              gap: 6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--faint)' }}>
              inbox
            </span>
            <span style={{ fontSize: '0.92rem', fontWeight: 550, color: 'var(--ink)' }}>
              No incidents recorded yet
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
              When line incidents occur, historical records will appear here.
            </span>
          </div>
        )}

        {!loading && !error && recent && recent.length > 0 && (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="fleet-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Incident ID</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Defect Type</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inc) => (
                  <tr key={inc.incident_id}>
                    <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                      <span className="mono" style={{ color: 'var(--ink)' }}>
                        {inc.incident_id}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span className={`chip ${statusChipClass(inc.status)}`}>
                        {inc.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text)' }}>
                      {inc.defect_type ?? '—'}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text)', fontSize: '0.85rem' }}>
                      {formatTimestamp(inc.closed_at || inc.updated_at || inc.opened_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
