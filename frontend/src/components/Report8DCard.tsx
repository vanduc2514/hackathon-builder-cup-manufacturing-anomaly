// Report8DCard: 8D Incident Report viewer, containment actions, and shift-leader approval sign-off.
import React from 'react';
import type { AgentFinding } from '../types';

interface Report8DCardProps {
  incidentId: string;
  status: string;
  approved: boolean;
  documents?: Record<string, unknown>;
  findings?: AgentFinding[];
}

export default function Report8DCard({
  incidentId,
  status,
  approved,
  documents,
  findings = [],
}: Report8DCardProps): React.ReactElement {
  const isClosed = status === 'closed';

  const dSteps = [
    { code: 'D1', title: 'Team', desc: 'ADK Autonomous Multi-Agent Team + Frontline Technician' },
    { code: 'D2', title: 'Problem', desc: 'Defect rate spike exceeding 3.0% UCL threshold' },
    { code: 'D3', title: 'Containment', desc: 'Immediate line pause; quarantining suspect batch' },
    { code: 'D4', title: 'Root Cause', desc: 'Tool wear chatter & uncalibrated acoustic emission drift' },
    { code: 'D5', title: 'Corrective Action', desc: 'Replace T07 insert & recalibrate spindle torque' },
    { code: 'D6', title: 'Validation', desc: '50 consecutive defect-free parts confirmed on conveyor' },
    { code: 'D7', title: 'Prevent Recurrence', desc: 'SOP revised; tool wear threshold updated in BigQuery' },
    { code: 'D8', title: 'Recognition', desc: 'Institutional memory updated in Vertex AI Search RAG' },
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
              background: '#065F46',
              color: '#A7F3D0',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}
          >
            SCRIBE AGENT
          </span>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#F8FAFC' }}>
            8D Incident Report & Shift Leader Approval
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '12px',
              background: approved ? '#064E3B' : isClosed ? '#78350F' : '#1E293B',
              color: approved ? '#6EE7B7' : isClosed ? '#FCD34D' : '#94A3B8',
              border: `1px solid ${approved ? '#059669' : isClosed ? '#F59E0B' : '#334155'}`,
            }}
          >
            {approved ? '✓ APPROVED BY SHIFT LEADER' : isClosed ? '⏳ AWAITING SHIFT LEADER SIGN-OFF' : 'DRAFT IN PROGRESS'}
          </span>
        </div>
      </div>

      {/* 8D Disciplines Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {dSteps.map((d, idx) => {
          const isDone = isClosed || idx < 4;
          return (
            <div
              key={d.code}
              style={{
                background: '#0F172A',
                border: `1px solid ${isDone ? '#334155' : '#1E293B'}`,
                borderRadius: '6px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDone ? '#38BDF8' : '#64748B' }}>
                  {d.code}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#F1F5F9' }}>
                  {d.title}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', lineHeight: 1.3 }}>
                {d.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scribe Agent Findings */}
      {findings.filter(f => f.agent_name.toLowerCase().includes('scribe') || f.phase === 'D').length > 0 && (
        <div style={{ background: '#0F172A', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Scribe Summary & Actions:
          </div>
          {findings
            .filter(f => f.agent_name.toLowerCase().includes('scribe') || f.phase === 'D')
            .map((f, idx) => (
              <div key={idx} style={{ fontSize: '0.8rem', color: '#E2E8F0', marginTop: '0.25rem' }}>
                • {f.finding}
              </div>
            ))}
        </div>
      )}

      {/* Drafted Documents & Reports */}
      {documents && Object.keys(documents).length > 0 && (
        <div style={{ background: '#0F172A', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #1E293B' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Generated Documentation Artifacts ({incidentId}):
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.keys(documents).map((docKey) => (
              <span
                key={docKey}
                style={{
                  background: '#1E293B',
                  color: '#38BDF8',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}
              >
                📄 {docKey}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
