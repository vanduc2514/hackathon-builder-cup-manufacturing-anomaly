// AnomalyBanner: red glass alert for the open incident with its SPC numbers and a jump into the incident workspace.
import React from 'react';
import type { IncidentState } from '../../types';
import type { FleetRow } from '../../lib/fleet';
import { incidentSeverity } from '../../lib/fleet';
import { STATUS_LABEL, formatPct, friendlyDefectName } from '../../lib/incident';

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
  const signoff = incident.status === 'closed';

  return (
    <section className="glass tone-red anomaly-banner" aria-live="polite">
      <div className="anomaly-icon">
        <span className="material-symbols-outlined">warning</span>
      </div>
      <div className="col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
        <h2 className="anomaly-title">
          {where}: {defect}
          {tool}
          {breach ? ' Exceeding SPC Limit' : ''}
        </h2>
        <div className="row wrap" style={{ gap: 8 }}>
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
        <p className="anomaly-meta">
          Defect Rate: <b className="mono">{formatPct(incident.defect_rate)}</b> (UCL: {formatPct(incident.spc_ucl)})
          {row?.vibration != null && (
            <>
              {' '}| Vibration: <b className="mono">{row.vibration.toFixed(2)} mm/s</b>
            </>
          )}
          {row && row.part !== '—' && <> | Part: {row.part}</>}
        </p>
        {action && (
          <p className="anomaly-meta clamp-2">
            {action.label}: {action.text}
          </p>
        )}
      </div>
      <div className="row wrap anomaly-actions">
        <button id="banner-open-incident" type="button" className="btn btn-dark" onClick={onOpenIncident}>
          Open {incident.incident_id}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <button id="banner-dismiss" type="button" className="link-btn" style={{ color: '#c9343a' }} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
