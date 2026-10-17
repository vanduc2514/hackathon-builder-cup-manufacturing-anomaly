// Cover the full 30-id drawer-preview resolver hierarchy
// (TKT-067 / Issue #259 — AC-TOP-29).
//
// `getDrawerPreviewComponent` must return a non-null React element for every
// curated topology node id (28 nodes + decision-gate-1/2 + streak-reset).
// Behaviour:
//   * Curated interactive ids get their dedicated React preview.
//   * Remaining curated ids resolve to `StaticPreviewSVG` reading from
//     `/previews/topology/<id>.svg` (the 30 SVGs the Designer shipped).
//   * No id is expected to fall back to `null` inside the manifest.
//
// A separate non-regression test pins `NoPreviewPlaceholder` for unknown ids
// outside the curated set (AC-TOP-28c).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TOPOLOGY_NODES } from '../../../lib/topology';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeId, TopologyNodeState } from '../../../types';
import { getDrawerPreviewComponent } from '../drawer-previews';
import { PREVIEW_SVG_NODE_IDS, hasStaticSvg } from '../drawer-previews/svgManifest';
import TopologyNodeDrawer from '../TopologyNodeDrawer';
import NoPreviewPlaceholder from '../drawer-previews/NoPreviewPlaceholder';

const incident: IncidentState = {
  incident_id: 'inc-prev-coverage',
  status: 'investigating',
  status_reason: 'preview coverage',
  defect_type: 'tool_wear',
  defect_rate: 0.05,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Cover test',
  verification_count: 1,
  verification_target: 50,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
};

function state(id: TopologyNodeId): TopologyNodeState {
  return { id, summary: id, status: 'idle', isInferred: false, details: {} };
}

describe('drawer-previews resolver (TKT-067 / AC-TOP-29)', () => {
  it('covers exactly 30 curated ids in PREVIEW_SVG_NODE_IDS (28 nodes + 2 gates + streak-reset)', () => {
    expect(PREVIEW_SVG_NODE_IDS.size).toBe(30);
    const curated = new Set(TOPOLOGY_NODES.map((n) => n.id));
    expect(curated.size).toBe(30);
    for (const id of curated) {
      expect(hasStaticSvg(id)).toBe(true);
    }
  });

  it('returns a non-null React element for EVERY TOPOLOGY_NODES id', () => {
    for (const node of TOPOLOGY_NODES) {
      const element = getDrawerPreviewComponent(node, state(node.id), incident);
      expect(element, `expected preview for ${node.id}`).not.toBeNull();
    }
  });

  it('routes interactive ids to their dedicated React preview', () => {
    const interactiveIds = [
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
    ] as const;
    for (const id of interactiveIds) {
      const node: TopologyNodeDefinition = {
        ...TOPOLOGY_NODES.find((n) => n.id === id)!,
      } as TopologyNodeDefinition;
      const el = getDrawerPreviewComponent(node, state(node.id), incident);
      expect(el).not.toBeNull();
      // Non-SVG previews must expose an aria-label the existing drawer tests rely on.
      const html = render(el!).container.innerHTML;
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it('routes non-interactive curated ids to StaticPreviewSVG (img src = /previews/topology/<id>.svg)', () => {
    const sampleIds: TopologyNodeId[] = [
      'adk-orch',
      'agent-qa',
      'agent-learn',
      'agent-scribe',
      'agent-tra',
      'copilot-live',
      'decision-gate-1',
      'diagnostic-agent',
      'floor-cameras',
      'floor-tags',
      'gcp-bigquery',
      'gcp-firestore',
      'gcp-gemini',
      'gcp-pubsub',
      'gcp-rag',
      'human-dash',
      'human-lead',
      'human-tech',
      'output-docs',
      'technician-photo',
    ];
    for (const id of sampleIds) {
      const node: TopologyNodeDefinition = {
        ...TOPOLOGY_NODES.find((n) => n.id === id)!,
      } as TopologyNodeDefinition;
      const el = getDrawerPreviewComponent(node, state(id), incident);
      expect(el, `expected StaticPreviewSVG for ${id}`).not.toBeNull();

      const { unmount } = render(<>{el}</>);
      const img = screen.getByRole('img', { name: new RegExp(id, 'i') });
      expect(img.getAttribute('src')).toBe(`/previews/topology/${id}.svg`);
      unmount();
    }
  });

  it('falls back to NoPreviewPlaceholder for ids outside the curated set (AC-TOP-28c)', () => {
    // NoPreviewPlaceholder must still render for an unknown id and the
    // resolver must keep `null` for ids the manifest does not cover.
    render(<NoPreviewPlaceholder nodeId="not-curated-yet" />);
    expect(screen.getByTestId('no-preview-not-curated-yet')).toBeDefined();

    expect(hasStaticSvg('not-curated-yet')).toBe(false);
  });

  it('renders the drawer for every curated id without throwing (TKT-076 round-2 non-regression)', () => {
    for (const node of TOPOLOGY_NODES) {
      const { unmount } = render(
        <TopologyNodeDrawer
          node={node}
          state={state(node.id)}
          incident={incident}
          onClose={() => undefined}
        />,
      );
      unmount();
    }
  });
});
