// AndonPhaseTracker: 4-phase industrial Andon lifecycle (A→D) with live lamps and expandable phase detail.
import React, { useState } from 'react';
import type { AndonPhaseKey, AndonPhaseStatus, IncidentState } from '../types';
import { PHASES, STATUS_LABEL, getPhaseStatus } from '../lib/incident';

interface AndonPhaseTrackerProps {
  incident: IncidentState | null;
}

const STATUS_TEXT: Record<AndonPhaseStatus, string> = {
  pending: 'Standby',
  active: 'Live',
  completed: 'Done',
  escalated: 'Escalated',
};

export default function AndonPhaseTracker({ incident }: AndonPhaseTrackerProps): React.ReactElement {
  const [expanded, setExpanded] = useState<AndonPhaseKey | null>(null);
  const status = incident?.status ?? 'normal';
  const statuses = PHASES.map((p) => getPhaseStatus(p.key, status));
  const activeIdx = statuses.findIndex((s) => s === 'active' || s === 'escalated');
  const railPct = status === 'closed' ? 100 : activeIdx > 0 ? (activeIdx / (PHASES.length - 1)) * 100 : 0;
  const latest = incident?.findings?.length ? incident.findings[incident.findings.length - 1] : null;
  const detail = PHASES.find((p) => p.key === expanded) ?? null;

  return (
    <section className="glass card-pad" aria-label="Andon phase tracker">
      <div className="row between wrap" style={{ gap: 12, marginBottom: '1rem' }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              emergency_home
            </span>
            Andon Phase Tracker
          </h2>
          <p className="card-sub">Detection → Tracing &amp; RCA → Resolution &amp; Verification → Learning</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {incident && status !== 'normal' && (
            <span className="chip mono">#{incident.incident_id}</span>
          )}
          <span
            className={`chip ${
              status === 'normal' ? 'chip-green' : status === 'closed' ? 'chip-accent' : status === 'escalated' ? 'chip-red' : 'chip-amber'
            }`}
          >
            <span className="dot" />
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '12.5%',
            right: '12.5%',
            top: 22,
            height: 3,
            borderRadius: 999,
            background: 'rgba(118,128,160,0.16)',
          }}
        >
          <div
            style={{
              width: `${railPct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg,#e5484d,#f5a524,#3b82f6,#12a150)',
              transition: 'width 0.8s var(--ease)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, position: 'relative' }}>
          {PHASES.map((p, i) => {
            const s = statuses[i];
            const lit = s === 'active' || s === 'escalated';
            const done = s === 'completed';
            const lampColor = s === 'escalated' ? '#e5484d' : p.lampHex;
            return (
              <button
                key={p.key}
                id={`andon-phase-${p.key}`}
                type="button"
                onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                className="col"
                style={{
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'center',
                }}
              >
                <span
                  style={
                    {
                      '--lamp': `${lampColor}88`,
                      width: 46,
                      height: 46,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: '1rem',
                      color: lit || done ? '#fff' : 'var(--faint)',
                      background: lit
                        ? `radial-gradient(circle at 35% 30%, #fff8 0%, ${lampColor} 45%, ${lampColor} 100%)`
                        : done
                          ? `linear-gradient(160deg, ${lampColor}, ${lampColor}cc)`
                          : 'rgba(255,255,255,0.85)',
                      border: lit || done ? '2px solid rgba(255,255,255,0.9)' : '1.5px solid var(--hair-strong)',
                      animation: lit ? 'lampGlow 1.6s ease-in-out infinite' : 'none',
                      boxShadow: done ? `0 4px 12px -4px ${lampColor}` : 'inset 0 1px 2px rgba(15,23,42,0.06)',
                      transition: 'all 0.4s var(--ease)',
                      outline: expanded === p.key ? `3px solid ${lampColor}44` : 'none',
                      outlineOffset: 3,
                    } as React.CSSProperties
                  }
                >
                  {done ? (
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                      check
                    </span>
                  ) : (
                    p.letter
                  )}
                </span>
                <span className="col" style={{ gap: 2, alignItems: 'center' }}>
                  <span className="eyebrow" style={{ color: lit ? lampColor : 'var(--faint)' }}>
                    Phase {p.letter} · {STATUS_TEXT[s]}
                  </span>
                  <span style={{ fontSize: '0.84rem', fontWeight: 650, color: lit || done ? 'var(--ink)' : 'var(--muted)' }}>
                    {p.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {detail && (
        <div
          className="glass-inset"
          style={{
            marginTop: '1rem',
            padding: '0.9rem 1rem',
            display: 'grid',
            gridTemplateColumns: '1.3fr 1fr 1fr 1fr',
            gap: 16,
            animation: 'fadeUp 0.35s var(--ease) both',
          }}
        >
          <div>
            <div className="eyebrow" style={{ color: detail.lampHex }}>
              Phase {detail.letter} · {detail.name}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text)', marginTop: 4 }}>{detail.description}</p>
          </div>
          {[
            { label: 'Agents', items: detail.activities },
            { label: 'Inputs', items: detail.inputs },
            { label: 'Outputs', items: detail.outputs },
          ].map((col) => (
            <div key={col.label}>
              <div className="eyebrow">{col.label}</div>
              <ul style={{ listStyle: 'none', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {col.items.map((it) => (
                  <li key={it} style={{ fontSize: '0.74rem', color: 'var(--text)', display: 'flex', gap: 6 }}>
                    <span style={{ color: detail.lampHex }}>•</span>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div
        className="row between"
        style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--hair)', gap: 12, fontSize: '0.76rem' }}
      >
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>
            smart_toy
          </span>
          <strong style={{ whiteSpace: 'nowrap' }}>{latest?.agent_name ?? 'Edge Gateway & SPC Monitor'}</strong>
          <span className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {latest?.finding ?? 'Monitoring Line-01 at 120 fps — defect rate within control limits.'}
          </span>
        </span>
        {latest && (
          <span className="chip chip-accent mono" style={{ flexShrink: 0 }}>
            {(latest.confidence * 100).toFixed(1)}% conf
          </span>
        )}
      </div>
    </section>
  );
}
