// Root application component for Kaizen Agent dashboard.
import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import type { IncidentState } from './types';

export default function App(): React.ReactElement {
  const [incident, setIncident] = useState<IncidentState | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/incidents/events');

    eventSource.addEventListener('incident_update', (event: MessageEvent<string>) => {
      try {
        const data: IncidentState = JSON.parse(event.data);
        setIncident(data);
      } catch (err) {
        console.error('Failed to parse incident SSE event:', err);
      }
    });

    eventSource.onerror = (err) => {
      console.warn('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '2rem',
        background: '#090D16',
        color: '#F3F4F6',
        minHeight: '100vh',
      }}
    >
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #1F2937', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>Kaizen Agent Dashboard</h1>
        <p style={{ color: '#9CA3AF', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
          Product-First Manufacturing Anomaly Detection & Autonomous Resolution
        </p>
      </header>

      <main>
        <Dashboard incident={incident} />
      </main>
    </div>
  );
}
