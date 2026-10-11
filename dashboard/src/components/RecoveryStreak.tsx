// RecoveryStreak: physical verification gatekeeper — 50 consecutive good parts (0 → 50) before an incident may close.
import React, { useEffect, useRef, useState } from 'react';
import type { IncidentState } from '../types';

interface RecoveryStreakProps {
  incident: IncidentState | null;
  compact?: boolean;
}

export default function RecoveryStreak({ incident, compact = false }: RecoveryStreakProps): React.ReactElement {
  const count = incident?.verification_count ?? 0;
  const target = incident?.verification_target ?? 50;
  const status = incident?.status ?? 'normal';
  const pct = Math.min(100, Math.round((count / Math.max(1, target)) * 100));
  const passed = count >= target;
  const verifying = status === 'verifying';
  const locked = !verifying && !passed;

  const [resetFlash, setResetFlash] = useState<boolean>(false);
  const prev = useRef<number>(count);
  useEffect(() => {
    if (prev.current > 0 && count === 0 && status !== 'normal' && status !== 'closed') {
      setResetFlash(true);
      const id = window.setTimeout(() => setResetFlash(false), 6000);
      prev.current = count;
      return () => window.clearTimeout(id);
    }
    prev.current = count;
  }, [count, status]);

  const cols = compact ? 10 : 25;
  const cellH = compact ? 14 : 18;

  return (
    <section
      className={`glass card-pad ${resetFlash ? 'tone-red' : passed ? 'tone-green' : ''}`}
      aria-label="Physical recovery streak gatekeeper"
      style={{ animation: resetFlash ? 'shake 0.4s ease-in-out 3' : undefined }}
    >
      <div className="row between" style={{ gap: 10 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: passed ? 'var(--green)' : 'var(--accent)' }}>
              {passed ? 'verified' : 'shield_lock'}
            </span>
            Recovery Streak
          </h2>
          <p className="card-sub">Closes on product evidence only — any defect resets to 0</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="kpi-value" style={{ fontSize: compact ? '1.6rem' : '2rem', color: passed ? '#0e8a43' : resetFlash ? '#c9343a' : 'var(--ink)' }}>
            {count}
          </span>
          <span className="kpi-unit">/ {target}</span>
        </div>
      </div>

      <div className="progress" style={{ marginTop: 12, height: 8 }}>
        <span style={{ width: `${pct}%`, background: passed ? 'linear-gradient(90deg,#34d399,#12a150)' : undefined }} />
      </div>

      <div className="row between mono" style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--muted)' }}>
        <span>{pct}% verified</span>
        <span>{locked ? 'Gate locked · awaiting repair' : passed ? 'Criteria satisfied · zero-defect run' : `${target - count} parts to go`}</span>
      </div>

      {resetFlash && (
        <div className="row" style={{ gap: 8, marginTop: 10, fontSize: '0.76rem', fontWeight: 650, color: '#c9343a' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            restart_alt
          </span>
          Defect recurred — streak reset to 0, incident re-opened for analysis.
        </div>
      )}

      <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>
        Inspection stream · CAM-LINE01-EOL
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
        {Array.from({ length: target }, (_, i) => {
          const filled = i < count;
          const next = i === count && verifying;
          return (
            <span
              key={i}
              title={`Part ${i + 1}`}
              style={{
                height: cellH,
                borderRadius: 5,
                background: filled
                  ? passed
                    ? 'linear-gradient(160deg,#34d399,#12a150)'
                    : 'linear-gradient(160deg,#7c7cff,#5b5bf0)'
                  : 'rgba(118,128,160,0.12)',
                boxShadow: filled ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'inset 0 1px 1px rgba(15,23,42,0.05)',
                outline: next ? '2px solid var(--accent-ring)' : 'none',
                animation: next ? 'pulseGlow 1.2s infinite' : filled ? `cellIn 0.35s var(--ease) both` : undefined,
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
