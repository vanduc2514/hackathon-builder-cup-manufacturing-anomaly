// StepRail: slim glass dot-track — dot colour is the step's state, the elongated dot is the step in view.
import React, { useEffect, useState } from 'react';
import type { StepState } from '../../lib/incident';

interface StepRailProps {
  steps: { id: string; label: string; state: StepState }[];
}

const STATE_COLOR: Record<StepState, string> = {
  done: '#12a150',
  active: 'var(--accent)',
  pending: 'transparent',
};

export default function StepRail({ steps }: StepRailProps): React.ReactElement {
  const [inView, setInView] = useState<string>(steps[0]?.id ?? '');

  useEffect(() => {
    const onScroll = () => {
      const probe = window.innerHeight * 0.4;
      let current = steps[0]?.id ?? '';
      steps.forEach((s) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= probe) current = s.id;
      });
      setInView(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [steps]);

  return (
    <nav aria-label="Incident steps" className="glass glass-strong step-rail">
      <span className="step-rail-track" aria-hidden="true" />
      {steps.map((s, i) => {
        const current = inView === s.id;
        return (
          <button
            key={s.id}
            id={`rail-${s.id}`}
            type="button"
            className="step-rail-item"
            aria-label={`Step ${i + 1}: ${s.label} (${s.state})`}
            aria-current={current ? 'step' : undefined}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span
              className={`step-rail-dot ${s.state === 'active' ? 'animate-pulse-glow' : ''}`}
              style={{
                height: current ? 18 : 8,
                background: STATE_COLOR[s.state],
                borderColor: s.state === 'pending' ? 'var(--faint)' : STATE_COLOR[s.state],
              }}
            />
            <span className="step-rail-tip">
              <span className="mono" style={{ opacity: 0.6, marginRight: 6 }}>
                {i + 1}
              </span>
              {s.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
