// Knowledge Base: 3 ESG KPI cards, knowledge search, signed-off solutions table and the past 8D slide-over sheet.
import React, { useState } from 'react';
import type { ManufacturingBenchmark } from '../../types';
import type { EsgLedgerEntry } from '../../lib/fleet';
import { formatCo2, sumEsg } from '../../lib/fleet';
import { useApi } from '../../lib/api';
import { titleCase } from '../../lib/incident';
import SideDrawer from '../SideDrawer';
import WhatIfCalculator from '../WhatIfCalculator';
import KnowledgeSearch from '../knowledge/KnowledgeSearch';
import EightDSheet from '../knowledge/EightDSheet';

interface KaizenImpactViewProps {
  esgLedger: EsgLedgerEntry[];
  onOpenDocument: (documentId: string) => void;
  onOpenWalkthrough: (id: string) => void;
}

type Panel = { kind: 'eightd'; incidentId: string } | { kind: 'whatif' } | { kind: 'benchmarks' } | null;

const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

export default function KaizenImpactView({ esgLedger, onOpenDocument, onOpenWalkthrough }: KaizenImpactViewProps): React.ReactElement {
  const bench = useApi<Record<string, ManufacturingBenchmark>>('/api/impact/benchmarks');
  const [panel, setPanel] = useState<Panel>(null);

  const totals = sumEsg(esgLedger);
  const has = totals.incidents > 0;
  const downtime = esgLedger.reduce((s, e) => s + e.impact.downtime_minutes, 0);
  const factory = esgLedger[esgLedger.length - 1]?.impact.factory_type ?? 'aluminum_cnc';
  const solutions = esgLedger.flatMap((e) => (e.solution ? [e.solution] : []));
  const across = has ? `across ${totals.incidents} signed-off incident${totals.incidents > 1 ? 's' : ''}` : 'appears once the first 8D is signed off';

  const kpis = [
    { label: 'Scrap saved', value: has ? `${totals.scrap.toLocaleString('en-US')} pcs` : '—', hint: has ? `${usd(totals.cost)} avoided · ${across}` : across, icon: 'inventory_2', color: 'var(--accent)' },
    { label: 'Downtime saved', value: has ? (downtime >= 120 ? `${(downtime / 60).toFixed(1)} h` : `${downtime} min`) : '—', hint: across, icon: 'timer', color: '#b4710a' },
    {
      label: 'CO₂ offset',
      value: has ? formatCo2(totals.co2) : '—',
      hint: has ? `energy ${formatCo2(totals.energyCo2)} · material ${formatCo2(totals.materialCo2)}` : across,
      icon: 'eco',
      color: '#0e8a43',
    },
  ];

  const openEntry = panel?.kind === 'eightd' ? esgLedger.find((e) => e.incidentId === panel.incidentId) : undefined;

  return (
    <div className="page">
      <header className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Knowledge Base</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            Past 8D fixes signed off on Cell Line 1 — and the scrap, downtime and CO₂ they saved.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="impact-benchmarks" type="button" className="btn" onClick={() => setPanel({ kind: 'benchmarks' })}>
            <span className="material-symbols-outlined">table_view</span>
            Benchmark assumptions
          </button>
          <button id="impact-whatif" type="button" className="btn btn-dark" onClick={() => setPanel({ kind: 'whatif' })}>
            <span className="material-symbols-outlined">tune</span>
            Model a scenario
          </button>
        </div>
      </header>

      <div className="grid esg-kpis stagger">
        {kpis.map((k) => (
          <article key={k.label} className="glass kpi-card" style={{ minHeight: 0 }}>
            <div className="row between">
              <span className="eyebrow kpi-eyebrow">{k.label}</span>
              <span className="material-symbols-outlined" style={{ color: k.color }}>
                {k.icon}
              </span>
            </div>
            <span className="kpi-value mono" style={{ color: k.color }}>
              {k.value}
            </span>
            <span className="kpi-hint">{k.hint}</span>
          </article>
        ))}
      </div>

      <KnowledgeSearch
        solutions={solutions}
        onOpenSolution={(incidentId) => setPanel({ kind: 'eightd', incidentId })}
        onOpenDocument={onOpenDocument}
        onOpenWalkthrough={onOpenWalkthrough}
      />

      <section className="glass fleet-card" aria-label="Signed-off 8D fixes">
        <header className="row between station-head">
          <span className="card-title">Signed-off 8D fixes</span>
          <span className="kpi-hint">Proven on {'≥'}50 good parts and signed off · click a row for the 8D report</span>
        </header>
        {solutions.length === 0 ? (
          <p className="kpi-hint" style={{ padding: '1.2rem 1.25rem' }}>
            No signed-off 8Ds yet. An incident appears here once the shift leader approves its 8D.
          </p>
        ) : (
          <div className="fleet-scroll">
            <table className="fleet-table row-click">
              <thead>
                <tr>
                  <th>8D</th>
                  <th>Problem</th>
                  <th>Root cause</th>
                  <th>Fix</th>
                  <th>Proof</th>
                  <th>CO₂</th>
                  <th>Signed off</th>
                </tr>
              </thead>
              <tbody>
                {[...esgLedger].reverse().map((e) => {
                  const s = e.solution;
                  if (!s) return null;
                  const openRow = () => setPanel({ kind: 'eightd', incidentId: e.incidentId });
                  return (
                    <tr
                      key={e.incidentId}
                      tabIndex={0}
                      onClick={openRow}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          openRow();
                        }
                      }}
                      aria-label={`Open 8D report for ${e.incidentId}`}
                    >
                      <td className="mono" style={{ fontWeight: 650, color: 'var(--accent)' }}>
                        {e.incidentId}
                      </td>
                      <td style={{ whiteSpace: 'normal', minWidth: 170 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.defect}</span>
                        <span className="kpi-hint" style={{ display: 'block' }}>
                          {s.machine ?? '—'}
                          {s.tool ? ` · ${s.tool}` : ''}
                        </span>
                      </td>
                      <td className="cell-clamp">{s.rootCause ?? '—'}</td>
                      <td className="cell-clamp">{s.fix ?? '—'}</td>
                      <td className="mono" style={{ color: '#0e8a43', fontWeight: 650 }}>
                        {s.verified}
                      </td>
                      <td className="mono">{formatCo2(e.impact.co2_kg)}</td>
                      <td>
                        <span className="chip chip-green">{new Date(s.recordedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {panel?.kind === 'eightd' && openEntry?.solution && <EightDSheet solution={openEntry.solution} impact={openEntry.impact} onClose={() => setPanel(null)} />}

      {panel?.kind === 'whatif' && (
        <SideDrawer width={1000} onClose={() => setPanel(null)} title="Model a scenario" eyebrow={<span className="chip">What-if · backend impact model</span>}>
          <WhatIfCalculator benchmarks={bench.data} loading={bench.loading} error={bench.error} />
        </SideDrawer>
      )}

      {panel?.kind === 'benchmarks' && (
        <SideDrawer width={640} onClose={() => setPanel(null)} title="Benchmark assumptions" eyebrow={<span className="chip">/api/impact/benchmarks</span>}>
          {!bench.data && <p className="kpi-hint">{bench.loading ? 'Loading…' : `Benchmarks unavailable${bench.error ? ` (${bench.error})` : ''}`}</p>}
          {Object.entries(bench.data ?? {}).map(([k, b]) => (
            <details key={k} className="glass-inset change-entry" open={k === factory}>
              <summary className="row between" style={{ gap: 10 }}>
                <span className="col" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{titleCase(b.name)}</span>
                  <span className="kpi-hint">{b.description}</span>
                </span>
                <span className="material-symbols-outlined change-chevron" style={{ fontSize: 18, color: 'var(--faint)' }}>
                  expand_more
                </span>
              </summary>
              <dl className="bench-grid">
                <dt>Line speed</dt>
                <dd>{b.line_speed_parts_per_min} parts/min</dd>
                <dt>Detection lead</dt>
                <dd>{b.detection_lead_time_minutes} min</dd>
                <dt>Diagnosis manual / AI</dt>
                <dd>
                  {b.manual_diagnosis_minutes} / {b.ai_diagnosis_minutes} min
                </dd>
                <dt>Energy per part</dt>
                <dd>{+b.energy_kwh_per_unit.toFixed(3)} kWh</dd>
                <dt>Part mass</dt>
                <dd>{+b.part_mass_kg.toFixed(3)} kg</dd>
                <dt>Grid / material CO₂</dt>
                <dd>
                  {+b.grid_emission_factor_kg_per_kwh.toFixed(3)} kg/kWh · {+b.material_emission_factor_kg_per_kg.toFixed(3)} kg/kg
                </dd>
                <dt>Part cost</dt>
                <dd>${b.part_cost_usd}</dd>
                <dt>Downtime cost</dt>
                <dd>${b.downtime_cost_per_hour_usd.toLocaleString('en-US')}/h</dd>
              </dl>
            </details>
          ))}
        </SideDrawer>
      )}
    </div>
  );
}
