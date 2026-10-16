// Barrel exports and resolver for TopologyNodeDrawer preview components (TKT-061 #246)
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';
import TelemetryPreview from './TelemetryPreview';
import AcousticWaveformPreview from './AcousticWaveformPreview';
import EdgeGatewayPreview from './EdgeGatewayPreview';
import RcaIshikawaPreview from './RcaIshikawaPreview';
import StreakInvariantPreview from './StreakInvariantPreview';

export {
  TelemetryPreview,
  AcousticWaveformPreview,
  EdgeGatewayPreview,
  RcaIshikawaPreview,
  StreakInvariantPreview,
};

export function getDrawerPreviewComponent(
  node: TopologyNodeDefinition,
  state: TopologyNodeState,
  incident: IncidentState | null,
): React.ReactElement | null {
  switch (node.id) {
    case 'floor-machines':
    case 'floor-sensors':
    case 'agent-pa':
      return <TelemetryPreview node={node} state={state} incident={incident} />;

    case 'floor-mics':
      return <AcousticWaveformPreview node={node} state={state} incident={incident} />;

    case 'edge-gemma':
    case 'edge-bridge':
      return <EdgeGatewayPreview node={node} state={state} incident={incident} />;

    case 'agent-rca':
      return <RcaIshikawaPreview node={node} state={state} incident={incident} />;

    case 'verify-camera':
    case 'decision-gate-2':
    case 'streak-reset':
      return <StreakInvariantPreview node={node} state={state} incident={incident} />;

    default:
      return null;
  }
}
