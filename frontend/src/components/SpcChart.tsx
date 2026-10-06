// SpcChart: Statistical Process Control chart visualizing defect rates against the UCL.
import React from 'react';

interface SpcChartProps {
  defectRate: number;
  ucl: number;
}

export default function SpcChart({ defectRate, ucl }: SpcChartProps): React.ReactElement {
  const isBreached = defectRate >= ucl;
  const progressPercent = Math.min(100, Math.round((defectRate / (ucl * 1.5)) * 100));

  return (
    <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Statistical Process Control (SPC)</h3>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '12px',
            background: isBreached ? '#DC2626' : '#059669',
            color: '#FFFFFF',
          }}
        >
          {isBreached ? 'UCL BREACH DETECTED' : 'IN CONTROL'}
        </span>
      </div>

      <div style={{ margin: '1rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9CA3AF', marginBottom: '0.25rem' }}>
          <span>Current Defect Rate: {(defectRate * 100).toFixed(2)}%</span>
          <span>UCL Threshold: {(ucl * 100).toFixed(2)}%</span>
        </div>
        <div style={{ width: '100%', height: '12px', background: '#1F2937', borderRadius: '6px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: isBreached ? '#EF4444' : '#3B82F6',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}
