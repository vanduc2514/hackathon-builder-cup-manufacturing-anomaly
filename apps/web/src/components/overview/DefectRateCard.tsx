// DefectRateCard: end-of-line defect rate against the SPC upper control limit.
import React from 'react';
import type { IncidentState } from '../../types';
import { formatPct } from '../../lib/incident';

interface DefectRateCardProps {
  incident: IncidentState | null;
}

export default function DefectRateCard({ incident }: DefectRateCardProps): React.ReactElement {
  const rate = incident?.defect_rate ?? null;
  const ucl = incident?.spc_ucl ?? null;
  const ratio = rate !== null && ucl ? rate / ucl : null;
  const breach = ratio !== null && ratio > 1;
  const warn = ratio !== null && ratio > 0.8 && !breach;
  const scale = Math.max(rate ?? 0, ucl ?? 0) * 1.15 || 1;
  const tone = breach ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--green)';

  return (
    <article className="glass kpi-card">
      <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span className="eyebrow kpi-eyebrow">Defect rate vs UCL</span>
        {ratio !== null && (
          <span className={`chip ${breach ? 'chip-red' : warn ? 'chip-amber' : 'chip-green'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {breach ? 'warning' : 'check_circle'}
            </span>
            {breach ? `${ratio.toFixed(1)}x UCL Breach` : `${(ratio * 100).toFixed(0)}% of UCL`}
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="kpi-value mono" style={{ color: breach ? '#c9343a' : undefined }}>
          {rate !== null ? formatPct(rate) : '—'}
        </span>
        <span className="kpi-hint">UCL: {ucl !== null ? formatPct(ucl) : '—'}</span>
      </div>
      <div className="col" style={{ gap: 8, marginTop: 'auto' }}>
        <div className="divider" />
        <div className="row between kpi-line">
          <span>SPC Status</span>
          <span style={{ color: tone, fontWeight: 650 }}>
            {ratio === null ? 'No data' : breach ? 'Critical Exceedance' : warn ? 'Approaching UCL' : 'In Control'}
          </span>
        </div>
        <div className="bar bar-spc" aria-hidden="true">
          <span style={{ width: `${Math.min(100, ((rate ?? 0) / scale) * 100)}%`, background: tone }} />
          {ucl !== null && <i style={{ left: `${(ucl / scale) * 100}%` }} />}
        </div>
        <div className="mono spc-legend">
          UCL: {ucl !== null ? formatPct(ucl) : '—'}{' '}
          <span style={{ color: tone }}>Current: {rate !== null ? formatPct(rate) : '—'}</span>
        </div>
      </div>
    </article>
  );
}
