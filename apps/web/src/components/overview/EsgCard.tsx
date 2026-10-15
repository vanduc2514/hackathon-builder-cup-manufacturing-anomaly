// EsgCard: total CO2 avoided across resolved incidents (backend impact model), split into energy vs material.
import React, { useEffect, useState } from 'react';
import type { ImpactMetrics } from '../../types';
import type { EsgLedgerEntry } from '../../lib/fleet';
import { formatCo2, sumEsg } from '../../lib/fleet';
import { authFetch } from '../../lib/auth';

interface EsgCardProps {
  ledger: EsgLedgerEntry[];
  factoryType: string;
  onOpenHub: () => void;
}

export default function EsgCard({ ledger, factoryType, onOpenHub }: EsgCardProps): React.ReactElement {
  const [projected, setProjected] = useState<ImpactMetrics | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    authFetch('/api/impact/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factory_type: factoryType }),
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<ImpactMetrics>) : null))
      .then((data) => setProjected(data))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [factoryType]);

  const hasLedger = ledger.length > 0;
  const totals = hasLedger ? sumEsg(ledger) : projected ? sumEsg([{ incidentId: 'projection', impact: projected }]) : null;
  const split = totals && totals.energyCo2 + totals.materialCo2 > 0 ? totals.energyCo2 / (totals.energyCo2 + totals.materialCo2) : 0;

  return (
    <article className="glass kpi-card tone-green-soft">
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow kpi-eyebrow">CO₂e avoided</span>
        <button type="button" className={`chip chip-btn ${hasLedger ? 'chip-green' : ''}`} onClick={onOpenHub} title="Open Knowledge Base">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            eco
          </span>
          {hasLedger ? `${totals?.incidents} resolved` : 'Projected'}
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            arrow_forward
          </span>
        </button>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="kpi-value mono" style={{ color: '#0e8a43' }}>
          {totals ? formatCo2(totals.co2) : '—'}
        </span>
        <span className="kpi-hint">{totals ? `${totals.scrap} pcs · ${totals.energyKwh.toFixed(0)} kWh saved` : ''}</span>
      </div>
      <div className="col" style={{ gap: 5, marginTop: 'auto' }}>
        <div className="row between kpi-line">
          <span className="row" style={{ gap: 6 }}>
            <i className="legend-dot" style={{ background: '#12a150' }} />
            Energy {totals ? formatCo2(totals.energyCo2) : '—'}
          </span>
          <span className="row" style={{ gap: 6 }}>
            <i className="legend-dot" style={{ background: '#7dd3a8' }} />
            Material {totals ? formatCo2(totals.materialCo2) : '—'}
          </span>
        </div>
        <div className="bar bar-split" aria-label="Energy versus material CO2 split">
          <span style={{ width: `${split * 100}%` }} />
          <span style={{ width: `${(1 - split) * 100}%` }} />
        </div>
      </div>
    </article>
  );
}
