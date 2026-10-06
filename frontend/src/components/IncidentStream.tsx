// IncidentStream: renders live agent findings received from the Blackboard event bus.
import React from 'react';
import type { AgentFinding } from '../types';

interface IncidentStreamProps {
  findings: AgentFinding[];
}

export default function IncidentStream({ findings }: IncidentStreamProps): React.ReactElement {
  return (
    <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>Agent Findings & Incident Feed</h3>

      {findings.length === 0 ? (
        <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: 0 }}>
          No findings yet. Waiting for anomaly events from the edge gateway...
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {findings.map((item, index) => (
            <div
              key={`${item.agent_id}-${index}`}
              style={{
                background: '#1F2937',
                borderLeft: '4px solid #3B82F6',
                padding: '0.75rem 1rem',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#93C5FD' }}>
                  [{item.phase}] {item.agent_name}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{item.timestamp}</span>
              </div>
              <p style={{ margin: '0.35rem 0', fontSize: '0.85rem' }}>{item.finding}</p>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#9CA3AF' }}>
                <span>Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                <span>Citation: {item.citation}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
