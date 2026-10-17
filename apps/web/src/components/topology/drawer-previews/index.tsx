// Barrel exports and resolver for TopologyNodeDrawer preview components
// (TKT-061 #246 / TKT-067 / Issue #259 — AC-TOP-29).
//
// Resolution hierarchy per `getDrawerPreviewComponent`:
//   1. Custom React preview (rich, telemetry-driven) — for the curated set below.
//   2. `StaticPreviewSVG` reading from
//      `apps/web/public/previews/topology/<nodeId>.svg` — for every other
//      curated id in `PREVIEW_SVG_NODE_IDS`.
//   3. `null` — the drawer then renders `NoPreviewPlaceholder` as the
//      defensive last tier (TKT-076 / AC-TOP-28c).
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';
import TelemetryPreview from './TelemetryPreview';
import AcousticWaveformPreview from './AcousticWaveformPreview';
import EdgeGatewayPreview from './EdgeGatewayPreview';
import RcaIshikawaPreview from './RcaIshikawaPreview';
import StreakInvariantPreview from './StreakInvariantPreview';
import StaticPreviewSVG from './StaticPreviewSVG';
import { PREVIEW_SVG_NODE_IDS } from './svgManifest';

export {
  TelemetryPreview,
  AcousticWaveformPreview,
  EdgeGatewayPreview,
  RcaIshikawaPreview,
  StreakInvariantPreview,
  StaticPreviewSVG,
};

/** Node ids that get a fully-interactive React preview (tier 1 of the hierarchy). */
const INTERACTIVE_PREVIEW_IDS: ReadonlySet<string> = new Set([
  'floor-machines',
  'floor-sensors',
  'agent-pa',
  'floor-mics',
  'edge-gemma',
  'edge-bridge',
  'agent-rca',
  'verify-camera',
  'decision-gate-2',
  'streak-reset',
]);

export function getDrawerPreviewComponent(
  node: TopologyNodeDefinition,
  _state: TopologyNodeState,
  _incident: IncidentState | null,
): React.ReactElement | null {
  if (INTERACTIVE_PREVIEW_IDS.has(node.id)) {
    switch (node.id) {
      case 'floor-machines':
      case 'floor-sensors':
      case 'agent-pa':
        return <TelemetryPreview node={node} state={_state} incident={_incident} />;
      case 'floor-mics':
        return <AcousticWaveformPreview node={node} state={_state} incident={_incident} />;
      case 'edge-gemma':
      case 'edge-bridge':
        return <EdgeGatewayPreview node={node} state={_state} incident={_incident} />;
      case 'agent-rca':
        return <RcaIshikawaPreview node={node} state={_state} incident={_incident} />;
      case 'verify-camera':
      case 'decision-gate-2':
      case 'streak-reset':
        return <StreakInvariantPreview node={node} state={_state} incident={_incident} />;
      default:
        break;
    }
  }

  if (PREVIEW_SVG_NODE_IDS.has(node.id)) {
    return <StaticPreviewSVG nodeId={node.id} />;
  }

  return null;
}
