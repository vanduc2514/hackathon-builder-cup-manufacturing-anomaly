// WhatIfCalculator: interactive ROI / sustainability model driven by /api/impact/benchmarks and /api/impact/calculate.
import React, { useEffect, useMemo, useState } from 'react';
import type { ImpactCalculationRequest, ImpactMetrics, ManufacturingBenchmark } from '../types';

interface WhatIfCalculatorProps {
  benchmarks: Record<string, ManufacturingBenchmark> | null;
  loading: boolean;
  error: string | null;
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, unit, onChange }: SliderProps): React.ReactElement {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <label htmlFor={id} className="col" style={{ gap: 6 }}>
      <span className="row between" style={{ fontSize: '0.76rem' }}>
        <span style={{ color: 'var(--text)', fontWeight: 550 }}>{label}</span>
        <span className="mono" style={{ fontWeight: 700 }}>
          {value}
          <span className="muted" style={{ fontWeight: 500 }}> {unit}</span>
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, rgba(118,128,160,0.18) ${pct}%)` }}
      />
    </label>
  );
}

const fmtCo2 = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg.toFixed(0)} kg`);

export default function WhatIfCalculator({ benchmarks, loading, error }: WhatIfCalculatorProps): React.ReactElement {
  const keys = useMemo(() => Object.keys(benchmarks ?? {}), [benchmarks]);
  const [preset, setPreset] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<number>(0);
  const [manual, setManual] = useState<number>(0);
  const [ai, setAi] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(0);
  const [perMonth, setPerMonth] = useState<number>(4);
  const [result, setResult] = useState<ImpactMetrics | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const base = preset && benchmarks ? benchmarks[preset] : null;

  const applyPreset = (k: string) => {
    const b = benchmarks?.[k];
    if (!b) return;
    setPreset(k);
    setEarlier(b.detection_lead_time_minutes);
    setManual(b.manual_diagnosis_minutes);
    setAi(b.ai_diagnosis_minutes);
    setSpeed(b.line_speed_parts_per_min);
  };

  useEffect(() => {
    if (!preset && keys.length > 0) applyPreset(keys[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  useEffect(() => {
    if (!preset || !base) return;
    const ctrl = new AbortController();
    const body: ImpactCalculationRequest = {
      factory_type: preset,
      earlier_detection_minutes: earlier,
      manual_diagnosis_minutes: manual,
      ai_diagnosis_minutes: ai,
      line_speed_parts_per_min: speed,
    };
    const id = window.setTimeout(() => {
      fetch('/api/impact/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<ImpactMetrics>;
        })
        .then((m) => {
          setResult(m);
          setCalcError(null);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setCalcError(e instanceof Error ? e.message : 'request failed');
        });
    }, 250);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [preset, base, earlier, manual, ai, speed]);

  const yearly = perMonth * 12;
  const maxTimeline = Math.max(manual + earlier, 1);

  if (!benchmarks || !base) {
    return (
      <section className="glass card-pad" aria-label="What-if sustainability calculator">
        <h2 className="card-title">
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
            tune
          </span>
          What-If Sustainability Calculator
        </h2>
        <p className="card-sub">
          {loading ? 'Loading manufacturing benchmarks…' : `Benchmarks unavailable${error ? ` (${error})` : ''} — connect the backend to model impact.`}
        </p>
      </section>
    );
  }

  const tiles = result
    ? [
        { label: 'Scrap avoided', value: result.scrap_avoided.toLocaleString(), unit: 'parts', yearly: `${(result.scrap_avoided * yearly).toLocaleString()} / yr`, icon: 'inventory_2', color: '#5b5bf0' },
        { label: 'Downtime saved', value: (result.downtime_minutes / 60).toFixed(1), unit: 'h', yearly: `${((result.downtime_minutes * yearly) / 60).toFixed(0)} h / yr`, icon: 'timer', color: '#f5a524' },
        { label: 'CO₂e avoided', value: fmtCo2(result.co2_kg), unit: '', yearly: `${fmtCo2(result.co2_kg * yearly)} / yr`, icon: 'eco', color: '#12a150' },
        { label: 'Cost avoided', value: `$${Math.round(result.cost_savings_usd ?? 0).toLocaleString()}`, unit: '', yearly: `$${Math.round((result.cost_savings_usd ?? 0) * yearly).toLocaleString()} / yr`, icon: 'payments', color: '#0b1220' },
      ]
    : [];

  return (
    <section className="glass card-pad" aria-label="What-if sustainability calculator">
      <div className="row between wrap" style={{ gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              tune
            </span>
            What-If Sustainability Calculator
          </h2>
          <p className="card-sub">Backend impact model — {base.description}</p>
        </div>
        <div className="seg">
          {keys.map((k) => (
            <button key={k} id={`whatif-preset-${k}`} type="button" className={preset === k ? 'active' : ''} onClick={() => applyPreset(k)}>
              {benchmarks[k].name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div className="glass-inset col" style={{ padding: '1rem', gap: 16 }}>
          <div className="eyebrow">Assumptions</div>
          <Slider id="whatif-earlier" label="Earlier detection vs. manual QA" value={earlier} min={0} max={120} step={5} unit="min" onChange={setEarlier} />
          <Slider id="whatif-manual" label="Manual diagnosis time" value={manual} min={30} max={480} step={10} unit="min" onChange={setManual} />
          <Slider id="whatif-ai" label="AI-assisted diagnosis time" value={ai} min={5} max={120} step={1} unit="min" onChange={setAi} />
          <Slider id="whatif-speed" label="Line speed" value={speed} min={1} max={40} step={1} unit="parts/min" onChange={setSpeed} />
          <Slider id="whatif-frequency" label="Excursions per month" value={perMonth} min={1} max={20} step={1} unit="/mo" onChange={setPerMonth} />
          <div className="mono" style={{ fontSize: '0.64rem', color: 'var(--faint)', lineHeight: 1.5 }}>
            Grid {base.grid_emission_factor_kg_per_kwh} kgCO₂/kWh · material {base.material_emission_factor_kg_per_kg} kgCO₂/kg ·{' '}
            {base.part_mass_kg} kg/part · {base.energy_kwh_per_unit} kWh/part · ${base.part_cost_usd}/part · $
            {base.downtime_cost_per_hour_usd.toLocaleString()}/h downtime
          </div>
        </div>

        <div className="col" style={{ gap: 12 }}>
          {calcError && (
            <div className="chip chip-red" role="alert">
              Impact calculation failed ({calcError})
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {tiles.map((t) => (
              <div key={t.label} className="glass-inset" style={{ padding: '0.85rem 0.95rem' }}>
                <div className="row between">
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{t.label} / event</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: t.color }}>
                    {t.icon}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className="kpi-value" style={{ fontSize: '1.65rem' }}>
                    {t.value}
                  </span>
                  {t.unit && <span className="kpi-unit">{t.unit}</span>}
                </div>
                <div className="mono" style={{ fontSize: '0.68rem', color: t.color, fontWeight: 650, marginTop: 2 }}>
                  {t.yearly}
                </div>
              </div>
            ))}
            {!result && !calcError && (
              <div className="glass-inset" style={{ gridColumn: '1 / -1', padding: '1rem', color: 'var(--muted)', fontSize: '0.84rem' }}>
                Calculating…
              </div>
            )}
          </div>

          <div className="glass-inset" style={{ padding: '0.9rem 1rem' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Time-to-resolution comparison
            </div>
            {[
              { label: 'Manual QA + diagnosis', mins: manual + earlier, color: 'linear-gradient(90deg,#fda4af,#e5484d)' },
              { label: 'Kaizen agent team', mins: ai, color: 'linear-gradient(90deg,#7c7cff,#5b5bf0)' },
            ].map((b) => (
              <div key={b.label} style={{ marginBottom: 8 }}>
                <div className="row between" style={{ fontSize: '0.72rem', marginBottom: 3 }}>
                  <span>{b.label}</span>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {b.mins} min
                  </span>
                </div>
                <div className="progress" style={{ height: 10 }}>
                  <span style={{ width: `${(b.mins / maxTimeline) * 100}%`, background: b.color }} />
                </div>
              </div>
            ))}
            {result && (
              <div className="row between wrap" style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 6, gap: 8 }}>
                <span>
                  Energy {result.energy_kwh.toLocaleString()} kWh · CO₂ split: energy {fmtCo2(result.energy_co2_kg ?? 0)} · material{' '}
                  {fmtCo2(result.material_co2_kg ?? 0)}
                </span>
                <span className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>
                  {result.factory_type ?? preset}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
