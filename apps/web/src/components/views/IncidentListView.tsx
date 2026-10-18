// IncidentListView: every incident on the line with its archive state; archiving hides it from the technician app.
import React, { useState } from 'react';
import type { IncidentState, IncidentSummary } from '../../types';
import type { ToastTone } from '../../App';
import { useApi } from '../../lib/api';
import { authFetch } from '../../lib/auth';

interface IncidentListViewProps {
  incident: IncidentState | null;
  onNavigateHome: () => void;
  onOpenIncident: (incidentId: string) => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type ArchiveFilter = 'all' | 'unarchived' | 'archived';

const FILTERS: { key: ArchiveFilter; label: string }[] = [
  { key: 'unarchived', label: 'Unarchived' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

/** Live-incident statuses still being worked; mirrors IN_PROGRESS_STATUSES in backend/agents/orchestrator.py. */
const IN_PROGRESS: Record<string, true> = {
  detecting: true,
  tracing: true,
  investigating: true,
  analyzing: true,
  awaiting_evidence: true,
  repairing: true,
  verifying: true,
  pending_approval: true,
};

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

function matchesFilter(inc: IncidentSummary, filter: ArchiveFilter): boolean {
  if (filter === 'all') return true;
  return Boolean(inc.archived) === (filter === 'archived');
}

export default function IncidentListView({
  incident,
  onNavigateHome,
  onOpenIncident,
  onNotify,
}: IncidentListViewProps): React.ReactElement {
  const { data, error, loading, reload } = useApi<IncidentSummary[]>('/api/incidents/history?limit=100', 10000, [
    incident?.incident_id,
    incident?.status,
    incident?.archived,
  ]);
  const [filter, setFilter] = useState<ArchiveFilter>('unarchived');
  const [busyId, setBusyId] = useState<string | null>(null);

  const all = data ?? [];
  const rows = all.filter((inc) => matchesFilter(inc, filter));

  const setArchived = async (id: string, archived: boolean): Promise<void> => {
    const verb = archived ? 'archive' : 'unarchive';
    setBusyId(id);
    try {
      const res = await authFetch(`/api/incidents/${encodeURIComponent(id)}/${verb}`, { method: 'POST' });
      if (res.ok) {
        onNotify(`Incident ${id} ${verb}d`, 'success');
        reload();
      } else {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { detail?: unknown };
          if (typeof body.detail === 'string') detail = body.detail;
        } catch {
          // Non-JSON error body: keep the HTTP status as the message.
        }
        onNotify(detail, 'error');
      }
    } catch {
      onNotify(`Failed to ${verb} incident`, 'error');
    } finally {
      setBusyId(null);
    }
  };

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

      <section className="glass col" style={{ borderRadius: 24, padding: '1.5rem', gap: '1rem' }}>
        <div className="row between wrap" style={{ gap: '0.75rem' }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Incidents</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
              Archived incidents are hidden from the technician app; unarchive to restore them
            </span>
          </div>
          <div className="seg" role="group" aria-label="Archive filter">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                id={`incident-filter-${f.key}`}
                type="button"
                className={filter === f.key ? 'active' : ''}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="mono">{all.filter((inc) => matchesFilter(inc, f.key)).length}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && !data && (
          <div className="col" style={{ padding: '2rem 1rem', alignItems: 'center', color: 'var(--text)' }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 24, marginBottom: 8 }}>
              progress_activity
            </span>
            <span style={{ fontSize: '0.9rem' }}>Loading incidents…</span>
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
            <span style={{ fontSize: '0.88rem' }}>Failed to load incidents: {error}</span>
          </div>
        )}

        {data && rows.length === 0 && (
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
              No incidents match this filter
            </span>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="fleet-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Incident ID</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Machine</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Defect Type</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Archive State</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Timestamp</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inc) => {
                  const liveStatus = incident?.incident_id === inc.incident_id ? incident.status : null;
                  const isLive = liveStatus !== null && liveStatus !== 'normal';
                  const inProgress = liveStatus !== null && IN_PROGRESS[liveStatus] === true;
                  return (
                    <tr key={inc.incident_id}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                        <span className="mono" style={{ color: 'var(--ink)' }}>
                          {inc.incident_id}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`chip ${statusChipClass(inc.status)}`}>{inc.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="mono" style={{ padding: '0.75rem', color: 'var(--text)' }}>
                        {inc.suspect_machine ?? '—'}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text)' }}>{inc.defect_type ?? '—'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {inc.archived ? (
                          <span className="chip chip-accent">Archived</span>
                        ) : (
                          <span className="chip">Unarchived</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text)', fontSize: '0.85rem' }}>
                        {formatTimestamp(inc.closed_at || inc.updated_at || inc.opened_at)}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {inc.archived ? (
                          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{inc.archived_by ?? '—'}</span>
                            <button
                              id={`unarchive-btn-${inc.incident_id}`}
                              type="button"
                              className="btn btn-sm"
                              disabled={busyId === inc.incident_id}
                              onClick={() => void setArchived(inc.incident_id, false)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                unarchive
                              </span>
                              Unarchive
                            </button>
                          </div>
                        ) : (
                          <div className="row" style={{ gap: 8 }}>
                            {isLive && (
                              <button
                                id={`view-btn-${inc.incident_id}`}
                                type="button"
                                className="btn btn-sm"
                                onClick={() => onOpenIncident(inc.incident_id)}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                  open_in_new
                                </span>
                                View
                              </button>
                            )}
                            <button
                              id={`archive-btn-${inc.incident_id}`}
                              type="button"
                              className="btn btn-sm"
                              disabled={inProgress || busyId === inc.incident_id}
                              title={inProgress ? 'Incident still in progress' : undefined}
                              onClick={() => void setArchived(inc.incident_id, true)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                archive
                              </span>
                              Archive
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
