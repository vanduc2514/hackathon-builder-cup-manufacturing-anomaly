// How-it-works graph + arrow-key sibling nav + single footer CTA
// (TKT-067 / Issue #259 — AC-TOP-27 / AC-TOP-28 / AC-TOP-29).
//
// The drawer markup now mirrors the design authority
// `.stitch/designs/system_topology_workflow.html`:
//   * `.how-wrap#drawer-how-flow` hosts the three-column graph
//     (`inputs → self → outputs`).
//   * `<button data-flow-sibling>` chips are the only focusable elements
//     inside the graph (arrow keys cycle them, click swaps the drawer).
//   * `<button id="drawer-ui-cta">` is the **single** primary CTA in the
//     footer (arrow_forward icon + node.uiRef.ctaLabel fallback).
//
// These tests pin the *structure*; behavioural rules for status chip row,
// oneliner JTBD, preview+spec badges, removed sections etc. live in the
// sibling test file `TopologyNodeDrawer.test.tsx`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TOPOLOGY_NODES } from '../../../lib/topology';
import TopologyNodeDrawer from '../TopologyNodeDrawer';
import type { IncidentState, TopologyNodeState } from '../../../types';

function makeNodeState(
  id: string,
  partial: Pick<TopologyNodeState, 'summary' | 'status'> & Partial<TopologyNodeState>,
): TopologyNodeState {
  return {
    id,
    isInferred: false,
    details: {},
    ...partial,
  } as TopologyNodeState;
}

const baseIncident: IncidentState = {
  incident_id: 'inc-how-01',
  status: 'investigating',
  status_reason: 'Tool wear anomaly',
  defect_type: 'tool_wear',
  defect_rate: 0.07,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Chipped insert',
  verification_count: 24,
  verification_target: 50,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TopologyNodeDrawer How-it-works graph (TKT-067 / AC-TOP-27)', () => {
  it('renders the .how-wrap container with the JTBD one-liner below the graph', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'agent-pa')!;
    const state = makeNodeState('agent-pa', {
      summary: 'Process Analyst',
      status: 'active',
    });

    render(
      <TopologyNodeDrawer
        node={node}
        state={state}
        incident={baseIncident}
        onClose={vi.fn()}
      />,
    );

    // JTBD anchor + how-wrap container.
    expect(document.getElementById('drawer-jtbd')).not.toBeNull();
    const howFlow = document.getElementById('drawer-how-flow');
    expect(howFlow).not.toBeNull();
    expect(howFlow?.classList.contains('how-wrap')).toBe(true);

    // Two .how-col columns (in/out) and one .how-self node.
    expect(howFlow?.querySelectorAll('.how-col').length).toBe(2);
    expect(howFlow?.querySelectorAll('.how-self').length).toBe(1);
    expect(howFlow?.querySelector('.how-graph-head')).not.toBeNull();
  });

  it('exposes the single footer CTA replacing the legacy raw-JSON dump + Copy button', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'output-docs')!;
    const state = makeNodeState('output-docs', {
      summary: '8D Report Composer',
      status: 'done',
    });

    render(
      <TopologyNodeDrawer
        node={node}
        state={state}
        incident={baseIncident}
        onClose={vi.fn()}
      />,
    );

    // Single drawer CTA (no legacy "Runtime" / "Simulate" affordance anywhere).
    const ctas = document.querySelectorAll('button.drawer-cta, #drawer-ui-cta');
    expect(ctas.length).toBe(1);
    const cta = document.getElementById('drawer-ui-cta');
    expect(cta?.tagName).toBe('BUTTON');
    expect(cta?.classList.contains('btn-primary')).toBe(true);

    // Legacy copy-JSON affordances MUST be gone.
    expect(document.querySelector('pre.mono')).toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(/Copy JSON/);
    expect(document.body.textContent ?? '').not.toMatch(/Simulate Trigger/);
  });

  it('arrow keys cycle focus across sibling flow-node chips (Inputs / Outputs together)', () => {
    // Use agent-qa: 1 input (adk-orch) + 1 output (agent-tra) ⇒ 2 focusables,
    // so two ArrowDowns cleanly wrap back to the first chip without depending
    // on a specific node's edge fan-out.
    const node = TOPOLOGY_NODES.find((n) => n.id === 'agent-qa')!;
    const state = makeNodeState('agent-qa', {
      summary: 'Quality Inspector',
      status: 'active',
    });

    render(
      <TopologyNodeDrawer
        node={node}
        state={state}
        incident={baseIncident}
        onClose={vi.fn()}
      />,
    );

    const howFlow = document.getElementById('drawer-how-flow');
    expect(howFlow).not.toBeNull();

    const focusables = Array.from(
      howFlow?.querySelectorAll<HTMLElement>('.how-node[data-flow-sibling]') ?? [],
    );
    // Inputs and Outputs both carry chips; the self node is not focusable.
    expect(focusables.length).toBeGreaterThanOrEqual(2);

    focusables[0].focus();
    expect(document.activeElement).toBe(focusables[0]);

    // Advance one step forward.
    fireEvent.keyDown(howFlow!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(focusables[1]);

    // Wrap around: keep pressing ArrowDown len-1 more times to cycle back to [0].
    for (let i = 0; i < focusables.length - 1; i++) {
      fireEvent.keyDown(howFlow!, { key: 'ArrowDown' });
    }
    expect(document.activeElement).toBe(focusables[0]);

    // ArrowUp wraps to last index.
    fireEvent.keyDown(howFlow!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

    fireEvent.keyDown(howFlow!, { key: 'Home' });
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(howFlow!, { key: 'End' });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('clicking a sibling-node chip swaps the drawer to that node via onSelectNode', () => {
    // orchestrator has both upstream and downstream nodes routed to it so the
    // graph renders chips on both sides.
    const orchestrator = TOPOLOGY_NODES.find((n) => n.id === 'adk-orch')!;
    const orchestratorState = makeNodeState('adk-orch', {
      summary: 'ADK Orchestrator',
      status: 'active',
    });

    const onSelect = vi.fn();
    render(
      <TopologyNodeDrawer
        node={orchestrator}
        state={orchestratorState}
        incident={baseIncident}
        onClose={vi.fn()}
        onSelectNode={onSelect}
      />,
    );

    const howFlow = document.getElementById('drawer-how-flow');
    const firstChip = howFlow?.querySelector<HTMLButtonElement>('button[data-flow-sibling]');
    expect(firstChip).not.toBeNull();

    fireEvent.click(firstChip!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(typeof onSelect.mock.calls[0]?.[0]).toBe('string');
    expect(onSelect.mock.calls[0]?.[0]).not.toBe('adk-orch');
  });
});
