// ActiveIncidentsCard: open incident count by severity, the incident chip and the MTTR SLA countdown.
import React, { useEffect, useState } from 'react';
import type { IncidentState } from '../../types';
import { MTTR_TARGET_MIN, formatCountdown, incidentSeverity, isIncidentOpen } from '../../lib/fleet';
import { friendlyDefectName } from '../../lib/incident';

interface ActiveIncidentsCardProps {
  incident: IncidentState | null;
  openedAt: number | null;
  onOpenIncident: () => void;
}

export default function ActiveIncidentsCard({ incident, openedAt, onOpenIncident }: ActiveIncidentsCardProps): React.ReactElement {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const open = isIncidentOpen(incident) ? incident : null;
  const severity = open ? incidentSeverity(open) : null;
  const critical = severity === 'critical' ? 1 : 0;
  const minor = severity === 'minor' ? 1 : 0;
  const working = open && open.status !== 'closed';
  const left = working && openedAt !== null ? MTTR_TARGET_MIN * 60_000 - (now - openedAt) : null;

  return (
    <article className="glass kpi-card">
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow kpi-eyebrow">Active incidents</span>
        {left !== null && (
          <span className="chip chip-red">
            <span className="dot animate-pulse-glow" />
            {left >= 0 ? `${formatCountdown(left)} SLA left` : `SLA +${formatCountdown(left)}`}
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        {open && !working ? (
          <span className="kpi-value" style={{ color: '#b4710a', whiteSpace: 'nowrap' }}>
            1 Sign-off
          </span>
        ) : open ? (
          <span className="kpi-value" style={{ color: critical ? '#c9343a' : '#b4710a' }}>
            {critical || minor} {critical ? 'Critical' : 'Minor'}
          </span>
        ) : (
          <span className="kpi-value" style={{ color: '#0e8a43' }}>
            0 Open
          </span>
        )}
        <span className="kpi-hint">
          {open && !working ? 'Verified, awaiting approval' : critical ? `${minor} Minor` : open ? '0 Critical' : 'Line nominal'}
        </span>
      </div>
      <div className="col" style={{ gap: 10, marginTop: 'auto' }}>
        {open ? (
          <button type="button" className="glass-inset incident-chip" onClick={onOpenIncident}>
            <span className="col" style={{ minWidth: 0, textAlign: 'left' }}>
              <span className="mono" style={{ fontWeight: 650, color: 'var(--ink)' }}>
                {open.incident_id}
              </span>
              <span className="kpi-hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {open.suspect_machine ?? 'Line'} • {friendlyDefectName(open.defect_type)}
              </span>
            </span>
            <span className={`chip ${!working ? 'chip-green' : critical ? 'chip-red' : 'chip-amber'}`}>
              {!working ? 'Verified' : critical ? 'P1 Critical' : 'P2 Minor'}
            </span>
          </button>
        ) : (
          <div className="glass-inset incident-chip" style={{ cursor: 'default' }}>
            <span className="kpi-hint">No open incidents on this line.</span>
          </div>
        )}
        <div className="row between kpi-line">
          <span>Target MTTR</span>
          <span className="mono">&lt; {MTTR_TARGET_MIN} mins</span>
        </div>
      </div>
    </article>
  );
}
