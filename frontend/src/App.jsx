// Root application component — placeholder for Kaizen Agent dashboard pages.
import React from 'react';

export default function App() {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '2rem', background: '#090D16', color: '#F3F4F6', minHeight: '100vh' }}>
      <h1>Kaizen Agent Frontend</h1>
      <p style={{ color: '#9CA3AF', marginTop: '0.5rem' }}>
        Placeholder — connect this to the FastAPI backend at <code>/api/incidents/events</code>.
      </p>
    </div>
  );
}
