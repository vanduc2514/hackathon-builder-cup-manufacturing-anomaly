// LineOverviewView: Cell Line 1 landing page — anomaly banner, OEE / SPC / incident / ESG KPIs and the machine fleet.
import React, { useMemo, useState } from 'react';
import type { IncidentState, MultiMachineTelemetryResponse } from '../../types';
import type { ToastTone } from '../../App';
import { useApi } from '../../lib/api';
import type { EsgLedgerEntry } from '../../lib/fleet';
import { LINE_NAME, buildFleetRows, computeOee, isIncidentOpen, sumEsg } from '../../lib/fleet';
import AnomalyBanner from '../overview/AnomalyBanner';
import OeeCard from '../overview/OeeCard';
import DefectRateCard from '../overview/DefectRateCard';
import ActiveIncidentsCard from '../overview/ActiveIncidentsCard';
import EsgCard from '../overview/EsgCard';
import MachineFleetTable from '../overview/MachineFleetTable';
import DiagnosticsModal from '../overview/DiagnosticsModal';

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

  const rows = useMemo(() => buildFleetRows(telemetry.data, incident), [telemetry.data, incident]);
  const oee = useMemo(
    () => (telemetry.data || incident ? computeOee(telemetry.data, incident, rows) : null),
    [telemetry.data, incident, rows],
  );

  const open = isIncidentOpen(incident) ? incident : null;
  const showBanner = open && dismissedId !== open.incident_id;
  const suspectRow = open ? rows.find((r) => r.id === open.suspect_machine) ?? null : null;
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
    <div className="page">
      <header className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{LINE_NAME} Overview</h1>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
            Real-time machine fleet telemetry, statistical process control (SPC), and instant dispatch
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="overview-refresh" type="button" className="btn" onClick={refresh}>
            <span className="material-symbols-outlined">refresh</span>
            Refresh Line
          </button>
          <button id="overview-export" type="button" className="btn" onClick={exportReport}>
            <span className="material-symbols-outlined">download</span>
            Export Shift Report
          </button>
          <button id="overview-new-run" type="button" className="btn btn-dark" onClick={onOpenSimulation}>
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

      <div className="grid ov-kpi-grid stagger">
        <OeeCard oee={oee} />
        <DefectRateCard incident={incident} />
        <ActiveIncidentsCard
          incident={incident}
          openedAt={openedAt}
          onOpenIncident={() => open && onOpenIncident(open.incident_id)}
        />
        <EsgCard ledger={esgLedger} factoryType={factoryType} onOpenHub={onOpenEsgHub} />
      </div>

      {telemetry.error && !telemetry.data && (
        <div className="glass tone-red" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9f1d22' }}>
          Telemetry unavailable ({telemetry.error}) — is the backend running on :8000?
        </div>
      )}

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
