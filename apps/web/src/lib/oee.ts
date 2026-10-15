// OEE helpers for one product line: per-machine A×P×Q, the line OEE trend and the loss breakdown.
// Uses the same model as computeOee in fleet.ts, so machine, trend and KPI numbers agree.
import type { IncidentState, MultiMachineTelemetryResponse, TelemetryPoint } from '../types';
import type { FleetRow } from './fleet';
import { OEE_TARGET, PLANNED_AVAILABILITY } from './fleet';

/** Machine is unavailable while the technician is repairing it. */
const isDown = (row: FleetRow, incident: IncidentState | null) =>
  row.incidentId !== null && incident?.status === 'repairing';

/** The incident's defect rate is charged to the suspect machine's quality. */
const defectOn = (id: string, incident: IncidentState | null) =>
  incident && incident.suspect_machine === id ? Math.max(0, Math.min(1, incident.defect_rate)) : 0;

function medianRpm(points: TelemetryPoint[]): number {
  const sorted = points.map((p) => p.spindle_speed_rpm).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function speedRatio(rpm: number, nominal: number): number {
  return nominal > 0 ? Math.min(1, rpm / nominal) : 1;
}

export type OeeBand = 'good' | 'watch' | 'poor';

/** Status band for an OEE value: at/above target, within 15 pts of it, or further below. */
export function oeeBand(oee: number): OeeBand {
  if (oee >= OEE_TARGET) return 'good';
  return oee >= OEE_TARGET - 0.15 ? 'watch' : 'poor';
}

export const BAND_COLOR: Record<OeeBand, string> = {
  good: 'var(--green)',
  watch: 'var(--amber)',
  poor: 'var(--red)',
};

export interface MachineOee {
  id: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  down: boolean;
  /** Vibration RMS history for the sparkline, oldest first. */
  vibration: number[];
  anomalous: boolean[];
}

/**
 * @deprecated Prefer backend production stats from GET /api/oee (calculate_production_stats)
 * which computes real OEE from BigQuery traceability, sensor telemetry, and incident downtime.
 */
export function machineOee(
  row: FleetRow,
  telemetry: MultiMachineTelemetryResponse | null,
  incident: IncidentState | null,
): MachineOee {
  const points = telemetry?.series?.[row.id] ?? [];
  const down = isDown(row, incident);
  const availability = down ? 0 : row.status === 'offline' ? 0 : PLANNED_AVAILABILITY;
  const performance = points.length ? speedRatio(points[points.length - 1].spindle_speed_rpm, medianRpm(points)) : 1;
  const quality = 1 - defectOn(row.id, incident);
  return {
    id: row.id,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    down,
    vibration: points.map((p) => p.vibration_mm_s),
    anomalous: points.map((p) => p.is_anomalous),
  };
}

export interface OeeTrendPoint {
  time: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  anomalous: boolean;
}

export interface OeeTrend {
  points: OeeTrendPoint[];
  /** Index of the first bucket after the defect onset, or -1. */
  onsetIdx: number;
  /** The onset happened before the visible window, so the whole window is post-onset. */
  onsetClipped: boolean;
}

const TREND_BUCKETS = 30;

const ms = (iso: string) => Date.parse(iso);

/** Minutes of history covered by the loaded telemetry (0 when there is none). */
export function telemetrySpanMin(telemetry: MultiMachineTelemetryResponse | null): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const pts of Object.values(telemetry?.series ?? {})) {
    if (!pts.length) continue;
    lo = Math.min(lo, ms(pts[0].timestamp));
    hi = Math.max(hi, ms(pts[pts.length - 1].timestamp));
  }
  return hi > lo ? (hi - lo) / 60_000 : 0;
}

/**
 * Bucketed OEE history for the whole line (`scope` null) or one machine, limited to the last
 * `windowMin` minutes before the newest sample (null = everything loaded). Nominal RPM and the
 * scrap ramp come from the full history, so a narrower window zooms without changing values.
 *
 * @deprecated Prefer backend series from GET /api/oee (calculate_production_stats)
 * which calculates real OEE series from BigQuery traceability and sensor telemetry.
 */
export function oeeTrend(
  telemetry: MultiMachineTelemetryResponse | null,
  incident: IncidentState | null,
  rows: FleetRow[],
  scope: string | null,
  windowMin: number | null = null,
): OeeTrend {
  const empty: OeeTrend = { points: [], onsetIdx: -1, onsetClipped: false };
  const full = telemetry?.series ?? {};
  const ids = (scope ? [scope] : Object.keys(full)).filter((id) => (full[id]?.length ?? 0) > 1);
  if (!ids.length) return empty;

  const endMs = Math.max(...ids.map((id) => ms(full[id][full[id].length - 1].timestamp)));
  const startMs = windowMin !== null ? endMs - windowMin * 60_000 : -Infinity;
  const series = Object.fromEntries(ids.map((id) => [id, full[id].filter((p) => ms(p.timestamp) >= startMs)]));
  if (ids.some((id) => series[id].length < 2)) return empty;

  const timeline = ids.map((id) => series[id]).reduce((a, b) => (b.length > a.length ? b : a));
  const n = Math.min(TREND_BUCKETS, timeline.length);
  const bucketOf = (pts: TelemetryPoint[], b: number) => {
    const start = Math.floor((b * pts.length) / n);
    return pts.slice(start, Math.max(start + 1, Math.floor(((b + 1) * pts.length) / n)));
  };
  const bucketEnd = (b: number) => {
    const slice = bucketOf(timeline, b);
    return slice[slice.length - 1]?.timestamp ?? '';
  };

  const firstAnomaly = ids
    .map((id) => full[id].find((p) => p.is_anomalous)?.timestamp)
    .filter((t): t is string => Boolean(t))
    .sort()[0];
  const onsetIso = telemetry?.anomaly_onset_time ?? firstAnomaly ?? null;
  const onsetMs = onsetIso ? ms(onsetIso) : null;
  let onsetIdx = -1;
  if (onsetMs !== null) {
    for (let b = 0; b < n && onsetIdx < 0; b++) if (ms(bucketEnd(b)) >= onsetMs) onsetIdx = b;
  }
  const onsetClipped = onsetMs !== null && onsetMs < ms(timeline[0].timestamp);

  const fleet = rows.filter((r) => r.status !== 'offline' && (!scope || r.id === scope));
  const live = fleet.length || 1;
  const nowAvailability = PLANNED_AVAILABILITY * ((live - fleet.filter((r) => isDown(r, incident)).length) / live);
  const defect = scope ? defectOn(scope, incident) : Math.max(0, Math.min(1, incident?.defect_rate ?? 0));
  const nominal = Object.fromEntries(ids.map((id) => [id, medianRpm(full[id])]));

  const points: OeeTrendPoint[] = [];
  for (let b = 0; b < n; b++) {
    let ratioSum = 0;
    let anomalous = false;
    for (const id of ids) {
      const slice = bucketOf(series[id], b);
      // The newest bucket uses the latest sample so the trend ends on the same value as the headline.
      const rpm =
        b === n - 1
          ? series[id][series[id].length - 1].spindle_speed_rpm
          : slice.reduce((s, p) => s + p.spindle_speed_rpm, 0) / Math.max(slice.length, 1);
      ratioSum += speedRatio(rpm, nominal[id]);
      anomalous ||= slice.some((p) => p.is_anomalous);
    }
    const performance = ratioSum / ids.length;
    const availability = b === n - 1 ? nowAvailability : PLANNED_AVAILABILITY;
    // Scrap builds up linearly in time from the defect onset to the current end-of-line rate.
    const t = ms(bucketEnd(b));
    const ramp =
      b === n - 1 ? 1 : onsetMs !== null && endMs > onsetMs ? Math.max(0, Math.min(1, (t - onsetMs) / (endMs - onsetMs))) : 0;
    const quality = 1 - defect * ramp;
    points.push({
      time: bucketEnd(b),
      availability,
      performance,
      quality,
      oee: availability * performance * quality,
      anomalous,
    });
  }
  return { points, onsetIdx, onsetClipped };
}

export type LossKind = 'planned' | 'downtime' | 'speed' | 'quality';

export interface OeeLoss {
  kind: LossKind;
  label: string;
  detail: string;
  /** OEE points lost, 0..1. */
  value: number;
  machine: string | null;
  incidentId: string | null;
}

/**
 * Splits 1 − OEE into planned stops, unplanned downtime, speed and quality losses (they sum exactly).
 *
 * @deprecated Prefer backend loss attribution from GET /api/oee (calculate_production_stats)
 * which provides 4-category OEE waterfall attribution based on BigQuery telemetry and incident state.
 */
export function oeeLosses(machines: MachineOee[], rows: FleetRow[], incident: IncidentState | null, defectLabel: string): OeeLoss[] {
  const live = machines.filter((m) => rows.find((r) => r.id === m.id)?.status !== 'offline');
  if (!live.length) return [];
  const a = live.reduce((s, m) => s + m.availability, 0) / live.length;
  const p = live.reduce((s, m) => s + m.performance, 0) / live.length;
  const q = 1 - Math.max(0, Math.min(1, incident?.defect_rate ?? 0));
  const downMachine = live.find((m) => m.down) ?? null;
  const slowest = live.reduce((w, m) => (m.performance < w.performance ? m : w));
  const incidentId = incident?.incident_id ?? null;

  const losses: OeeLoss[] = [
    {
      kind: 'planned',
      label: 'Planned stops',
      detail: 'Breaks, changeovers, warm-up',
      value: 1 - PLANNED_AVAILABILITY,
      machine: null,
      incidentId: null,
    },
    {
      kind: 'downtime',
      label: 'Unplanned downtime',
      detail: downMachine ? `${downMachine.id} stopped for repair` : 'No breakdowns',
      value: PLANNED_AVAILABILITY - a,
      machine: downMachine?.id ?? null,
      incidentId: downMachine ? incidentId : null,
    },
    {
      kind: 'speed',
      label: 'Speed loss',
      detail:
        slowest.performance < 0.995
          ? `${slowest.id} at ${(slowest.performance * 100).toFixed(1)}% of nominal RPM`
          : 'All spindles at nominal RPM',
      value: a * (1 - p),
      machine: slowest.performance < 0.995 ? slowest.id : null,
      incidentId: null,
    },
    {
      kind: 'quality',
      label: 'Quality loss',
      detail:
        incident && incident.defect_rate > 0
          ? `${incident.suspect_machine ?? 'Line'} · ${defectLabel} scrap`
          : 'No scrap at end-of-line inspection',
      value: a * p * (1 - q),
      machine: incident?.suspect_machine ?? null,
      incidentId: incident && incident.defect_rate > 0 ? incidentId : null,
    },
  ];
  return losses.sort((x, y) => y.value - x.value);
}
