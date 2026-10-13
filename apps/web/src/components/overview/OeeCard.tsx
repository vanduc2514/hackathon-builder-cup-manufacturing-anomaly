// OeeCard: line OEE with availability / performance / quality breakdown bars.
import React from 'react';
import type { OeeBreakdown } from '../../lib/fleet';
import { OEE_TARGET } from '../../lib/fleet';

interface OeeCardProps {
  oee: OeeBreakdown | null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function OeeCard({ oee }: OeeCardProps): React.ReactElement {
  const delta = oee ? (oee.oee - OEE_TARGET) * 100 : null;
  const below = delta !== null && delta < 0;
  const parts: { label: string; value: number | null }[] = [
    { label: 'Availability', value: oee?.availability ?? null },
    { label: 'Performance', value: oee?.performance ?? null },
    { label: 'Quality', value: oee?.quality ?? null },
  ];

  return (
    <article className="glass kpi-card">
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow kpi-eyebrow">Line OEE</span>
        {delta !== null && (
          <span className={`chip ${below ? 'chip-amber' : 'chip-green'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {below ? 'trending_down' : 'trending_up'}
            </span>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}% from target
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="kpi-value mono">{oee ? pct(oee.oee) : '—'}</span>
        <span className="kpi-hint">Target: {pct(OEE_TARGET)}</span>
      </div>
      <div className="col" style={{ gap: 10, marginTop: 'auto' }}>
        {parts.map((p) => (
          <div key={p.label} className="col" style={{ gap: 5 }}>
            <div className="row between kpi-line">
              <span>{p.label}</span>
              <span className="mono">{p.value !== null ? pct(p.value) : '—'}</span>
            </div>
            <div className="bar">
              <span style={{ width: `${(p.value ?? 0) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
