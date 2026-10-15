// LineOverviewView: Cell Line 1 one-screen overview — what went wrong (banner), quality / incident / ESG KPIs, OEE trend and losses, and the fleet table.
import React, { useEffect, useMemo, useState } from 'react';
import type { IncidentState, MultiMachineTelemetryResponse } from '../../types';
import type { ToastTone } from '../../App';
import { useApi } from '../../lib/api';
import type { EsgLedgerEntry } from '../../lib/fleet';
import { LINE_NAME, buildFleetRows, computeOee, isIncidentOpen, sumEsg } from '../../lib/fleet';
import AnomalyBanner from '../overview/AnomalyBanner';
import DefectRateCard from '../overview/DefectRateCard';
import ActiveIncidentsCard from '../overview/ActiveIncidentsCard';
import EsgCard from '../overview/EsgCard';
import MachineFleetTable from '../overview/MachineFleetTable';
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
  onNotify,
}: LineOverviewViewProps): React.ReactElement {
  const telemetry = useApi<MultiMachineTelemetryResponse>('/api/telemetry/history', 15000);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [diagId, setDiagId] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);

  const rows = useMemo(() => buildFleetRows(telemetry.data, incident), [telemetry.data, incident]);
  const oee = useMemo(
    () => (telemetry.data || incident ? computeOee(telemetry.data, incident, rows) : null),
    [telemetry.data, incident, rows],
  );

  const machines = useMemo(() => rows.map((r) => machineOee(r, telemetry.data, incident)), [rows, telemetry.data, incident]);
  const losses = useMemo(
    () => oeeLosses(machines, rows, incident, friendlyDefectName(incident?.defect_type)),
    [machines, rows, incident],
  );

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
          <button id="overview-export" type="button" className="btn btn-sm" onClick={exportReport}>
            <span className="material-symbols-outlined">download</span>
            Export Shift Report
          </button>
          <button id="overview-new-run" type="button" className="btn btn-dark btn-sm" onClick={onOpenSimulation}>
            <span className="material-symbols-outlined">play_arrow</span>
            New Run
          </button>
        </div>
      </header>

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
          <ActiveIncidentsCard incident={incident} openedAt={openedAt} />
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
          loading={telemetry.loading}
        />
        <OeeLossCard losses={losses} oee={oee?.oee ?? null} onSelectMachine={setScope} />
      </div>

      <MachineFleetTable rows={rows} loading={telemetry.loading} onOpenIncident={onOpenIncident} onDiagnostics={setDiagId} />

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
