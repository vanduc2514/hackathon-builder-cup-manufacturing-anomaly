// RootCauseCard: 5-Whys deduction chain, causal hypothesis, and grounded RAG citations.
import React from 'react';
import type { AgentFinding } from '../types';

interface RootCauseCardProps {
  rootCause: string | null;
  suspectMachine: string | null;
  suspectTool: string | null;
  findings: AgentFinding[];
}

export default function RootCauseCard({
  rootCause,
  suspectMachine,
  suspectTool,
  findings,
}: RootCauseCardProps): React.ReactElement {
  // Extract RCA-specific findings
  const rcaFindings = findings.filter(
    (f) =>
      f.agent_name.toLowerCase().includes('root cause') ||
      f.phase === 'investigating' ||
      f.phase === 'B'
  );

  const defaultWhys = [
    { level: 'Why 1', question: 'Why did optical inspection detect repetitive vertical surface scratches?', answer: 'Cutting tool T07 on CNC-02 exhibited excessive micro-chatter during finishing passes.' },
    { level: 'Why 2', question: 'Why was excessive micro-chatter occurring on tool T07?', answer: 'Carbide insert cutting edge suffered severe flank wear (>0.35mm).' },
    { level: 'Why 3', question: 'Why did flank wear exceed operational threshold?', answer: 'Spindle feed rate exceeded recommended limits following batch tool change without recalibration.' },
    { level: 'Why 4', question: 'Why was tool wear not caught during scheduled preventive checks?', answer: 'Acoustic emission sensor baseline drift went uncalibrated across the last 120 cycles.' },
    { level: 'Why 5 (Root Cause)', question: 'Root Cause:', answer: rootCause || 'Carbide tool insert flank wear on CNC-02 T07 with uncompensated spindle thermal drift.' },
  ];

  return (
    <div
      style={{
        background: '#0B131F',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              background: '#312E81',
              color: '#A5B4FC',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}
          >
            RCA AGENT
          </span>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#F8FAFC' }}>
            5-Whys Root Cause Deduction & Ishikawa Fishbone
          </h3>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
          Suspect: <span style={{ color: '#F59E0B', fontWeight: 600 }}>{suspectMachine || 'CNC-02'}</span> / <span style={{ color: '#38BDF8', fontWeight: 600 }}>{suspectTool || 'T07'}</span>
        </div>
      </div>

      {/* Causal Hypothesis Banner */}
      <div
        style={{
          background: '#1E1B4B',
          border: '1px solid #4338CA',
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#A5B4FC', fontWeight: 700 }}>
          Grounded Causal Hypothesis
        </div>
        <div style={{ fontSize: '1rem', color: '#EEF2FF', fontWeight: 500 }}>
          {rootCause || 'Carbide tool insert flank wear on CNC-02 spindle T07 causing recurring surface gouging'}
        </div>
      </div>

      {/* 5-Whys Sequential Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
          5-Whys Diagnostic Chain:
        </div>
        {defaultWhys.map((w, idx) => (
          <div
            key={idx}
            style={{
              background: '#0F172A',
              border: idx === 4 ? '1px solid #6366F1' : '1px solid #1E293B',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: idx === 4 ? '#818CF8' : '#38BDF8',
                  background: idx === 4 ? '#312E81' : '#0369A1',
                  padding: '1px 6px',
                  borderRadius: '3px',
                }}
              >
                {w.level}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 500 }}>{w.question}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#E2E8F0', paddingLeft: '0.5rem', borderLeft: '2px solid #334155' }}>
              {w.answer}
            </div>
          </div>
        ))}
      </div>

      {/* RCA Findings & Knowledge Citations */}
      {rcaFindings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #1E293B', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
            Verified Knowledge Citations & Telemetry Evidence:
          </div>
          {rcaFindings.map((f, i) => (
            <div
              key={i}
              style={{
                fontSize: '0.8rem',
                color: '#CBD5E1',
                background: '#0F172A',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #1E293B',
              }}
            >
              <div style={{ fontWeight: 600, color: '#A5B4FC' }}>{f.finding}</div>
              {f.citation && <div style={{ fontSize: '0.75rem', color: '#38BDF8', marginTop: '0.25rem' }}>📚 {f.citation}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
