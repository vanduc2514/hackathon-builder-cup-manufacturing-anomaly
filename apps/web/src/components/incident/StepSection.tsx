// StepSection: one incident step — collapsible to a one-line summary once done; pending steps stay locked and compact.
import React from 'react';
import type { StepState } from '../../lib/incident';

interface StepSectionProps {
  id: string;
  step: number;
  title: string;
  state: StepState;
  activeLabel: string;
  pendingNote: string;
  /** One line shown when collapsed (and under the title when open). */
  summary: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  /** Always visible next to the header, even while the step is still locked (e.g. the hard-locked approval CTA). */
  pinnedTrailing?: React.ReactNode;
  alert?: boolean;
  children: React.ReactNode;
}

export default function StepSection({
  id,
  step,
  title,
  state,
  activeLabel,
  pendingNote,
  summary,
  open,
  onToggle,
  trailing,
  pinnedTrailing,
  alert = false,
  children,
}: StepSectionProps): React.ReactElement {
  const pending = state === 'pending';
  const expanded = open && !pending;
  const bodyId = `${id}-body`;

  const badge =
    state === 'done' ? (
      <span className="chip chip-green">
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14 }}>
          check_circle
        </span>
        Done
      </span>
    ) : state === 'active' ? (
      <span className={`chip ${alert ? 'chip-red' : 'chip-accent'}`}>
        <span className="dot animate-pulse-glow" />
        {activeLabel}
      </span>
    ) : (
      <span className="chip">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          lock_clock
        </span>
        Waiting
      </span>
    );

  return (
    <section
      id={id}
      className={`glass incident-step ${state === 'active' ? 'incident-step-active' : ''} ${pending ? 'incident-step-pending' : ''}`}
      aria-label={`Step ${step}: ${title}`}
    >
      <div className="step-head-row">
        <button
          type="button"
          className="step-head"
          onClick={onToggle}
          disabled={pending}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          <span className={`step-num step-num-${state}`}>
            {state === 'done' ? (
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                check
              </span>
            ) : (
              step
            )}
          </span>
          <span className="col" style={{ minWidth: 0, flex: 1, gap: 2, textAlign: 'left' }}>
            <span className="step-title">{title}</span>
            {!expanded && <span className="step-summary">{pending ? pendingNote : summary}</span>}
          </span>
          <span className="row step-trailing" style={{ gap: 8 }}>
            {!pending && trailing}
            {badge}
            {!pending && (
              <span className="material-symbols-outlined step-chevron" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            )}
          </span>
        </button>
        {pinnedTrailing && <div className="step-pinned">{pinnedTrailing}</div>}
      </div>
      {expanded && (
        <div id={bodyId} className="step-body">
          {children}
        </div>
      )}
    </section>
  );
}
