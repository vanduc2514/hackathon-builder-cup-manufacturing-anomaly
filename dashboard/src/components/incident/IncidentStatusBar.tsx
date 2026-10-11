// IncidentStatusBar: sticky glass bar — Andon lamp, current step, verification proof and the one primary action.
import React from 'react';
import type { IncidentState } from '../../types';
import { PHASES, STATUS_LABEL, friendlyDefectName } from '../../lib/incident';

interface IncidentStatusBarProps {
  incident: IncidentState;
  product: string;
  approved: boolean;
  currentStep: { number: number; label: string };
  releasing: boolean;
  onRelease: () => void;
  onJumpToStep: (step: number) => void;
}

export default function IncidentStatusBar({
  incident,
  product,
  approved,
  currentStep,
  releasing,
  onRelease,
  onJumpToStep,
}: IncidentStatusBarProps): React.ReactElement {
  const closed = incident.status === 'closed';
  const { verification_count: count, verification_target: target } = incident;
  const pct = Math.min(100, (count / Math.max(1, target)) * 100);
  const lamp = approved ? '#12a150' : (PHASES.find((p) => p.statuses.includes(incident.status))?.lampHex ?? '#94a3b8');
  const live = !approved && !closed;

  return (
    <div
      role="region"
      aria-label="Incident status"
      className="glass glass-strong row between wrap"
      style={{
        position: 'sticky',
        top: 'calc(var(--header-h) + 14px)',
        zIndex: 20,
        gap: '10px 20px',
        padding: '0.6rem 0.6rem 0.6rem 1.1rem',
        background: 'rgba(255, 255, 255, 0.97)',
        borderRadius: 18,
      }}
    >
      <div className="row" style={{ gap: 12, minWidth: 0 }}>
        <span
          className={live ? 'animate-pulse-glow' : undefined}
          style={{ width: 10, height: 10, borderRadius: 999, background: lamp, boxShadow: `0 0 0 4px ${lamp}22`, flexShrink: 0 }}
        />
        <div className="col" style={{ minWidth: 0 }}>
          <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
            #{incident.incident_id}
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {product} · {friendlyDefectName(incident.defect_type)} · {approved ? 'Signed off' : STATUS_LABEL[incident.status]}
          </span>
        </div>
      </div>

      <div className="row" style={{ gap: 22, flex: '1 1 320px', justifyContent: 'center' }}>
        <div className="col">
          <span className="eyebrow">Step</span>
          <span style={{ fontSize: '0.84rem', fontWeight: 650 }}>
            {approved ? '5 of 5 · Released' : `${currentStep.number} of 5 · ${currentStep.label}`}
          </span>
        </div>
        <div className="col" style={{ gap: 4, minWidth: 160 }}>
          <span className="row between">
            <span className="eyebrow">Product proof</span>
            <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: count >= target ? '#0e8a43' : 'var(--ink)' }}>
              {count}/{target}
            </span>
          </span>
          <span className="progress" style={{ height: 5 }}>
            <span style={{ width: `${pct}%`, background: count >= target ? 'linear-gradient(90deg,#34d399,#12a150)' : undefined }} />
          </span>
        </div>
      </div>

      {approved ? (
        <span className="chip chip-green" style={{ padding: '8px 14px', fontSize: '0.8rem' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 17 }}>
            task_alt
          </span>
          Line released
        </span>
      ) : closed ? (
        <button id="statusbar-release" type="button" className="btn btn-dark" disabled={releasing} onClick={onRelease} style={{ borderRadius: 12 }}>
          <span className="material-symbols-outlined">{releasing ? 'autorenew' : 'check_circle'}</span>
          {releasing ? 'Releasing…' : 'Approve & Release Line'}
        </button>
      ) : (
        <button
          id="statusbar-jump"
          type="button"
          className="btn"
          onClick={() => onJumpToStep(currentStep.number)}
          title={`Release unlocks after ${target}/${target} defect-free parts`}
          style={{ borderRadius: 12 }}
        >
          <span className="material-symbols-outlined">lock_clock</span>
          Go to {currentStep.label}
        </button>
      )}
    </div>
  );
}
