// EightDSheet: slide-over 8D report for a past, signed-off solution — D1–D8 from the incident's agent findings and Scribe documents.
import React from 'react';
import type { ImpactMetrics } from '../../types';
import type { VerifiedSolution } from '../../lib/eightD';
import { eightDSteps } from '../../lib/eightD';
import SideDrawer from '../SideDrawer';
import EightDSteps from '../incident/EightDSteps';

interface EightDSheetProps {
  solution: VerifiedSolution;
  impact: ImpactMetrics | null;
  onClose: () => void;
}

export default function EightDSheet({ solution: s, impact, onClose }: EightDSheetProps): React.ReactElement {
  return (
    <SideDrawer
      width={620}
      onClose={onClose}
      eyebrow={
        <>
          <span className="chip chip-accent mono">8D-{s.incidentId}</span>
          <span className={`chip ${s.approved ? 'chip-green' : 'chip-amber'}`}>{s.approved ? 'Approved' : 'Awaiting approval'}</span>
          <span className="kpi-hint">{new Date(s.recordedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </>
      }
      title={`${s.defect}${s.machine ? ` on ${s.machine}` : ''}`}
    >
      {impact && (
        <div className="step-stats">
          <div className="stat">
            <span>Scrap saved</span>
            <b className="mono">{impact.scrap_avoided} pcs</b>
          </div>
          <div className="stat">
            <span>Downtime saved</span>
            <b className="mono">{impact.downtime_minutes} min</b>
          </div>
          <div className="stat">
            <span>CO₂ offset</span>
            <b className="mono" style={{ color: '#0e8a43' }}>
              {impact.co2_kg} kg
            </b>
          </div>
        </div>
      )}

      <EightDSteps steps={eightDSteps(s)} />

      {s.report8d && (
        <details className="inset evidence">
          <summary>
            Original 8D text (Incident Scribe)
            <span className="material-symbols-outlined agent-trail-chevron" style={{ fontSize: 16 }}>
              expand_more
            </span>
          </summary>
          <pre className="mono diff-block" style={{ whiteSpace: 'pre-wrap' }}>
            {s.report8d}
          </pre>
        </details>
      )}
    </SideDrawer>
  );
}
