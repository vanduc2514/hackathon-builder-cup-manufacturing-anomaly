// RcaIshikawaPreview: 5-Whys summary cards and Ishikawa category breakdown for TopologyNodeDrawer (TKT-061 #246)
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

interface RcaIshikawaPreviewProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident: IncidentState | null;
}

export default function RcaIshikawaPreview({
  node: _node,
  state: _state,
  incident: _incident,
}: RcaIshikawaPreviewProps): React.ReactElement {
  const fiveWhys = [
    { level: 1, why: 'Why did flange dimension drift?', answer: 'Spindle chatter frequency shifted to 8.4 kHz' },
    { level: 2, why: 'Why did chatter frequency shift?', answer: 'Radial runout on Bay 4 CNC-02 exceeded 0.035 mm' },
    { level: 3, why: 'Why did radial runout exceed tolerance?', answer: 'Cutting tool insert T07 experienced flank face micro-chipping' },
    { level: 4, why: 'Why did micro-chipping occur?', answer: 'Feed rate in NC program reached 120% during roughing cycle' },
    { level: 5, why: 'Root Cause:', answer: 'Tool T07 exceeded 1,200 cutting cycles without scheduled tool offset calibration' },
  ];

  const ishikawaCategories = [
    { name: 'Machine', factor: 'Spindle Bearing & T07 Insert', causal: true },
    { name: 'Method', factor: 'Feed rate override (120%)', causal: true },
    { name: 'Material', factor: 'AlSi10Mg Bar Stock Lot #844', causal: false },
    { name: 'Measurement', factor: 'Conveyor Basler Camera (0.01mm)', causal: false },
    { name: 'Man', factor: 'Bay 4 Shift Operator Check', causal: false },
    { name: 'Environment', factor: 'Coolant Temp 22.4°C', causal: false },
  ];

  return (
    <div
      className="glass"
      style={{
        padding: '1rem',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%)',
        border: '1px solid rgba(99,102,241,0.22)',
      }}
      aria-label="Embedded Root Cause 5-Whys Analysis"
    >
      <div className="row between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#7c3aed' }}>
            psychology
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            Gemini 2.5 Pro · 5-Whys &amp; Ishikawa RCA Synthesis
          </span>
        </div>
        <span className="chip chip-sm chip-purple" style={{ fontSize: '0.7rem' }}>
          89% Causal Confidence (&ge; 0.70)
        </span>
      </div>

      {/* 5-Whys Mini Stepper */}
      <div className="col" style={{ gap: 6, marginBottom: 12 }}>
        <div className="eyebrow" style={{ fontSize: '0.68rem' }}>5-Whys Causal Progression</div>
        {fiveWhys.map((step) => (
          <div
            key={step.level}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              background: step.level === 5 ? 'rgba(124, 58, 237, 0.08)' : 'rgba(15,23,42,0.03)',
              borderLeft: `3px solid ${step.level === 5 ? '#7c3aed' : 'var(--muted)'}`,
              fontSize: '0.74rem',
            }}
          >
            <div style={{ fontWeight: 650, color: step.level === 5 ? '#7c3aed' : 'var(--ink)' }}>
              {step.level}. {step.why}
            </div>
            <div style={{ color: 'var(--text)', marginTop: 2 }}>{step.answer}</div>
          </div>
        ))}
      </div>

      {/* Ishikawa Categories */}
      <div className="col" style={{ gap: 6 }}>
        <div className="eyebrow" style={{ fontSize: '0.68rem' }}>Ishikawa 6M Factor Breakdown</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {ishikawaCategories.map((cat) => (
            <span
              key={cat.name}
              className={`chip chip-sm ${cat.causal ? 'chip-purple' : 'chip-slate'}`}
              style={{ fontSize: '0.68rem', padding: '2px 8px' }}
              title={cat.factor}
            >
              <strong>{cat.name}:</strong> {cat.factor}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
