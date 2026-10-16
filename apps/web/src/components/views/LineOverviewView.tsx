// LineOverviewView: Cell Line 1 one-screen overview — what went wrong (banner), quality / incident / ESG KPIs, OEE trend and losses, and the fleet table.
import React, { useEffect, useMemo, useState } from 'react';
import type { FleetRegistryResponse, IncidentState, LineOeeResponse, MultiMachineTelemetryResponse } from '../../types';
import type { ToastTone } from '../../App';
import { useApi } from '../../lib/api';
import type { EsgLedgerEntry } from '../../lib/fleet';
import { LINE_NAME, buildFleetRows, computeOee, isIncidentOpen, sumEsg } from '../../lib/fleet';
import AnomalyBanner from '../overview/AnomalyBanner';
import DefectRateCard from '../overview/DefectRateCard';
import ActiveIncidentsCard from '../overview/ActiveIncidentsCard';
import EsgCard from '../overview/EsgCard';
import MachineFleetTable from '../overview/MachineFleetTable';
import FactoryDigitalTwin from '../overview/FactoryDigitalTwin';
import DiagnosticsModal from '../overview/DiagnosticsModal';
import OeeTrendCard from '../overview/OeeTrendCard';
import OeeLossCard from '../overview/OeeLossCard';
import { machineOee, oeeLosses } from '../../lib/oee';
import { friendlyDefectName } from '../../lib/incident';

interface LineOverviewViewProps {
  incident: IncidentState | null;
  openedAt: number | null;
  esgLedger: EsgLedgerEntry[];
  onRefreshIncident: () => void;
  onOpenIncident: (incidentId: string) => void;
  onOpenEsgHub: () => void;
  onOpenSimulation: () => void;
  onOpenTopology?: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

export default function LineOverviewView({
  incident,
  openedAt,
  esgLedger,
  onRefreshIncident,
  onOpenIncident,
  onOpenEsgHub,
  onOpenSimulation,
  onOpenTopology,
  onNotify,
}: LineOverviewViewProps): React.ReactElement {
  const telemetry = useApi<MultiMachineTelemetryResponse>('/api/telemetry/history', 15000);
  const oeeApi = useApi<LineOeeResponse>('/api/oee', 15000);
  const fleet = useApi<FleetRegistryResponse>('/api/fleet', 60000);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [diagId, setDiagId] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);

  const plannedAvail = fleet.data?.planned_availability ?? null;

  const rows = useMemo(
    () => buildFleetRows(telemetry.data, incident, fleet.data),
    [telemetry.data, incident, fleet.data],
  );
  const oee = useMemo(() => {
    if (oeeApi.data) {
      return {
        availability: oeeApi.data.availability,
        performance: oeeApi.data.performance,
        quality: oeeApi.data.quality,
        oee: oeeApi.data.oee,
      };
    }
    return (telemetry.data || incident) && plannedAvail !== null ? computeOee(telemetry.data, incident, rows, plannedAvail) : null;
  }, [oeeApi.data, telemetry.data, incident, rows, plannedAvail]);

  const machines = useMemo(() => {
    if (oeeApi.data?.machines && oeeApi.data.machines.length > 0) {
      return rows.map((r) => {
        const mMetric = oeeApi.data?.machines.find((m) => m.machine_id === r.id);
        const points = telemetry.data?.series?.[r.id] ?? [];
        if (mMetric) {
          return {
            id: r.id,
            availability: mMetric.availability,
            performance: mMetric.performance,
            quality: mMetric.quality,
            oee: mMetric.oee,
            down: mMetric.availability < 0.05,
            vibration: points.map((p) => p.vibration_mm_s),
            anomalous: points.map((p) => p.is_anomalous),
          };
        }
        if (plannedAvail !== null) {
          return machineOee(r, telemetry.data, incident, plannedAvail);
        }
        return {
          id: r.id,
          availability: 0,
          performance: 0,
          quality: 0,
          oee: 0,
          down: false,
          vibration: points.map((p) => p.vibration_mm_s),
          anomalous: points.map((p) => p.is_anomalous),
        };
      });
    }
    if (plannedAvail === null) return [];
    return rows.map((r) => machineOee(r, telemetry.data, incident, plannedAvail));
  }, [oeeApi.data, rows, telemetry.data, incident, plannedAvail]);

  const losses = useMemo(() => {
    if (oeeApi.data?.losses && oeeApi.data.losses.length > 0) {
      return oeeApi.data.losses.map((l) => ({
        kind: (l.kind === 'planned_stop'
          ? 'planned'
          : l.kind === 'unplanned_downtime'
            ? 'downtime'
            : l.kind) as 'planned' | 'downtime' | 'speed' | 'quality',
        label:
          l.kind === 'planned_stop'
            ? 'Planned stops'
            : l.kind === 'unplanned_downtime'
              ? 'Unplanned downtime'
              : l.kind === 'speed'
                ? 'Speed loss'
                : 'Quality loss',
        detail: l.reason ?? '',
        value: l.points,
        machine: l.machine_id ?? null,
        incidentId: l.incident_id ?? null,
      }));
    }
    if (plannedAvail === null) return [];
    return oeeLosses(machines, rows, incident, friendlyDefectName(incident?.defect_type), plannedAvail);
  }, [oeeApi.data, machines, rows, incident, plannedAvail]);

  const open = isIncidentOpen(incident) ? incident : null;
  const showBanner = open && dismissedId !== open.incident_id;
  const suspectRow = open ? rows.find((r) => r.id === open.suspect_machine) ?? null : null;
  // A new incident opens the OEE chart on the machine it was traced to.
  const focusId = open?.incident_id ?? null;
  const focusMachine = open?.suspect_machine ?? null;
  useEffect(() => {
    if (focusId && focusMachine) setScope(focusMachine);
  }, [focusId, focusMachine]);

  const diagRow = diagId ? rows.find((r) => r.id === diagId) ?? null : null;
  const factoryType = incident?.impact?.factory_type ?? 'aluminum_cnc';

  const refresh = () => {
    telemetry.reload();
    oeeApi.reload();
    fleet.reload();
    onRefreshIncident();
    onNotify('Line data refreshed', 'info');
  };

  const exportReport = () => {
    const report = {
      exported_at: new Date().toISOString(),
      line: LINE_NAME,
      oee,
      incident: incident
        ? {
            incident_id: incident.incident_id,
            status: incident.status,
            defect_type: incident.defect_type,
            defect_rate: incident.defect_rate,
            spc_ucl: incident.spc_ucl,
            suspect_machine: incident.suspect_machine,
            suspect_tool: incident.suspect_tool,
            root_cause: incident.root_cause,
            verification: `${incident.verification_count}/${incident.verification_target}`,
            approved: incident.approved,
          }
        : null,
      machines: rows.map(({ incident: _inc, ...r }) => r),
      esg: { totals: sumEsg(esgLedger), incidents: esgLedger },
      telemetry_source: telemetry.data?.source ?? null,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cell-line-1-shift-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Shift report exported', 'info');
  };

  return (
    <div className="page page-compact">
      <header className="row between wrap" style={{ gap: 12 }}>
        <h1 className="page-title page-title-sm">{LINE_NAME} Overview</h1>
        <div className="row wrap" style={{ gap: 8 }}>
          <button id="overview-refresh" type="button" className="btn btn-sm" onClick={refresh}>
            <span className="material-symbols-outlined">refresh</span>
            Refresh Line
          </button>
          {onOpenTopology && (
            <button id="overview-topology" type="button" className="btn btn-sm" onClick={onOpenTopology}>
              <span className="material-symbols-outlined">account_tree</span>
              System Topology
            </button>
          )}
          <button id="overview-export" type="button" className="btn btn-sm" onClick={exportReport}>
            <span className="material-symbols-outlined">download</span>
            Export Shift Report
          </button>
          <button id="overview-new-run" type="button" className="btn btn-dark btn-sm" onClick={onOpenSimulation}>
            <span className="material-symbols-outlined">sensors</span>
            Incident Monitor
          </button>
        </div>
      </header>

      {onOpenTopology && (
        <div
          className="glass row between wrap"
          style={{
            padding: '0.75rem 1.1rem',
            borderRadius: 'var(--r-md)',
            background: 'linear-gradient(90deg, rgba(91,91,240,0.08) 0%, rgba(255,255,255,0.7) 100%)',
            borderColor: 'rgba(91,91,240,0.25)',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div className="row" style={{ gap: '0.75rem', alignItems: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                account_tree
              </span>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 650, color: 'var(--ink)' }}>
                4-Phase System Topology &amp; Multi-Agent Swarm
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                Gemma 3 edge classifier &rarr; Pub/Sub &rarr; ADK agents &rarr; Gemini Live copilot &rarr; Invariant #3 streak gate
              </div>
            </div>
          </div>
          <button
            id="overview-jump-topology"
            type="button"
            className="btn btn-sm"
            onClick={onOpenTopology}
            style={{ fontWeight: 600, color: 'var(--accent)', gap: 6 }}
          >
            <span>View Architecture</span>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              arrow_forward
            </span>
          </button>
        </div>
      )}

      {showBanner && (
        <AnomalyBanner
          incident={open}
          row={suspectRow}
          onOpenIncident={() => onOpenIncident(open.incident_id)}
          onDismiss={() => setDismissedId(open.incident_id)}
        />
      )}

      {telemetry.error && !telemetry.data && (
        <div className="glass tone-red" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9f1d22' }}>
          Telemetry unavailable ({telemetry.error}) — is the backend running on :8000?
        </div>
      )}

      <div className="ov-main">
        <div className="glass kpi-strip stagger">
          <DefectRateCard incident={incident} />
          <ActiveIncidentsCard incident={incident} openedAt={openedAt} fleet={fleet.data} />
          <EsgCard ledger={esgLedger} factoryType={factoryType} onOpenHub={onOpenEsgHub} />
        </div>
        <OeeTrendCard
          telemetry={telemetry.data}
          incident={incident}
          rows={rows}
          machines={machines}
          lineOee={oee}
          scope={scope}
          onScope={setScope}
          loading={telemetry.loading || oeeApi.loading || fleet.loading}
          oeeResponse={oeeApi.data}
          plannedAvailability={plannedAvail}
        />
        <OeeLossCard
          losses={losses}
          oee={oee?.oee ?? null}
          onSelectMachine={setScope}
          isLive={Boolean(oeeApi.data)}
        />
      </div>

      <MachineFleetTable rows={rows} loading={telemetry.loading || fleet.loading} onOpenIncident={onOpenIncident} onDiagnostics={setDiagId} />

      <FactoryDigitalTwin incident={incident} />

      {diagRow && (
        <DiagnosticsModal
          row={diagRow}
          telemetry={telemetry.data}
          loading={telemetry.loading}
          error={telemetry.error}
          onClose={() => setDiagId(null)}
        />
      )}
    </div>
  );
}
