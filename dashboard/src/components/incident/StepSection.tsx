// StepSection: one incident-dossier step that renders done / active / pending and collapses until reached.
import React from 'react';
import StepHeader from './StepHeader';
import type { StepState } from '../../lib/incident';

interface StepSectionProps {
  id: string;
  step: number;
  title: string;
  subtitle: React.ReactNode;
  state: StepState;
  activeLabel: string;
  pendingNote: string;
  tone?: 'dark' | 'accent' | 'green';
  emphasis?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

export default function StepSection({
  id,
  step,
  title,
  subtitle,
  state,
  activeLabel,
  pendingNote,
  tone,
  emphasis,
  trailing,
  children,
}: StepSectionProps): React.ReactElement {
  const pending = state === 'pending';
  const badge =
    state === 'done' ? (
      <span className="chip chip-green">
        <span className="material-symbols-outlined icon-fill" style={{ fontSize: 15 }}>
          check_circle
        </span>
        Complete
      </span>
    ) : state === 'active' ? (
      <span className="chip chip-accent">
        <span className="dot animate-pulse-glow" />
        {activeLabel}
      </span>
    ) : null;

  return (
    <section
      id={id}
      className={`glass incident-step col ${state === 'active' ? 'incident-step-active' : ''}`}
      aria-label={`Step ${step}: ${title}`}
      style={{ padding: pending ? '1.1rem 1.8rem' : '1.8rem', gap: '1.3rem', opacity: pending ? 0.72 : 1 }}
    >
      <StepHeader
        step={step}
        title={title}
        subtitle={subtitle}
        tone={pending ? 'dark' : tone}
        emphasis={emphasis && !pending}
        trailing={
          <span className="row wrap" style={{ gap: 8 }}>
            {!pending && trailing}
            {badge}
          </span>
        }
      />
      {pending ? (
        <p className="row" style={{ gap: 8, fontSize: '0.84rem', color: 'var(--muted)', marginTop: -6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            lock_clock
          </span>
          {pendingNote}
        </p>
      ) : (
        children
      )}
    </section>
  );
}
