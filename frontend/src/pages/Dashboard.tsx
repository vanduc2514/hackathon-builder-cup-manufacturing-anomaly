// Dashboard page: renders the real-time incident board via SSE from the backend.
import React from 'react';
import type { IncidentState } from '../types';
import ProductionLine from '../components/ProductionLine';
import SpcChart from '../components/SpcChart';
import IncidentStream from '../components/IncidentStream';

interface DashboardProps {
  incident: IncidentState | null;
}

export default function Dashboard({ incident }: DashboardProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
          <div style={{ fontSize: '0.8rem', color: '#9CA3AF', textTransform: 'uppercase' }}>Active Incident</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, marginTop: '0.25rem' }}>
            {incident?.incident_id ?? 'None'}
          </div>
          <div style={{ fontSize: '0.85rem', color: incident?.status === 'normal' ? '#10B981' : '#F59E0B', marginTop: '0.25rem' }}>
            Status: {incident?.status ?? 'Monitoring'}
          </div>
        </div>

        <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
          <div style={{ fontSize: '0.8rem', color: '#9CA3AF', textTransform: 'uppercase' }}>Defect Rate</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, marginTop: '0.25rem' }}>
            {incident ? `${(incident.defect_rate * 100).toFixed(2)}%` : '0.00%'}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
            UCL: {incident ? `${(incident.spc_ucl * 100).toFixed(2)}%` : '3.00%'}
          </div>
        </div>

        <div style={{ background: '#111827', padding: '1.25rem', borderRadius: '8px', border: '1px solid #1F2937' }}>
          <div style={{ fontSize: '0.8rem', color: '#9CA3AF', textTransform: 'uppercase' }}>Suspect Location</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, marginTop: '0.25rem' }}>
            {incident?.suspect_machine ?? 'Clear'}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
            Tool: {incident?.suspect_tool ?? 'N/A'}
          </div>
        </div>
      </section>

      <ProductionLine suspectMachine={incident?.suspect_machine ?? null} />
      <SpcChart defectRate={incident?.defect_rate ?? 0.005} ucl={incident?.spc_ucl ?? 0.03} />
      <IncidentStream findings={incident?.findings ?? []} />
    </div>
  );
}
