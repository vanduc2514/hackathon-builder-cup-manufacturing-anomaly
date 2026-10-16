// PhaseStepperBar: Tier 1 Glance 4-Phase Lifecycle Progression Bar (AC-TOP-23, Issue #227)
import React, { useMemo } from 'react';
import type { IncidentState, TopologyScenarioId } from '../../types';
import { derivePhaseStepperInfo } from '../../lib/topology';

export interface PhaseStepperBarProps {
  incident: IncidentState | null;
  scenario?: TopologyScenarioId | 'live';
  onScrollToLayer?: (layerId: string) => void;
}

export default function PhaseStepperBar({
  incident,
  scenario = 'live',
  onScrollToLayer,
}: PhaseStepperBarProps): React.ReactElement {
  const steps = useMemo(
    () => derivePhaseStepperInfo(incident, scenario),
    [incident, scenario],
  );

  const handleStepClick = (targetLayerId: string) => {
    if (onScrollToLayer) {
      onScrollToLayer(targetLayerId);
    } else {
      const el = document.getElementById(targetLayerId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <nav
      aria-label="Incident Lifecycle Phases"
      className="phase-stepper-bar-wrapper"
    >
      <div className="phase-stepper-bar" id="phase-stepper-bar">
        {steps.map((step, index) => (
          <div
            key={step.id}
            id={step.id}
            role="button"
            tabIndex={0}
            aria-label={`${step.title}: Status ${step.statusText}. Click to navigate to architecture layer.`}
            className={`stepper-step step-${step.status}`}
            onClick={() => handleStepClick(step.targetLayerId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStepClick(step.targetLayerId);
              }
            }}
          >
            <div className="step-indicator">
              <span className="material-symbols-outlined step-icon" aria-hidden="true">
                {step.icon}
              </span>
            </div>
            <div className="step-content">
              <div className="step-title-row">
                <span className="step-title">{step.title}</span>
                <span className="step-status-chip">{step.statusText}</span>
              </div>
              <div className="step-desc">{step.description}</div>
            </div>
            {index < steps.length - 1 && (
              <span className="material-symbols-outlined step-chevron" aria-hidden="true">
                chevron_right
              </span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
