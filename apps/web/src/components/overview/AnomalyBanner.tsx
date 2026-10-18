// AnomalyBanner: one-line red alert naming what went wrong (machine, defect, tool), its severity and latest finding, with a jump into the incident.
import React from 'react';
import type { IncidentState } from '../../types';
import type { FleetRow } from '../../lib/fleet';
import { incidentSeverity } from '../../lib/fleet';
import { STATUS_LABEL, friendlyDefectName } from '../../lib/incident';

interface AnomalyBannerProps {
  incident: IncidentState;
  row: FleetRow | null;
  onOpenIncident: () => void;
  onDismiss: () => void;
}

/** Most actionable line we have so far: confirmed root cause, else the newest agent finding. */
function latestAction(inc: IncidentState): { label: string; text: string } | null {
  if (inc.root_cause) return { label: 'Root cause', text: inc.root_cause };
  const last = inc.findings[inc.findings.length - 1];
  if (last) return { label: last.agent_name, text: last.finding };
  if (inc.status_reason) return { label: 'Status', text: inc.status_reason };
  return null;
}

export default function AnomalyBanner({ incident, row, onOpenIncident, onDismiss }: AnomalyBannerProps): React.ReactElement {
  const critical = incidentSeverity(incident) === 'critical';
  const machine = incident.suspect_machine ?? 'Line';
  const where = row && row.bay !== '—' ? `${machine} (${row.bay})` : machine;
  const defect = friendlyDefectName(incident.defect_type);
  const tool = incident.suspect_tool ? ` on Tool ${incident.suspect_tool}` : '';
  const breach = incident.defect_rate > incident.spc_ucl;
  const action = latestAction(incident);
  const signoff = incident.status === 'closed' || incident.status === 'pending_approval';

  return (
    <section className="glass tone-red anomaly-banner" aria-live="polite">
      <span className="anomaly-icon">
        <span className="material-symbols-outlined">warning</span>
      </span>
      <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: '4px 8px' }}>
          <h2 className="anomaly-title">
            {where}: {defect}
            {tool}
            {breach ? ' exceeding SPC limit' : ''}
          </h2>
          {signoff ? (
            <span className="sev-chip sev-chip-green">
              Verified {incident.verification_count}/{incident.verification_target}
            </span>
          ) : (
            <span className={`sev-chip ${critical ? '' : 'sev-chip-amber'}`}>{critical ? 'High severity' : 'Medium severity'}</span>
          )}
          <span className="chip">
            <span className="dot animate-pulse-glow" style={{ color: 'var(--red)' }} />
            {signoff ? 'Awaiting sign-off' : STATUS_LABEL[incident.status]}
          </span>
        </div>
        {action && (
          <p className="anomaly-meta" title={action.text}>
            {action.label}: {action.text}
          </p>
        )}
      </div>
      <div className="row anomaly-actions">
        <button id="banner-open-incident" type="button" className="btn btn-dark btn-sm" onClick={onOpenIncident}>
          Open {incident.incident_id}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <button id="banner-dismiss" type="button" className="icon-btn-plain" aria-label="Dismiss alert" onClick={onDismiss}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </section>
  );
}
