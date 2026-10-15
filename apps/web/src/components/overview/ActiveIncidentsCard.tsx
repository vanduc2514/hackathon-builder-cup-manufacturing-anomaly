// ActiveIncidentsCard: open incident count by severity, the MTTR SLA countdown and the good-part streak that closes it.
import React, { useEffect, useState } from 'react';
import type { FleetRegistryResponse, IncidentState } from '../../types';
import { formatCountdown, incidentSeverity, isIncidentOpen } from '../../lib/fleet';

interface ActiveIncidentsCardProps {
  incident: IncidentState | null;
  openedAt: number | null;
  fleet?: FleetRegistryResponse | null;
}

export default function ActiveIncidentsCard({
  incident,
  openedAt,
  fleet,
}: ActiveIncidentsCardProps): React.ReactElement {
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
  const mttrTarget = open?.mttr_target_minutes ?? fleet?.mttr_target_minutes ?? 15;
  const left = working && openedAt !== null ? mttrTarget * 60_000 - (now - openedAt) : null;
  const target = open?.verification_target ?? 0;
  const progress = open && target > 0 ? Math.min(1, open.verification_count / target) : 0;

  return (
    <article className="glass kpi-card">
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow kpi-eyebrow">Incidents</span>
        {left !== null && (
          <span className="chip chip-red">
            <span className="dot animate-pulse-glow" />
            {left >= 0 ? `SLA ${formatCountdown(left)}` : `SLA +${formatCountdown(left)}`}
          </span>
        )}
      </div>
      <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        {open && !working ? (
          <span className="kpi-value" style={{ color: '#b4710a' }}>
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
        <span className="kpi-hint">MTTR target &lt; {mttrTarget}m</span>
      </div>
      {open && target > 0 ? (
        <div className="col" style={{ gap: 5, marginTop: 'auto' }}>
          <div className="row between kpi-line">
            <span>Good parts in a row to close</span>
            <span className="mono">
              {open.verification_count}/{target}
            </span>
          </div>
          <div className="bar">
            <span style={{ width: `${progress * 100}%`, background: progress >= 1 ? 'var(--green)' : 'var(--accent)' }} />
          </div>
        </div>
      ) : (
        <span className="kpi-line" style={{ marginTop: 'auto' }}>
          {open ? 'Verification not started' : 'Line nominal'}
        </span>
      )}
    </article>
  );
}
