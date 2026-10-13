import React from 'react';
import MobileDeviceFrame from './components/mobile/MobileDeviceFrame';
import { StreamStatusContext } from './components/mobile/streamStatusContext';
import { useIncidentStream } from './hooks/useIncidentStream';

export default function App(): React.ReactElement {
  const { incident, status } = useIncidentStream();

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
        <StreamStatusContext.Provider value={status}>
          <MobileDeviceFrame incident={incident} />
        </StreamStatusContext.Provider>
      </main>
    </div>
  );
}
