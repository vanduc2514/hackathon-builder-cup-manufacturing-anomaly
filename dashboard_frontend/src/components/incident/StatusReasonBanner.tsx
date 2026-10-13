// StatusReasonBanner: surfaces incident.status_reason when an incident is escalated, dismissed or errored.
import React from 'react';
import type { IncidentState } from '../../types';
import { STATUS_LABEL } from '../../lib/incident';

interface StatusReasonBannerProps {
  incident: IncidentState;
}

const TONE: Record<string, { bg: string; border: string; fg: string; icon: string }> = {
  escalated: { bg: 'rgba(255,247,237,0.97)', border: 'rgba(245,165,36,0.45)', fg: '#92400e', icon: 'campaign' },
  error: { bg: 'rgba(254,242,242,0.95)', border: 'rgba(239,68,68,0.35)', fg: '#991b1b', icon: 'error' },
  dismissed: { bg: 'rgba(241,245,249,0.97)', border: 'rgba(100,116,139,0.35)', fg: '#334155', icon: 'block' },
};

export default function StatusReasonBanner({ incident }: StatusReasonBannerProps): React.ReactElement | null {
  const reason = incident.status_reason;
  const tone = TONE[incident.status];
  if (!reason || !tone) return null;
  return (
    <div
      id="incident-status-reason"
      role="alert"
      className="row"
      style={{ gap: 12, padding: '0.9rem 1.25rem', borderRadius: 14, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.fg }}
    >
      <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24 }}>
        {tone.icon}
      </span>
      <div className="col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{STATUS_LABEL[incident.status]}</span>
        <span style={{ fontSize: '0.86rem' }}>{reason}</span>
      </div>
    </div>
  );
}
