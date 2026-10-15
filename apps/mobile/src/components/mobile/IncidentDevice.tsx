import React from 'react';
import { useIncidentStream } from '../../hooks/useIncidentStream';
import MobileDeviceFrame from './MobileDeviceFrame';
import { StreamStatusContext } from './streamStatusContext';

/** Signed-in device: opens the incident stream (needs the token) and renders the app in its chassis. */
export default function IncidentDevice(): React.ReactElement {
  const { incident, history, status } = useIncidentStream();

  return (
    <StreamStatusContext.Provider value={status}>
      <MobileDeviceFrame incident={incident} history={history} />
    </StreamStatusContext.Provider>
  );
}
