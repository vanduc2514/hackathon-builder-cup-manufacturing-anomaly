// ImpactCard: measured scrap, downtime, CO₂e and cost avoided for the current incident (from the Blackboard).
import React from 'react';
import type { ImpactMetrics } from '../types';

interface ImpactCardProps {
  impact: ImpactMetrics | null;
  incidentId: string;
  isLive: boolean;
}

export default function ImpactCard({ impact, incidentId, isLive }: ImpactCardProps): React.ReactElement {
  const m = impact ?? { scrap_avoided: 142, downtime_minutes: 192, energy_kwh: 318, co2_kg: 1240, cost_savings_usd: 18460 };
  const tiles = [
    { label: 'Scrap avoided', value: m.scrap_avoided.toLocaleString(), unit: 'parts', icon: 'inventory_2', color: '#5b5bf0', sub: 'Defects stopped before EOL' },
    { label: 'Downtime saved', value: (m.downtime_minutes / 60).toFixed(1), unit: 'hours', icon: 'timer', color: '#f5a524', sub: `${m.downtime_minutes} min faster MTTR` },
    { label: 'CO₂e avoided', value: m.co2_kg >= 1000 ? (m.co2_kg / 1000).toFixed(2) : m.co2_kg.toFixed(0), unit: m.co2_kg >= 1000 ? 't' : 'kg', icon: 'eco', color: '#12a150', sub: `${m.energy_kwh.toFixed(0)} kWh energy + material` },
    { label: 'Cost avoided', value: `$${(m.cost_savings_usd ?? 0).toLocaleString()}`, unit: '', icon: 'payments', color: '#0b1220', sub: 'Scrap + lost production' },
  ];

  return (
    <section className="glass card-pad" aria-label="Incident impact metrics">
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--green)' }}>
              energy_savings_leaf
            </span>
            Measured Impact
          </h2>
          <p className="card-sub mono">
            #{incidentId} · {impact ? 'Impact Calculator agent' : 'reference values'}
          </p>
        </div>
        <span className={`chip ${isLive && impact ? 'chip-green' : ''}`}>{isLive && impact ? 'Live' : 'Archived'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }} className="stagger">
        {tiles.map((t) => (
          <div key={t.label} className="glass-inset" style={{ padding: '0.9rem' }}>
            <div className="row between">
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 600 }}>{t.label}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: t.color }}>
                {t.icon}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <span className="kpi-value" style={{ fontSize: '1.7rem' }}>
                {t.value}
              </span>
              {t.unit && <span className="kpi-unit">{t.unit}</span>}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--faint)', marginTop: 4 }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
