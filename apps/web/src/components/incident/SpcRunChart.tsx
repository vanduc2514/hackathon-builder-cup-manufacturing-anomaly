// SpcRunChart: 60-part end-of-line defect-rate run chart with UCL excursion shading.
import React from 'react';
import { noise, smoothPath, type Pt } from '../../lib/chart';
import { useElementWidth } from '../../lib/useElementWidth';

interface SpcRunChartProps {
  peak: number;
  ucl: number;
  mean: number;
}

const N = 60;

/** Baseline noise around the mean, a ramp into the excursion peaking at `peak`, then recovery below UCL. */
function buildSeries(peak: number, ucl: number, mean: number): number[] {
  const excursion = [ucl * 1.01, ucl * 1.07, peak, ucl * 1.03];
  return Array.from({ length: N }, (_, i) => {
    if (i < 42) return mean * (1.7 + noise(i + 3) * 0.3);
    if (i < 50) return mean * 1.7 + ((i - 41) / 9) * (ucl * 0.85 - mean * 1.7);
    if (i < 54) return excursion[i - 50];
    return ucl * (0.93 - (i - 54) * 0.04);
  });
}

export default function SpcRunChart({ peak, ucl, mean }: SpcRunChartProps): React.ReactElement {
  const [ref, W] = useElementWidth<HTMLDivElement>(560);
  const H = 210;
  const pad = { l: 8, r: 8, t: 36, b: 8 };
  const max = Math.max(peak, ucl) * 1.12;
  const x = (i: number) => pad.l + (i / (N - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const series = buildSeries(peak, ucl, mean);
  const pts: Pt[] = series.map((v, i) => ({ x: x(i), y: y(v) }));
  const over = series.map((v, i) => (v >= ucl ? i : -1)).filter((i) => i >= 0);
  const peakIdx = series.indexOf(Math.max(...series));
  const bandStart = over.length ? x(over[0] - 0.5) : 0;
  const bandEnd = over.length ? x(Math.min(N - 1, over[over.length - 1] + 1.5)) : 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 4, right: 8, zIndex: 2 }}>
        <span
          className="chip chip-neutral"
          style={{ fontSize: 10, padding: '2px 6px' }}
          title="SPC run chart modeled from sample defect rate and statistical upper control limits"
        >
          Statistical Distribution
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}>
        {over.length > 0 && (
          <rect x={bandStart} y={y(ucl) - 4} width={bandEnd - bandStart} height={H - pad.b - y(ucl) + 4} fill="rgba(229,72,77,0.12)" />
        )}
        <line x1={pad.l} x2={W - pad.r} y1={y(ucl)} y2={y(ucl)} stroke="#e5484d" strokeOpacity="0.7" strokeDasharray="3 4" strokeWidth="1.5" />
        <path d={smoothPath(pts, 0.35)} fill="none" stroke="#475569" strokeWidth="1.8" strokeLinejoin="round" />
        {over.map((i) => (
          <circle key={i} cx={x(i)} cy={y(series[i])} r="4.5" fill="#c9343a" stroke="#fff" strokeWidth="1.5" />
        ))}
        {over.length > 0 && (
          <text x={x(peakIdx)} y={y(series[peakIdx]) - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#c9343a" fontFamily="var(--font-mono)">
            UCL EXCURSION ({(peak * 100).toFixed(2)}%)
          </text>
        )}
      </svg>
    </div>
  );
}
