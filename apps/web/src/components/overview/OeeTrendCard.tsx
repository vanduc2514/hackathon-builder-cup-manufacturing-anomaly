// OeeTrendCard: current OEE for the line or a chosen machine, its A/P/Q history and the defect onset.
import React, { useMemo, useState } from 'react';
import type { IncidentState, LineOeeResponse, MultiMachineTelemetryResponse } from '../../types';
import type { FleetRow, OeeBreakdown } from '../../lib/fleet';
import { LINE_NAME, OEE_TARGET } from '../../lib/fleet';
import { oeeTrend, telemetrySpanMin, type MachineOee, type OeeTrendPoint } from '../../lib/oee';
import { smoothPath } from '../../lib/chart';
import { useElementWidth } from '../../lib/useElementWidth';
import MachineSelect from './MachineSelect';

interface OeeTrendCardProps {
  telemetry: MultiMachineTelemetryResponse | null;
  incident: IncidentState | null;
  rows: FleetRow[];
  machines: MachineOee[];
  lineOee: OeeBreakdown | null;
  scope: string | null;
  onScope: (machineId: string | null) => void;
  loading: boolean;
  oeeResponse?: LineOeeResponse | null;
  plannedAvailability: number | null;
}

type SeriesKey = 'oee' | 'availability' | 'performance' | 'quality';

const SERIES: { key: SeriesKey; label: string; color: string; width: number; dash?: string }[] = [
  { key: 'availability', label: 'Availability', color: '#5b5bf0', width: 2, dash: '6 4' },
  { key: 'performance', label: 'Performance', color: '#0891b2', width: 2, dash: '1 4' },
  { key: 'quality', label: 'Quality', color: '#c026d3', width: 2 },
  { key: 'oee', label: 'OEE', color: '#0b1220', width: 2.6 },
];

const RANGES: { label: string; min: number | null }[] = [
  { label: '15m', min: 15 },
  { label: '30m', min: 30 },
  { label: '1h', min: 60 },
  { label: 'All', min: null },
];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const clock = (iso: string) => (iso.length >= 16 ? iso.slice(11, 16) : iso);

export default function OeeTrendCard({
  telemetry,
  incident,
  rows,
  machines,
  lineOee,
  scope,
  onScope,
  loading,
  oeeResponse,
  plannedAvailability,
}: OeeTrendCardProps): React.ReactElement {
  const [ref, W] = useElementWidth<HTMLDivElement>(720);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<number | null>(null);
  const span = useMemo(() => telemetrySpanMin(telemetry), [telemetry]);
  const trend = useMemo(() => {
    if (plannedAvailability === null) {
      return { points: [], onsetIdx: -1, onsetClipped: false };
    }
    return oeeTrend(telemetry, incident, rows, scope, range, plannedAvailability);
  }, [telemetry, incident, rows, scope, range, plannedAvailability]);
  const rangeLabel = RANGES.find((r) => r.min === range)?.label ?? 'All';

  // Use backend OEE series when available, otherwise fall back to client-modeled trend
  const backendSeries = useMemo(() => {
    if (!oeeResponse) return null;
    if (scope) {
      const m = oeeResponse.machines.find((x) => x.machine_id === scope);
      return m?.series?.length ? m.series : null;
    }
    return oeeResponse.series?.length ? oeeResponse.series : null;
  }, [oeeResponse, scope]);

  const targetOee = oeeResponse?.target ?? OEE_TARGET;

  const pts: OeeTrendPoint[] = useMemo(() => {
    if (backendSeries && backendSeries.length > 0) {
      return backendSeries.map((p) => ({
        time: p.timestamp,
        availability: p.availability,
        performance: p.performance,
        quality: p.quality,
        oee: p.oee,
        anomalous: p.oee < targetOee - 0.05,
      }));
    }
    return trend.points;
  }, [backendSeries, trend.points, targetOee]);

  const H = 172;
  const pad = { l: 34, r: 14, t: 10, b: 22 };
  const n = pts.length;
  const visible = SERIES.filter((s) => !hidden.has(s.key));

  const lo = useMemo(() => {
    const vals = pts.flatMap((p) => visible.map((s) => p[s.key]));
    const min = vals.length ? Math.min(...vals, targetOee) : 0.5;
    return Math.max(0, Math.floor((min - 0.04) * 10) / 10);
  }, [pts, visible, targetOee]);

  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * (W - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - (v - lo) / (1 - lo)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: Math.round((1 - lo) * 10) + 1 }, (_, i) => lo + i * 0.1).filter(
    (_, i, a) => a.length <= 6 || i % 2 === 0,
  );
  const xTicks =
    n > 1
      ? [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1]
      : [];
  const suspect = incident?.suspect_machine ?? null;
  // The defect onset belongs to the suspect machine; healthy machines don't get the band.
  const onsetX = trend.onsetIdx >= 0 && (!scope || scope === suspect) ? x(trend.onsetIdx) : null;
  const last: OeeTrendPoint | undefined = pts[n - 1];
  const first: OeeTrendPoint | undefined = pts[0];
  const hp = hover !== null ? pts[hover] : null;
  const machine = scope ? machines.find((m) => m.id === scope) ?? null : null;
  // Headline uses the same current values as the dropdown: computeOee for the line, machineOee per machine.
  const current = scope
    ? machine
      ? { a: machine.availability, p: machine.performance, q: machine.quality, oee: machine.oee }
      : null
    : lineOee
      ? { a: lineOee.availability, p: lineOee.performance, q: lineOee.quality, oee: lineOee.oee }
      : null;
  const delta = current ? (current.oee - targetOee) * 100 : null;
  const currentOf: Record<SeriesKey, number | null> = {
    availability: current?.a ?? null,
    performance: current?.p ?? null,
    quality: current?.q ?? null,
    oee: current?.oee ?? null,
  };

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key);
      return next;
    });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n < 2) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <section className="glass card-pad col oee-trend" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <span className="eyebrow kpi-eyebrow">
              OEE · {scope ?? LINE_NAME}
              {range !== null
                ? ` · last ${rangeLabel}`
                : telemetry?.time_window
                  ? ` · ${telemetry.time_window}`
                  : ''}
            </span>
            <span
              className="chip chip-neutral"
              style={{ fontSize: 10, padding: '2px 6px' }}
              title={
                oeeResponse
                  ? 'Real-time telemetry and BigQuery traceability metrics from /api/oee'
                  : 'Derived from real-time telemetry, defect rate and standard production model'
              }
            >
              {oeeResponse ? 'Live Metrics' : 'Modeled Estimate'}
            </span>
          </div>
          <div className="row wrap" style={{ alignItems: 'baseline', gap: 10 }}>
            <span className="kpi-value mono">{current ? pct(current.oee) : '—'}</span>
            {delta !== null && (
              <span className={`chip ${delta < 0 ? 'chip-red' : 'chip-green'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {delta < 0 ? 'trending_down' : 'trending_up'}
                </span>
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(1)} pts vs {Math.round(targetOee * 100)}% target
              </span>
            )}
          </div>
        </div>
        <MachineSelect
          rows={rows}
          machines={machines}
          lineOee={lineOee?.oee ?? null}
          scope={scope}
          onScope={onScope}
        />
      </div>

      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {SERIES.map((s) => {
            const off = hidden.has(s.key);
            const value = s.key === 'oee' ? null : currentOf[s.key];
            const title =
              s.key === 'availability' && plannedAvailability !== null
                ? `Planned availability ${Math.round(plannedAvailability * 100)}% (config)`
                : undefined;
            return (
              <button
                key={s.key}
                type="button"
                className={`legend-btn ${off ? 'legend-off' : ''}`}
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                title={title}
              >
                <svg width="18" height="8" aria-hidden="true">
                  <line
                    x1="1"
                    x2="17"
                    y1="4"
                    y2="4"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeDasharray={s.dash}
                    strokeLinecap="round"
                  />
                </svg>
                {s.label}
                {value !== null && <span className="mono">{pct(value)}</span>}
              </button>
            );
          })}
        </div>
        <div className="seg-range" role="radiogroup" aria-label="Time range">
          {RANGES.map((r) => {
            // A window longer than the loaded history would just repeat "All".
            const unavailable = r.min !== null && span > 0 && r.min > span + 1;
            return (
              <button
                key={r.label}
                type="button"
                role="radio"
                aria-checked={range === r.min}
                className={range === r.min ? 'seg-on' : undefined}
                disabled={unavailable}
                title={unavailable ? `Only ${Math.round(span)} min of history loaded` : undefined}
                onClick={() => {
                  setHover(null);
                  setRange(r.min);
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={ref} className="oee-trend-plot">
        {n < 2 ? (
          <div className="oee-trend-empty">
            {loading || plannedAvailability === null ? 'Loading telemetry…' : `No telemetry history for ${scope ?? LINE_NAME}`}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: H, display: 'block' }}
            role="img"
            aria-label={`OEE trend for ${scope ?? LINE_NAME}: from ${pct(first?.oee ?? 0)} to ${pct(last?.oee ?? 0)}`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {onsetX !== null && (
              <>
                <rect
                  x={onsetX}
                  y={pad.t}
                  width={Math.max(0, W - pad.r - onsetX)}
                  height={H - pad.t - pad.b}
                  fill="rgba(229,72,77,0.08)"
                />
                <line
                  x1={onsetX}
                  x2={onsetX}
                  y1={pad.t}
                  y2={H - pad.b}
                  stroke="#c9343a"
                  strokeOpacity="0.5"
                />
                <text
                  x={onsetX + 6}
                  y={H - pad.b - 8}
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#c9343a"
                  fontFamily="var(--font-mono)"
                >
                  {trend.onsetClipped ? 'AFTER DEFECT ONSET' : 'DEFECT ONSET'}
                  {suspect ? ` · ${suspect}` : ''}
                </text>
              </>
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="rgba(15,23,42,0.07)"
                />
                <text
                  x={pad.l - 8}
                  y={y(t) + 3.5}
                  fontSize="10.5"
                  textAnchor="end"
                  fill="#64748b"
                  fontFamily="var(--font-mono)"
                >
                  {Math.round(t * 100)}
                </text>
              </g>
            ))}
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(targetOee)}
              y2={y(targetOee)}
              stroke="#64748b"
              strokeDasharray="3 4"
            />
            <text
              x={pad.l + 6}
              y={y(targetOee) - 5}
              fontSize="10.5"
              fill="#64748b"
              fontFamily="var(--font-mono)"
            >
              Target {Math.round(targetOee * 100)}%
            </text>
            {xTicks.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={H - 8}
                fontSize="10.5"
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fill="#64748b"
                fontFamily="var(--font-mono)"
              >
                {clock(pts[i].time)}
              </text>
            ))}
            {visible.map((s) => (
              <path
                key={s.key}
                d={smoothPath(
                  pts.map((p, i) => ({ x: x(i), y: y(p[s.key]) })),
                  0.35,
                )}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                strokeLinecap="round"
              />
            ))}
            {last && !hidden.has('oee') && (
              <circle
                cx={x(n - 1)}
                cy={y(last.oee)}
                r={4.5}
                fill="#0b1220"
                stroke="#fff"
                strokeWidth={2}
              />
            )}
            {hp && hover !== null && (
              <g pointerEvents="none">
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={pad.t}
                  y2={H - pad.b}
                  stroke="#0b1220"
                  strokeOpacity="0.25"
                />
                {visible.map((s) => (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(hp[s.key])}
                    r={4}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
          </svg>
        )}
        {hp && hover !== null && (
          <div
            className="chart-tip glass-strong"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > n / 2 ? 'calc(-100% - 12px)' : '12px'})`,
            }}
          >
            <div className="mono" style={{ fontWeight: 650, color: 'var(--ink)' }}>
              {clock(hp.time)} UTC{hp.anomalous ? ' · anomaly' : ''}
            </div>
            {[...visible].reverse().map((s) => (
              <div key={s.key} className="row between" style={{ gap: 14 }}>
                <span className="row" style={{ gap: 6 }}>
                  <span className="legend-dot" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  {pct(hp[s.key])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
