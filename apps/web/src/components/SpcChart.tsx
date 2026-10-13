// SpcChart: 300-part moving-average defect rate against the 3.0% Upper Control Limit with breach shading.
import React, { useMemo, useState } from 'react';
import type { IncidentState } from '../types';
import { areaPath, noise, smoothPath, type Pt } from '../lib/chart';
import { useElementWidth } from '../lib/useElementWidth';

interface SpcChartProps {
  incident: IncidentState | null;
  height?: number;
  compact?: boolean;
}

const N = 48;
const PART_STEP = 25;
const BASE_PART = 8080;

function buildSeries(incident: IncidentState | null): number[] {
  const status = incident?.status ?? 'normal';
  const current = incident?.defect_rate ?? 0.0042;
  const base = 0.0044;
  const series = Array.from({ length: N }, (_, i) => Math.max(0.001, base + noise(i + 3) * 0.0011));
  const spiking = !['normal', 'dismissed'].includes(status);
  if (!spiking) {
    series[N - 1] = current;
    return series;
  }
  const peak = Math.max(current, incident?.spc_ucl ? incident.spc_ucl * 1.14 : 0.0342);
  const onset = N - 14;
  for (let i = onset; i < N; i++) {
    const t = (i - onset) / 6;
    series[i] = base + (peak - base) * Math.min(1, t * t) + noise(i) * 0.0008;
  }
  if (status === 'verifying' || status === 'closed') {
    const recover = N - 5;
    for (let i = recover; i < N; i++) {
      const t = (i - recover + 1) / 5;
      series[i] = peak - (peak - base) * t + noise(i + 9) * 0.0005;
    }
  }
  series[N - 1] = current;
  return series;
}

export default function SpcChart({ incident, height = 220, compact = false }: SpcChartProps): React.ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const ucl = incident?.spc_ucl ?? 0.03;
  const series = useMemo(() => buildSeries(incident), [incident]);
  const cl = 0.0044;

  const [boxRef, W] = useElementWidth<HTMLDivElement>();
  const H = height;
  const pad = { t: 22, r: 16, b: 28, l: 44 };
  const maxY = Math.max(ucl * 1.35, ...series) * 1.05;
  const x = (i: number) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const pts: Pt[] = series.map((v, i) => ({ x: x(i), y: y(v) }));
  const breachIdx = series.findIndex((v) => v >= ucl);
  const lastBreach = series.reduce((acc, v, i) => (v >= ucl ? i : acc), -1);
  const current = series[N - 1];
  const breached = current >= ucl;
  const cpk = breachIdx >= 0 ? 0.84 : 1.84;

  return (
    <section className={compact ? '' : 'glass card-pad'} aria-label="Statistical process control chart">
      <div className="row between wrap" style={{ gap: 10, marginBottom: 10 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              query_stats
            </span>
            Statistical Process Control
          </h2>
          <p className="card-sub">300-part moving-average defect rate vs. UCL {(ucl * 100).toFixed(1)}%</p>
        </div>
        <span className={`chip ${breached ? 'chip-red' : breachIdx >= 0 ? 'chip-amber' : 'chip-green'}`}>
          <span className="dot" />
          {breached ? `Breach ${(current * 100).toFixed(2)}%` : breachIdx >= 0 ? 'Recovering' : 'In control'}
        </span>
      </div>

      <div ref={boxRef} style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const idx = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (N - 1));
            setHover(idx >= 0 && idx < N ? idx : null);
          }}
        >
          <defs>
            <linearGradient id="spcFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5b5bf0" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5b5bf0" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.01, 0.02, 0.03, 0.04].filter((v) => v <= maxY).map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(15,23,42,0.06)" />
              <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="var(--font-mono)">
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {breachIdx >= 0 && (
            <rect
              x={x(Math.max(0, breachIdx - 0.5))}
              y={pad.t}
              width={x(lastBreach + 0.5) - x(Math.max(0, breachIdx - 0.5))}
              height={H - pad.t - pad.b}
              fill="rgba(229,72,77,0.08)"
              rx="8"
            />
          )}

          <line x1={pad.l} x2={W - pad.r} y1={y(ucl)} y2={y(ucl)} stroke="#e5484d" strokeDasharray="5 4" strokeWidth="1.4" />
          <text x={pad.l + 6} y={y(ucl) - 6} fontSize="10.5" fontWeight="700" fill="#e5484d" fontFamily="var(--font-mono)">
            UCL = {(ucl * 100).toFixed(2)}%
          </text>
          <line x1={pad.l} x2={W - pad.r} y1={y(cl)} y2={y(cl)} stroke="#94a3b8" strokeDasharray="2 4" />
          <text x={W - pad.r} y={y(cl) - 5} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="var(--font-mono)">
            CL {(cl * 100).toFixed(2)}%
          </text>

          <path d={areaPath(pts, H - pad.b)} fill="url(#spcFill)" />
          <path d={smoothPath(pts)} fill="none" stroke="#5b5bf0" strokeWidth="2.4" strokeLinecap="round" />

          {series.map((v, i) =>
            v >= ucl ? <circle key={i} cx={x(i)} cy={y(v)} r="3.6" fill="#e5484d" stroke="#fff" strokeWidth="1.6" /> : null,
          )}
          <circle cx={x(N - 1)} cy={y(current)} r="5" fill={breached ? '#e5484d' : '#5b5bf0'} stroke="#fff" strokeWidth="2.2" />

          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(15,23,42,0.2)" />
              <circle cx={x(hover)} cy={y(series[hover])} r="4.5" fill="#fff" stroke="#5b5bf0" strokeWidth="2" />
            </g>
          )}

          {[0, Math.floor(N / 3), Math.floor((2 * N) / 3), N - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill={i === N - 1 && breached ? '#e5484d' : '#94a3b8'}
              fontWeight={i === N - 1 ? 700 : 400}
              fontFamily="var(--font-mono)"
            >
              Part #{BASE_PART + i * PART_STEP}
              {i === N - 1 ? ' (now)' : ''}
            </text>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="glass glass-strong mono"
            style={{
              position: 'absolute',
              top: 0,
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > N * 0.7 ? '-105%' : '8%'})`,
              padding: '6px 10px',
              borderRadius: 10,
              fontSize: '0.7rem',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Part #{BASE_PART + hover * PART_STEP} · <strong style={{ color: series[hover] >= ucl ? '#e5484d' : 'var(--accent)' }}>{(series[hover] * 100).toFixed(2)}%</strong>
          </div>
        )}
      </div>

      <div className="glass-inset row between" style={{ marginTop: 10, padding: '0.55rem 0.8rem', fontSize: '0.74rem' }}>
        <span className="row" style={{ gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--muted)' }}>
            bar_chart
          </span>
          Process capability
        </span>
        <span className="mono" style={{ fontWeight: 700, color: cpk < 1.33 ? '#c9343a' : '#0e8a43' }}>
          Cpk {cpk.toFixed(2)} {cpk < 1.33 ? '(Degraded)' : '(Capable)'}
        </span>
      </div>
    </section>
  );
}
