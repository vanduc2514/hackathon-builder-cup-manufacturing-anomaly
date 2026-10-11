// KaizenImpactView: live impact metrics, backend benchmarks, what-if model and the closed-loop learning feed.
import React from 'react';
import type { IncidentState, ManufacturingBenchmark } from '../../types';
import WhatIfCalculator from '../WhatIfCalculator';
import { useApi } from '../../lib/api';
import { formatClock, matchesAgentRole, titleCase } from '../../lib/incident';

interface KaizenImpactViewProps {
  incident: IncidentState | null;
}

const fmtCo2 = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`);

export default function KaizenImpactView({ incident }: KaizenImpactViewProps): React.ReactElement {
  const bench = useApi<Record<string, ManufacturingBenchmark>>('/api/impact/benchmarks');
  const impact = incident?.impact ?? null;
  const benchmarks = bench.data;
  const keys = Object.keys(benchmarks ?? {});
  const activeKey = impact?.factory_type && benchmarks?.[impact.factory_type] ? impact.factory_type : keys[0];
  const active = activeKey && benchmarks ? benchmarks[activeKey] : null;

  const manual = active?.manual_diagnosis_minutes ?? null;
  const aiMin = active?.ai_diagnosis_minutes ?? null;
  const reduction = manual && aiMin !== null ? ((manual - aiMin) / manual) * 100 : null;

  const learning = (incident?.findings ?? []).filter((f) => matchesAgentRole(f, 'continuous_learning') || matchesAgentRole(f, 'incident_scribe'));
  const sop = typeof incident?.documents?.sop_proposal === 'string' ? (incident.documents.sop_proposal as string) : '';
  const waiting = 'Awaiting incident close';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span className="stitch-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              eco
            </span>
            Continuous Kaizen Metrics
          </span>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>•</span>
          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
            {impact ? `Incident #${incident?.incident_id}` : 'No closed incident yet'}
          </span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>The Kaizen & Impact Hub</h1>
        <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
          Scrap avoided, downtime saved and emissions avoided, calculated by the backend impact model.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="stitch-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Avoided Scrap Value</span>
            {impact?.factory_type && (
              <span className="stitch-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
                {titleCase(impact.factory_type)}
              </span>
            )}
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#059669', letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
            {impact?.cost_savings_usd !== undefined ? `$${impact.cost_savings_usd.toLocaleString()}` : '—'}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>
            {impact ? `Prevented ${impact.scrap_avoided} parts from entering the scrap bin.` : waiting}
          </p>
        </div>

        <div className="stitch-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Downtime Saved</span>
            {reduction !== null && (
              <span className="stitch-badge" style={{ background: '#eff4ff', color: '#4f46e5' }}>
                -{reduction.toFixed(1)}% MTTR
              </span>
            )}
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#4f46e5', letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
            {impact ? impact.downtime_minutes : '—'}
            {impact && <span style={{ fontSize: '1.25rem', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>min</span>}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>
            {active && manual !== null && aiMin !== null
              ? `Diagnosis in ${aiMin} min with the agent team vs ${manual} min manually (${active.name}).`
              : impact
                ? 'Manual vs AI diagnosis time from the benchmark.'
                : waiting}
          </p>
        </div>

        <div className="stitch-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>Carbon & Energy Conserved</span>
            {impact && (
              <span className="stitch-badge" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                {impact.energy_kwh.toLocaleString()} kWh
              </span>
            )}
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
            {impact ? fmtCo2(impact.co2_kg) : '—'}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>
            {impact
              ? `CO₂e split: energy ${fmtCo2(impact.energy_co2_kg ?? 0)} · material ${fmtCo2(impact.material_co2_kg ?? 0)}.`
              : waiting}
          </p>
        </div>
      </div>

      <WhatIfCalculator benchmarks={benchmarks} loading={bench.loading} error={bench.error} />

      {benchmarks && keys.length > 0 && (
        <div className="stitch-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>Manufacturing benchmarks</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 880 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b' }}>
                  {['Profile', 'Line speed', 'Detection lead', 'Manual / AI diagnosis', 'Energy / unit', 'Part mass', 'Grid / material CO₂', 'Part cost', 'Downtime cost'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontWeight: 650 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="mono">
                {keys.map((k) => {
                  const b = benchmarks[k];
                  const on = k === activeKey;
                  return (
                    <tr key={k} style={{ background: on ? '#f0f4ff' : undefined }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7', fontFamily: 'inherit' }}>
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                        <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{b.description}</div>
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>{b.line_speed_parts_per_min} /min</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>{b.detection_lead_time_minutes} min</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>
                        {b.manual_diagnosis_minutes} / {b.ai_diagnosis_minutes} min
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>{b.energy_kwh_per_unit} kWh</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>{b.part_mass_kg} kg</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>
                        {b.grid_emission_factor_kg_per_kwh} / {b.material_emission_factor_kg_per_kg}
                      </td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>${b.part_cost_usd}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f7' }}>${b.downtime_cost_per_hour_usd.toLocaleString()}/h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="stitch-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
          Closed-Loop Continuous Improvement (Kaizen Loop)
        </h3>
        {learning.length === 0 && !sop ? (
          <p style={{ fontSize: '0.86rem', color: '#64748b', fontStyle: 'italic' }}>
            Lessons learned and SOP proposals appear here after an incident is closed.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {learning.map((f, i) => (
              <div
                key={`${f.agent_id}-${f.timestamp}-${i}`}
                style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem', borderRadius: '10px', background: '#f8f9ff', border: '1px solid #e2e8f0', gap: '1rem' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{f.agent_name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>• {formatClock(f.timestamp)} UTC</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#0f172a', marginTop: '0.25rem', fontWeight: 600 }}>{f.finding}</p>
                  <p style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '0.25rem' }}>{f.evidence}</p>
                </div>
                <span className="stitch-badge" style={{ background: '#fff', border: '1px solid #4f46e533', color: '#4f46e5', flexShrink: 0 }}>
                  {(f.confidence * 100).toFixed(0)}% conf
                </span>
              </div>
            ))}
            {sop && (
              <div style={{ padding: '1rem', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#92400e', marginBottom: 6 }}>SOP revision proposal · Action item</div>
                <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
                  {sop}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
