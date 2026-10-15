import React from 'react';
import AuthGate from './components/mobile/AuthGate';
import IncidentDevice from './components/mobile/IncidentDevice';

export default function App(): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        background: '#090D16',
        color: '#F3F4F6',
        minHeight: '100vh',
      }}
    >
      <main>
        <AuthGate>
          <IncidentDevice />
        </AuthGate>
      </main>
    </div>
  );
}
