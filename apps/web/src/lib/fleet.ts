// Line Overview data helpers: merges telemetry + the live incident into fleet rows, OEE, severity and shift info.
import type {
  FleetRegistryResponse,
  ImpactMetrics,
  IncidentState,
  MultiMachineTelemetryResponse,
  TelemetryPoint,
} from '../types';
import { isIncidentActive } from './incident';
import type { VerifiedSolution } from './eightD';

export const LINE_NAME = 'Cell Line 1';
export const LINE_LABEL = 'Cell Line 1: Turning & Milling';

/** Motor current at 100% spindle load; spindle load % is derived from live current draw. */
export const RATED_SPINDLE_CURRENT_A = 25;

export const OEE_TARGET = 0.85;

export type FleetStatus = 'nominal' | 'watch' | 'critical' | 'signoff' | 'offline';

export interface FleetRow {
  id: string;
  bay: string;
  part: string;
  op: string;
  vibration: number | null;
  load: number | null;
  rpm: number | null;
  status: FleetStatus;
  incidentId: string | null;
  incident: IncidentState | null;
}

/** An incident that still needs attention: being worked, or closed but not yet signed off. */
export function isIncidentOpen(inc: IncidentState | null): inc is IncidentState {
  if (!inc) return false;
  return isIncidentActive(inc) || (inc.status === 'closed' && !inc.approved);
}

function latestPoint(series: TelemetryPoint[] | undefined): TelemetryPoint | null {
  return series && series.length ? series[series.length - 1] : null;
}

export function buildFleetRows(
  telemetry: MultiMachineTelemetryResponse | null,
  incident: IncidentState | null,
  fleet: FleetRegistryResponse | null = null,
): FleetRow[] {
  const series = telemetry?.series ?? {};
  const baseAssets = fleet?.assets?.filter((a) => !a.on_demand) ?? [];
  const ids: string[] = baseAssets.map((a) => a.machine_id);
  for (const id of Object.keys(series)) if (!ids.includes(id)) ids.push(id);
  const suspect = incident?.suspect_machine ?? null;
  if (suspect && !ids.includes(suspect)) ids.push(suspect);

  const open = isIncidentOpen(incident);
  const vibWarn = telemetry?.vibration_warning_threshold ?? Infinity;

  return ids.map((id) => {
    const asset = fleet?.assets?.find((a) => a.machine_id === id);
    const point = latestPoint(series[id]);
    const live = incident?.latest_telemetry?.machine_id === id ? incident.latest_telemetry : null;

    const vibration = live ? live.spindle_vibration : point?.vibration_mm_s ?? null;
    const current = live ? live.motor_current : point?.current_a ?? null;
    const rpm = live ? live.rpm : point?.spindle_speed_rpm ?? null;
    const load = current !== null && current > 0 ? (current / RATED_SPINDLE_CURRENT_A) * 100 : null;

    const isSuspect = open && suspect === id;
    let status: FleetStatus = 'nominal';
    if (isSuspect) status = isIncidentActive(incident) ? 'critical' : 'signoff';
    else if (vibration === null) status = 'offline';
    else if (point?.is_anomalous || vibration >= vibWarn || live?.operating_status === 'ALARM') status = 'watch';

    return {
      id,
      bay: asset?.bay ?? '—',
      part: asset?.part ?? '—',
      op: asset?.operation ?? '',
      vibration,
      load,
      rpm,
      status,
      incidentId: isSuspect ? incident.incident_id : null,
      incident: isSuspect ? incident : null,
    };
  });
}

export interface OeeBreakdown {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

/** OEE = A × P × Q. P from live RPM vs each spindle's median RPM; Q from end-of-line defect rate. */
export function computeOee(
  telemetry: MultiMachineTelemetryResponse | null,
  incident: IncidentState | null,
  rows: FleetRow[],
  plannedAvailability: number,
): OeeBreakdown {
  const ratios: number[] = [];
  for (const pts of Object.values(telemetry?.series ?? {})) {
    if (!pts.length) continue;
    const sorted = pts.map((p) => p.spindle_speed_rpm).sort((a, b) => a - b);
    const nominal = sorted[Math.floor(sorted.length / 2)];
    const last = pts[pts.length - 1].spindle_speed_rpm;
    if (nominal > 0) ratios.push(Math.min(1, last / nominal));
  }
  const performance = ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;

  const down = incident?.status === 'repairing' ? 1 : 0;
  const activeFleet = Math.max(rows.filter((r) => r.status !== 'offline').length, 1);
  const availability = plannedAvailability * ((activeFleet - down) / activeFleet);

  const quality = 1 - Math.max(0, Math.min(1, incident?.defect_rate ?? 0));
  return { availability, performance, quality, oee: availability * performance * quality };
}

export type Severity = 'critical' | 'minor';

export function incidentSeverity(inc: IncidentState): Severity {
  if (inc.severity) {
    const s = inc.severity.toLowerCase();
    if (s === 'critical' || s === 'high') return 'critical';
    if (s === 'low' || s === 'medium' || s === 'minor') return 'minor';
  }
  return inc.spc_ucl > 0 && inc.defect_rate / inc.spc_ucl >= 1.5 ? 'critical' : 'minor';
}

export function shiftLabel(now: Date): string {
  const h = now.getHours();
  if (h >= 6 && h < 14) return 'Shift A · 06:00 - 14:00';
  if (h >= 14 && h < 22) return 'Shift B · 14:00 - 22:00';
  return 'Shift C · 22:00 - 06:00';
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface EsgLedgerEntry {
  incidentId: string;
  impact: ImpactMetrics;
  /** Absent on entries saved before verified solutions were recorded. */
  solution?: VerifiedSolution;
}

export interface EsgTotals {
  co2: number;
  energyCo2: number;
  materialCo2: number;
  energyKwh: number;
  scrap: number;
  cost: number;
  incidents: number;
}

export function sumEsg(entries: EsgLedgerEntry[]): EsgTotals {
  return entries.reduce<EsgTotals>(
    (t, { impact }) => ({
      co2: t.co2 + impact.co2_kg,
      energyCo2: t.energyCo2 + (impact.energy_co2_kg ?? 0),
      materialCo2: t.materialCo2 + (impact.material_co2_kg ?? 0),
      energyKwh: t.energyKwh + impact.energy_kwh,
      scrap: t.scrap + impact.scrap_avoided,
      cost: t.cost + (impact.cost_savings_usd ?? 0),
      incidents: t.incidents + 1,
    }),
    { co2: 0, energyCo2: 0, materialCo2: 0, energyKwh: 0, scrap: 0, cost: 0, incidents: 0 },
  );
}

export function formatCo2(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg.toFixed(1)} kg`;
}
