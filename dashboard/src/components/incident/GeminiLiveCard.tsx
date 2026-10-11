// GeminiLiveCard: live Gemini Live proxy status and technician sessions from /api/gemini-live/*.
import React from 'react';
import { useApi } from '../../lib/api';
import { formatClock } from '../../lib/incident';
import type { GeminiLiveSessionStatus, GeminiLiveStatus } from '../../types';

interface GeminiLiveCardProps {
  machine: string | null;
  pollMs?: number;
}

export default function GeminiLiveCard({ machine, pollMs = 5000 }: GeminiLiveCardProps): React.ReactElement {
  const status = useApi<GeminiLiveStatus>('/api/gemini-live/status', pollMs);
  const sessions = useApi<GeminiLiveSessionStatus[]>('/api/gemini-live/sessions', pollMs);
  const s = status.data;
  const list = sessions.data ?? [];
  const offline = !s && !status.loading;

  return (
    <div className="col" style={{ gap: 10 }} id="gemini-live-card">
      <div className="row between">
        <span className="eyebrow">Gemini Live session{machine ? ` · ${machine}` : ''}</span>
        <span className={`chip mono ${offline ? 'chip-red' : s?.status === 'healthy' ? 'chip-green' : ''}`} style={{ fontWeight: 700 }}>
          {offline ? 'OFFLINE' : s ? s.status.toUpperCase() : '…'}
        </span>
      </div>
      {s && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[
            { k: 'Mode', v: s.simulation_mode ? 'Simulation' : 'Live' },
            { k: 'Active sessions', v: String(s.active_sessions) },
            { k: 'Model', v: s.default_model },
            { k: 'Voice / language', v: `${s.default_voice} · ${s.default_language}` },
          ].map((c) => (
            <div key={c.k} style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid var(--hair)', borderRadius: 12, padding: '0.45rem 0.65rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{c.k}</div>
              <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, overflowWrap: 'anywhere' }}>
                {c.v}
              </div>
            </div>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p style={{ fontSize: '0.84rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          {offline ? 'Gemini Live service is not reachable.' : 'No technician session is connected yet — the Copilot stream appears here once one opens.'}
        </p>
      ) : (
        <ul className="col" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
          {list.map((x) => (
            <li
              key={x.session_id}
              className="row wrap"
              style={{ gap: '4px 12px', padding: '0.5rem 0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.92)', border: '1px solid var(--hair)', fontSize: '0.76rem' }}
            >
              <span className="mono" style={{ fontWeight: 700 }}>
                {x.session_id.slice(0, 12)}
              </span>
              <span className="chip mono">{x.status}</span>
              <span className="chip mono">{x.mode}</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>
                ↑ {x.client_messages_received} · ↓ {x.server_messages_sent}
              </span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {formatClock(x.created_at)} → {formatClock(x.last_active_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
