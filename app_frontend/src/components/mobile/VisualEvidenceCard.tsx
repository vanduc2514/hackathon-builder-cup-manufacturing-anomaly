import React from 'react';
import type { VisualEvidencePayload } from '../../types';

interface VisualEvidenceCardProps {
  evidence: VisualEvidencePayload;
}

/** The Copilot's analysis of the last technician photo (`IncidentState.visual_evidence`). */
export default function VisualEvidenceCard({ evidence }: VisualEvidenceCardProps): React.ReactElement {
  return (
    <section className="m-glass m-card m-col" style={{ gap: 8 }}>
      <div className="m-between">
        <span className="m-ai-badge">
          <span className="spark">
            <span className="material-symbols-outlined ms-fill">visibility</span>
          </span>
          What the AI saw
        </span>
        <span className={`m-chip ${evidence.defect_detected ? 'red' : 'green'}`}>
          {evidence.defect_detected ? 'Defect confirmed' : 'No defect'}
        </span>
      </div>
      <p className="m-body" style={{ fontSize: 13 }}>{evidence.analysis}</p>
      {evidence.wear_measurement_mm != null && (
        <div className="m-sub">
          Measured wear: <b style={{ color: 'var(--ink)' }}>{evidence.wear_measurement_mm} mm</b>
        </div>
      )}
      <span className="m-cite">
        <span className="material-symbols-outlined">photo_camera</span>
        {evidence.citation}
      </span>
    </section>
  );
}
