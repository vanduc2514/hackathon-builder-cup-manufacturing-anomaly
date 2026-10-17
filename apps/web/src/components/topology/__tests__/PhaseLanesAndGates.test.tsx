import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import GateConditionBlock from '../GateConditionBlock';
import PhaseLaneOverlay from '../PhaseLaneOverlay';
import { TOPOLOGY_GATE_BLOCKS, derivePhaseLaneStatuses } from '../../../lib/topology';
import type { PhaseLaneId, PhaseStepperStatus } from '../../../lib/topology';

afterEach(() => {
  cleanup();
});

describe('GateConditionBlock (AC-TOP-26, #256)', () => {
  const gate1Yes = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate1-yes')!;
  const gate1No = TOPOLOGY_GATE_BLOCKS.find((b) => b.id === 'gate1-no')!;

  it('renders the YES branch with its block id, tone class and status class', () => {
    const { container } = render(<GateConditionBlock block={gate1Yes} status="idle" />);

    const el = container.querySelector('#gate1-yes');
    expect(el).not.toBeNull();
    expect(el?.classList.contains('tone-yes')).toBe(true);
    expect(el?.classList.contains('status-idle')).toBe(true);
    expect(el?.getAttribute('aria-label')).toBe(`YES branch: ${gate1Yes.label}`);
    expect(el?.textContent).toContain(gate1Yes.label);
  });

  it('renders the NO branch with a cancel icon and the active status class', () => {
    const { container } = render(<GateConditionBlock block={gate1No} status="active" />);

    const el = container.querySelector('#gate1-no');
    expect(el).not.toBeNull();
    expect(el?.classList.contains('tone-warning')).toBe(true);
    expect(el?.classList.contains('status-active')).toBe(true);
    expect(el?.getAttribute('aria-label')).toBe(`NO branch: ${gate1No.label}`);

    const icon = el?.querySelector('.gate-condition-icon');
    expect(icon?.textContent).toBe('cancel');
  });

  it('exposes data-gate-block and data-tone attributes for edge-routing lookups', () => {
    const { container } = render(<GateConditionBlock block={gate1Yes} status="taken" />);
    const el = container.querySelector('[data-gate-block="gate1-yes"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-tone')).toBe('yes');
    expect(el?.getAttribute('data-status')).toBe('taken');
  });
});

describe('PhaseLaneOverlay (AC-TOP-23, #256)', () => {
  const allIdleStatuses: Record<PhaseLaneId, PhaseStepperStatus> = {
    a: 'idle',
    b: 'idle',
    c: 'idle',
    'd-learn': 'idle',
    d: 'idle',
  };

  it('renders nothing when no member nodes are present in the DOM (jsdom has no layout)', () => {
    const container = document.createElement('div');
    const containerRef = { current: container };

    const { container: renderContainer } = render(
      <PhaseLaneOverlay containerRef={containerRef} laneStatuses={allIdleStatuses} scale={1} />,
    );

    expect(renderContainer.querySelector('[data-testid="phase-lane-overlay"]')).toBeNull();
  });

  it('renders a dashed lane box and status chip once a lane member node is measurable', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const node = document.createElement('div');
    node.setAttribute('data-node', 'agent-qa');
    container.appendChild(node);
    node.getBoundingClientRect = () =>
      ({ left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }) as DOMRect;
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 }) as DOMRect;

    const containerRef = { current: container };
    const statuses: Record<PhaseLaneId, PhaseStepperStatus> = {
      ...allIdleStatuses,
      a: 'danger',
    };

    const { container: renderContainer } = render(
      <PhaseLaneOverlay containerRef={containerRef} laneStatuses={statuses} scale={1} />,
    );

    const box = renderContainer.querySelector('[data-phase-lane="a"]');
    expect(box).not.toBeNull();
    expect(box?.classList.contains('phase-lane-danger')).toBe(true);

    const chip = box?.querySelector('.phase-lane-chip');
    expect(chip?.textContent).toContain('Phase A · Detection');
    expect(chip?.textContent).toContain('Danger');

    document.body.removeChild(container);
  });

  it('agrees with derivePhaseLaneStatuses for the status passed into each lane box', () => {
    const lanes = derivePhaseLaneStatuses(null, 'low_confidence');
    expect(lanes.b).toBe('warning');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const node = document.createElement('div');
    node.setAttribute('data-node', 'agent-tra');
    container.appendChild(node);
    node.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 50, bottom: 50, width: 50, height: 50 }) as DOMRect;
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 }) as DOMRect;

    const containerRef = { current: container };
    const { container: renderContainer } = render(
      <PhaseLaneOverlay containerRef={containerRef} laneStatuses={lanes} scale={1} />,
    );

    const box = renderContainer.querySelector('[data-phase-lane="b"]');
    expect(box?.getAttribute('data-status')).toBe('warning');

    document.body.removeChild(container);
  });
});
