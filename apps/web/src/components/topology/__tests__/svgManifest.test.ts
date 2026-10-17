// Tests for the SVG preview manifest and the static preview components
// (TKT-076 / Issue #277 — AC-TOP-28a/28b/28c, extended in TKT-067 / Issue #259
// — AC-TOP-29 to assert the manifest covers every curated topology node id).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TOPOLOGY_NODES } from '../../../lib/topology';
import { PREVIEW_SVG_NODE_IDS, hasStaticSvg } from '../drawer-previews/svgManifest';
import StaticPreviewSVG from '../drawer-previews/StaticPreviewSVG';
import NoPreviewPlaceholder from '../drawer-previews/NoPreviewPlaceholder';

describe('PREVIEW_SVG_NODE_IDS (TKT-076 / AC-TOP-28a)', () => {
  it('contains exactly 30 topology node ids', () => {
    expect(PREVIEW_SVG_NODE_IDS.size).toBe(30);
  });

  it('covers every curated TOPOLOGY_NODES id (TKT-067 / AC-TOP-29)', () => {
    const curated = new Set<string>(TOPOLOGY_NODES.map((n) => n.id));
    expect(curated.size).toBe(30);
    for (const id of curated) {
      expect(hasStaticSvg(id)).toBe(true);
    }
  });

  it('includes output-docs (the file Designer just shipped)', () => {
    expect(PREVIEW_SVG_NODE_IDS.has('output-docs')).toBe(true);
  });

  it('includes every Designer-required node', () => {
    const required = [
      'adk-orch',
      'agent-learn',
      'agent-pa',
      'agent-qa',
      'agent-rca',
      'agent-scribe',
      'agent-tra',
      'copilot-live',
      'decision-gate-1',
      'decision-gate-2',
      'diagnostic-agent',
      'edge-bridge',
      'edge-gemma',
      'floor-cameras',
      'floor-machines',
      'floor-mics',
      'floor-sensors',
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
      'streak-reset',
      'technician-photo',
      'verify-camera',
    ];
    for (const id of required) {
      expect(PREVIEW_SVG_NODE_IDS.has(id)).toBe(true);
    }
  });

  it('hasStaticSvg returns true for ids in the manifest', () => {
    expect(hasStaticSvg('output-docs')).toBe(true);
    expect(hasStaticSvg('adk-orch')).toBe(true);
  });

  it('hasStaticSvg returns false for unknown ids', () => {
    expect(hasStaticSvg('not-a-real-node')).toBe(false);
    expect(hasStaticSvg('')).toBe(false);
  });
});

describe('StaticPreviewSVG (TKT-076 / AC-TOP-28b)', () => {
  it('renders an img pointing at /previews/topology/{nodeId}.svg', () => {
    render(React.createElement(StaticPreviewSVG, { nodeId: 'output-docs' }));
    const img = screen.getByRole('img', { name: /output-docs/i });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('/previews/topology/output-docs.svg');
  });

  it('uses loading="lazy" to avoid blocking first paint', () => {
    render(React.createElement(StaticPreviewSVG, { nodeId: 'adk-orch' }));
    const img = screen.getByRole('img', { name: /adk-orch/i });
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('honors a custom alt override', () => {
    render(React.createElement(StaticPreviewSVG, { nodeId: 'agent-qa', alt: 'Quality inspector preview' }));
    expect(screen.getByRole('img', { name: 'Quality inspector preview' })).toBeDefined();
  });
});

describe('NoPreviewPlaceholder (TKT-076 / AC-TOP-28c)', () => {
  it('renders the node id in the placeholder copy', () => {
    render(React.createElement(NoPreviewPlaceholder, { nodeId: 'not-yet-shipped' }));
    expect(screen.getByTestId('no-preview-not-yet-shipped')).toBeDefined();
    expect(screen.getByText('not-yet-shipped')).toBeDefined();
  });
});