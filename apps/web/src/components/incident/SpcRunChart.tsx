// SpcRunChart: Live 60-part end-of-line defect-rate run chart with UCL excursion shading.
import React from 'react';
import { smoothPath, type Pt } from '../../lib/chart';
import { useElementWidth } from '../../lib/useElementWidth';
import { useApi } from '../../lib/api';
import type { SpcSeriesResponse } from '../../types';

interface SpcRunChartProps {
  machineId?: string | null;
}

export default function SpcRunChart({ machineId }: SpcRunChartProps): React.ReactElement {
  const [ref, W] = useElementWidth<HTMLDivElement>(560);
  const H = 210;
  const pad = { l: 8, r: 8, t: 36, b: 8 };

  const url = machineId
    ? `/api/spc/series?window=60&machine_id=${encodeURIComponent(machineId)}`
    : '/api/spc/series?window=60';
  const { data } = useApi<SpcSeriesResponse>(url, 5000, [machineId]);

  const points = data?.points ?? [];
  const count = points.length;

  if (!data || count === 0) {
    return (
      <div
        ref={ref}
        style={{
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
        }}
      >
        <p className='placeholder'>Waiting for inspection data</p>
      </div>
    );
  }

  const ucl = data.ucl;
  const peakRate = data.peak_rate;
  const max = Math.max(peakRate, ucl, 0.01) * 1.15;

  const x = (i: number) => (count > 1 ? pad.l + (i / (count - 1)) * (W - pad.l - pad.r) : (pad.l + W) / 2);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  const pts: Pt[] = points.map((p, i) => ({ x: x(i), y: y(p.defect_rate) }));
  const oocIndices = points.map((p, i) => (p.out_of_control ? i : -1)).filter((i) => i >= 0);

  // Peak index for the UCL excursion label
  const peakIdx = points.reduce((best, p, i) => (p.defect_rate > points[best].defect_rate ? i : best), 0);

  const bandStart = oocIndices.length > 0 ? x(Math.max(0, oocIndices[0] - 0.5)) : 0;
  const bandEnd =
    oocIndices.length > 0 ? x(Math.min(count - 1, oocIndices[oocIndices.length - 1] + 1.0)) : 0;

  const sourceLabel =
    data.source === 'bigquery'
      ? 'BigQuery Traceability'
      : data.source === 'mock_buffer'
        ? 'Live Buffer'
        : 'Seed Telemetry';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 4, right: 8, zIndex: 2 }}>
        <span
          className='chip chip-neutral'
          style={{ fontSize: 10, padding: '2px 6px' }}
          title={`SPC run chart from ${data.source}`}
        >
          {sourceLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}>
        {oocIndices.length > 0 && (
          <rect
            x={bandStart}
            y={y(ucl) - 4}
            width={Math.max(4, bandEnd - bandStart)}
            height={H - pad.b - y(ucl) + 4}
            fill='rgba(229,72,77,0.12)'
          />
        )}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(ucl)}
          y2={y(ucl)}
          stroke='#e5484d'
          strokeOpacity='0.7'
          strokeDasharray='3 4'
          strokeWidth='1.5'
        />
        <path d={smoothPath(pts, 0.35)} fill='none' stroke='#475569' strokeWidth='1.8' strokeLinejoin='round' />
        {oocIndices.map((i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(points[i].defect_rate)}
            r='4.5'
            fill='#c9343a'
            stroke='#fff'
            strokeWidth='1.5'
          />
        ))}
        {oocIndices.length > 0 && (
          <text
            x={x(peakIdx)}
            y={y(points[peakIdx].defect_rate) - 12}
            textAnchor='middle'
            fontSize='12'
            fontWeight='700'
            fill='#c9343a'
            fontFamily='var(--font-mono)'
          >
            UCL EXCURSION ({(peakRate * 100).toFixed(2)}%)
          </text>
        )}
      </svg>
    </div>
  );
}
