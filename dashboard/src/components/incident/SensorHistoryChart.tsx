// SensorHistoryChart: vibration / current / temperature history from /api/telemetry/history with threshold and onset markers.
import React, { useMemo } from 'react';
import { smoothPath, type Pt } from '../../lib/chart';
import { useElementWidth } from '../../lib/useElementWidth';
import type { MultiMachineTelemetryResponse, TelemetryPoint } from '../../types';

interface SensorHistoryChartProps {
  machine: string;
  data: MultiMachineTelemetryResponse | null;
  loading: boolean;
  error: string | null;
}

type MetricKey = 'vibration_mm_s' | 'current_a' | 'temperature_c';

const METRICS: { key: MetricKey; label: string; unit: string; color: string; width: number }[] = [
  { key: 'temperature_c', label: 'Bearing Temp', unit: '°C', color: '#64748b', width: 1.8 },
  { key: 'current_a', label: 'Current Draw', unit: 'A', color: '#5b5bf0', width: 2 },
  { key: 'vibration_mm_s', label: 'Vibration', unit: 'mm/s', color: '#c9343a', width: 2.4 },
];

export default function SensorHistoryChart({ machine, data, loading, error }: SensorHistoryChartProps): React.ReactElement {
  const [ref, W] = useElementWidth<HTMLDivElement>(900);
  const H = 230;
  const pad = { l: 6, r: 6, t: 14, b: 10 };

  const points: TelemetryPoint[] = useMemo(() => data?.series?.[machine] ?? [], [data, machine]);
  const controlIds = useMemo(() => Object.keys(data?.series ?? {}).filter((m) => m !== machine), [data, machine]);

  const view = useMemo(() => {
    if (points.length < 2 || !data) return null;
    const ranges = METRICS.map((m) => {
      const vals = points.map((p) => p[m.key]);
      const extra =
        m.key === 'vibration_mm_s'
          ? [data.baseline.vibration, data.vibration_warning_threshold]
          : m.key === 'current_a'
            ? [data.baseline.current, data.current_warning_threshold]
            : [data.baseline.temperature];
      const all = [...vals, ...extra];
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      const span = Math.max(hi - lo, 1e-6);
      return { lo: lo - span * 0.1, hi: hi + span * 0.1 };
    });
    const onsetIdx = (() => {
      if (data.anomaly_onset_time) {
        const i = points.findIndex((p) => p.timestamp >= (data.anomaly_onset_time as string));
        if (i >= 0) return i;
      }
      return points.findIndex((p) => p.is_anomalous);
    })();
    return { ranges, onsetIdx };
  }, [points, data]);

  const frame = (children: React.ReactNode) => (
    <div ref={ref} style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--hair)', padding: '8px 4px' }}>
      {children}
    </div>
  );

  if (!view || !data) {
    return frame(
      <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: '0.86rem', fontStyle: 'italic' }}>
        {loading
          ? 'Loading telemetry history…'
          : error
            ? `Telemetry history unavailable (${error})`
            : `No telemetry history recorded for ${machine}`}
      </div>,
    );
  }

  const n = points.length;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number, ri: number) => {
    const r = view.ranges[ri];
    return pad.t + (1 - (v - r.lo) / (r.hi - r.lo)) * (H - pad.t - pad.b);
  };
  const vibIdx = METRICS.findIndex((m) => m.key === 'vibration_mm_s');
  const curIdx = METRICS.findIndex((m) => m.key === 'current_a');
  const onsetX = view.onsetIdx >= 0 ? x(view.onsetIdx) : null;
  const anomalous = points.filter((p) => p.is_anomalous).length;
  const peak = Math.max(...points.map((p) => p.anomaly_score));

  return (
    <div className="col" style={{ gap: 8 }}>
      {frame(
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} role="img" aria-label={`${machine} sensor history`}>
          {onsetX !== null && (
            <>
              <rect x={onsetX} y={pad.t} width={Math.max(0, W - pad.r - onsetX)} height={H - pad.t - pad.b} fill="rgba(229,72,77,0.1)" />
              <text x={onsetX + 8} y={pad.t + 16} fontSize="12" fontWeight="700" fill="#c9343a" fontFamily="var(--font-mono)">
                EXCURSION · DEFECT ONSET
              </text>
            </>
          )}
          <line x1={pad.l} x2={W - pad.r} y1={y(data.vibration_warning_threshold, vibIdx)} y2={y(data.vibration_warning_threshold, vibIdx)} stroke="#c9343a" strokeDasharray="4 4" strokeOpacity="0.55" />
          <line x1={pad.l} x2={W - pad.r} y1={y(data.current_warning_threshold, curIdx)} y2={y(data.current_warning_threshold, curIdx)} stroke="#5b5bf0" strokeDasharray="4 4" strokeOpacity="0.5" />
          {METRICS.map((m, ri) => {
            const pts: Pt[] = points.map((p, i) => ({ x: x(i), y: y(p[m.key], ri) }));
            return <path key={m.key} d={smoothPath(pts, 0.4)} fill="none" stroke={m.color} strokeWidth={m.width} strokeLinecap="round" />;
          })}
          {points.map((p, i) =>
            p.is_anomalous ? <circle key={`${p.timestamp}-${i}`} cx={x(i)} cy={y(p.vibration_mm_s, vibIdx)} r={3.5} fill="#c9343a" /> : null,
          )}
        </svg>,
      )}
      <div className="row wrap mono" style={{ gap: '6px 16px', fontSize: '0.72rem', color: 'var(--text)' }}>
        <span>
          Baseline: {data.baseline.vibration} mm/s · {data.baseline.current} A · {data.baseline.temperature}°C
        </span>
        <span style={{ color: '#c9343a' }}>Vib warn ≥ {data.vibration_warning_threshold} mm/s</span>
        <span style={{ color: '#5b5bf0' }}>Current warn ≥ {data.current_warning_threshold} A</span>
        <span>
          {anomalous}/{n} samples anomalous · peak score {peak.toFixed(2)}
        </span>
        <span>Window {data.time_window}</span>
        <span style={{ marginLeft: 'auto' }}>
          source: {data.source}
          {data.anomaly_onset_time ? ` · onset ${data.anomaly_onset_time.slice(11, 16)} UTC` : ''}
        </span>
      </div>
      {controlIds.length > 0 && (
        <div className="row wrap mono" style={{ gap: 12, fontSize: '0.72rem', color: 'var(--muted)' }}>
          <span>Control machines:</span>
          {controlIds.map((id) => {
            const s = data.series[id];
            const vib = s.length ? s.reduce((a, p) => a + p.vibration_mm_s, 0) / s.length : 0;
            return (
              <span key={id}>
                {id} avg {vib.toFixed(2)} mm/s ({s.filter((p) => p.is_anomalous).length} anomalous)
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
