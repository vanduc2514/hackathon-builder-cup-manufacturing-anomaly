import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TopologyNode from '../TopologyNode';
import { TOPOLOGY_NODES, deriveNodeStates } from '../../../lib/topology';
import type { TopologyNodeDefinition, TopologyNodeState } from '../../../types';

afterEach(() => {
  cleanup();
});

describe('TopologyNode Header & Badge Layout (Issue #239 / TKT-054)', () => {
  const sampleNode: TopologyNodeDefinition = {
    id: 'floor-sensors',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 3,
    label: 'Sensors (Vib/Temp)',
    sublabel: 'Spindle Tri-axial',
    tier: 'Tier 1',
    tierDescription: 'High-frequency vibration telemetry',
    icon: 'sensors',
    techStack: ['IFM VVB001', 'PT100'],
    sla: '100 Hz',
    channel: 'blackboard.telemetry.sensors_raw',
    jtbd: 'Monitors spindle vibration RMS and bearing temperature.',
  };

  const sampleState: TopologyNodeState = {
    id: 'floor-sensors',
    status: 'nominal',
    summary: 'Spindle vibration RMS 1.48 mm/s nominal',
    badgeText: 'Nominal',
    isInferred: false,
    details: {},
  };

  it('renders node title and sublabel wrapped in node-title-group with hover tooltips', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <TopologyNode
        node={sampleNode}
        state={sampleState}
        selected={false}
        onSelect={handleSelect}
      />,
    );

    const titleGroup = container.querySelector('.node-title-group');
    expect(titleGroup).not.toBeNull();

    const nameEl = container.querySelector('.node-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl?.textContent).toBe('Sensors (Vib/Temp)');
    expect(nameEl?.getAttribute('title')).toBe('Sensors (Vib/Temp)');

    const sublabelEl = container.querySelector('.node-sublabel');
    expect(sublabelEl).not.toBeNull();
    expect(sublabelEl?.textContent).toBe('Spindle Tri-axial');
    expect(sublabelEl?.getAttribute('title')).toBe('Spindle Tri-axial');
  });

  it('renders status badge with status-badge class, tooltip, and status-badge-text span', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <TopologyNode
        node={sampleNode}
        state={sampleState}
        selected={false}
        onSelect={handleSelect}
      />,
    );

    const badge = container.querySelector('.status-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('title')).toBe('Status: Nominal');

    const badgeText = badge?.querySelector('.status-badge-text');
    expect(badgeText).not.toBeNull();
    expect(badgeText?.textContent).toBe('Nominal');
  });

  it('handles custom badgeText and dynamic states without collision', () => {
    const customState: TopologyNodeState = {
      id: 'floor-sensors',
      status: 'danger',
      summary: 'Vibration excursion detected',
      badgeText: 'Breach / Alarm',
      isInferred: false,
      details: {},
    };

    const { container } = render(
      <TopologyNode
        node={sampleNode}
        state={customState}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    const badge = container.querySelector('.status-badge');
    expect(badge).not.toBeNull();
    expect(badge?.classList.contains('chip-danger')).toBe(true);
    expect(badge?.getAttribute('title')).toBe('Status: Breach / Alarm');

    const dot = badge?.querySelector('.dot');
    expect(dot).not.toBeNull();
    expect(dot?.classList.contains('animate-pulse-glow')).toBe(true);
  });

  it('renders all 5 Layer 1 nodes with responsive tooltips and uncollided badges', () => {
    const layer1NodeIds = [
      'floor-machines',
      'floor-cameras',
      'floor-sensors',
      'floor-mics',
      'floor-tags',
    ];

    const defaultStates = deriveNodeStates(null);

    layer1NodeIds.forEach((id) => {
      const nodeDef = TOPOLOGY_NODES.find((n) => n.id === id);
      expect(nodeDef).toBeDefined();
      if (!nodeDef) return;

      const state = defaultStates[id as keyof typeof defaultStates];
      const { container } = render(
        <TopologyNode
          node={nodeDef}
          state={state}
          selected={false}
          onSelect={vi.fn()}
        />,
      );

      const header = container.querySelector('.node-header');
      const iconTitle = header?.querySelector('.node-icon-title');
      const titleGroup = iconTitle?.querySelector('.node-title-group');
      const nameEl = titleGroup?.querySelector('.node-name');
      const sublabelEl = titleGroup?.querySelector('.node-sublabel');
      const badge = header?.querySelector('.status-badge');

      expect(header).not.toBeNull();
      expect(iconTitle).not.toBeNull();
      expect(titleGroup).not.toBeNull();
      expect(nameEl?.getAttribute('title')).toBe(nodeDef.label);
      expect(sublabelEl?.getAttribute('title')).toBe(nodeDef.sublabel);
      expect(badge).not.toBeNull();
    });
  });

  it('renders all 28 architecture nodes without structural errors', () => {
    const defaultStates = deriveNodeStates(null);
    expect(TOPOLOGY_NODES.length).toBeGreaterThanOrEqual(28);

    TOPOLOGY_NODES.forEach((nodeDef) => {
      const state = defaultStates[nodeDef.id as keyof typeof defaultStates] || {
        id: nodeDef.id,
        status: 'nominal',
        summary: nodeDef.jtbd,
        badgeText: 'Nominal',
        isInferred: false,
        details: {},
      };

      const { container } = render(
        <TopologyNode
          node={nodeDef}
          state={state}
          selected={false}
          onSelect={vi.fn()}
        />,
      );

      if (nodeDef.isDecisionGate) {
        expect(container.querySelector('.decision-diamond-card')).not.toBeNull();
      } else {
        expect(container.querySelector('.topology-node-card')).not.toBeNull();
        expect(container.querySelector('.node-name')?.getAttribute('title')).toBe(nodeDef.label);
      }
    });
  });

  it('supports click and keyboard navigation selection', () => {
    const handleSelect = vi.fn();
    render(
      <TopologyNode
        node={sampleNode}
        state={sampleState}
        selected={false}
        onSelect={handleSelect}
      />,
    );

    const button = screen.getByRole('button', { name: /Sensors \(Vib\/Temp\)/i });

    fireEvent.click(button);
    expect(handleSelect).toHaveBeenCalledWith('floor-sensors');

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(button, { key: ' ' });
    expect(handleSelect).toHaveBeenCalledTimes(3);
  });
});
