// ProductionLine: visualises factory floor machines and their real-time state.
import React from 'react';

interface ProductionLineProps {
  suspectMachine: string | null;
}

const MACHINES = [
  { id: 'CNC-01', name: 'Milling Station 1', defaultTool: 'T04' },
  { id: 'CNC-02', name: 'Milling Station 2', defaultTool: 'T07' },
  { id: 'CNC-03', name: 'Milling Station 3', defaultTool: 'T07' },
];

export default function ProductionLine({ suspectMachine }: ProductionLineProps): React.ReactElement {
  return (
    <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>Production Line Machines</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {MACHINES.map((machine) => {
          const isSuspect = suspectMachine === machine.id;
          return (
            <div
              key={machine.id}
              style={{
                background: isSuspect ? '#3B1812' : '#1F2937',
                border: `1px solid ${isSuspect ? '#EF4444' : '#374151'}`,
                borderRadius: '6px',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{machine.id}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: isSuspect ? '#EF4444' : '#10B981',
                    color: '#FFFFFF',
                  }}
                >
                  {isSuspect ? 'SUSPECT' : 'NORMAL'}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#9CA3AF' }}>{machine.name}</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6B7280' }}>
                Active Tool: {machine.defaultTool}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
