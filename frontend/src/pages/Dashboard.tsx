// Dashboard page: renders the real-time incident board via SSE from the backend.
import React from 'react';
import type { IncidentState } from '../types';
import AndonPhaseTracker from '../components/AndonPhaseTracker';
import ProductionLine from '../components/ProductionLine';
import SpcChart from '../components/SpcChart';
import TelemetryChart from '../components/TelemetryChart';
import IshikawaViewer from '../components/IshikawaViewer';
import Report8DCard from '../components/Report8DCard';
import ImpactCard from '../components/ImpactCard';
import IncidentStream from '../components/IncidentStream';
import DemoController from '../components/DemoController';

interface DashboardProps {
  incident: IncidentState | null;
}

export default function Dashboard({ incident }: DashboardProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <DemoController incident={incident} />
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

      <AndonPhaseTracker incident={incident} />

      <ProductionLine suspectMachine={incident?.suspect_machine ?? null} />
      <TelemetryChart
        latestTelemetry={incident?.latest_telemetry ?? null}
        suspectMachine={incident?.suspect_machine ?? null}
      />
      <SpcChart defectRate={incident?.defect_rate ?? 0.005} ucl={incident?.spc_ucl ?? 0.03} />

      {/* Interactive 5-Whys Root Cause Deduction & 6M Ishikawa Fishbone Diagram */}
      <IshikawaViewer
        incident={incident}
        rootCause={incident?.root_cause ?? null}
        suspectMachine={incident?.suspect_machine ?? null}
        suspectTool={incident?.suspect_tool ?? null}
        defectType={incident?.defect_type ?? null}
        findings={incident?.findings ?? []}
      />

      {/* 8D Incident Report & Shift Leader Approval Sign-off */}
      <Report8DCard
        incidentId={incident?.incident_id ?? 'INC-0412'}
        status={incident?.status ?? 'normal'}
        approved={incident?.approved ?? false}
        documents={incident?.documents}
        findings={incident?.findings ?? []}
        suspectMachine={incident?.suspect_machine ?? null}
        suspectTool={incident?.suspect_tool ?? null}
        rootCause={incident?.root_cause ?? null}
        defectType={incident?.defect_type ?? null}
      />

      {/* Sustainability & Avoided Scrap Impact */}
      <ImpactCard
        impact={incident?.impact ?? null}
        status={incident?.status}
        incident={incident}
      />

      <IncidentStream findings={incident?.findings ?? []} />
    </div>
  );
}
