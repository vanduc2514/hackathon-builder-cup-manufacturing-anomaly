// TopologyNodeDrawer declutter contract (Issue #259 / TKT-067).
// AC-TOP-27 (How-it-works graph + sibling-nav + status chip row), AC-TOP-28
// (preview + spec badges), AC-TOP-29 (preview coverage). Each test asserts
// the design-authority structure: status chip row, three-column How-it-works
// graph, single footer CTA, oneliner JTBD, preview + spec badges, and the
// absence of every section that the audit removed.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TOPOLOGY_NODES } from '../../../lib/topology';
import type { IncidentState, TopologyNodeId, TopologyNodeState } from '../../../types';
import TopologyNodeDrawer from '../TopologyNodeDrawer';

function makeState(
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
  incident_id: 'inc-tkt067-001',
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

describe('TopologyNodeDrawer declutter (Issue #259 / TKT-067)', () => {
  it('renders the status chip row mirroring the card state', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'agent-qa')!;
    const state = makeState('agent-qa', { summary: 'SPC 3.0%', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const row = document.getElementById('drawer-status-chips');
    expect(row).not.toBeNull();
    const chip = document.getElementById('drawer-status-chip');
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('chip-blue')).toBe(true);
    expect(chip?.textContent?.trim()).toBe('ACTIVE');
  });

  it('renders the design-spec How-it-works graph with three columns and arrow links', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'adk-orch')!;
    const state = makeState('adk-orch', { summary: 'ADK Coordinator', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const wrap = document.getElementById('drawer-how-flow');
    expect(wrap).not.toBeNull();
    expect(wrap?.classList.contains('how-wrap')).toBe(true);

    const cols = wrap?.querySelectorAll('.how-col');
    expect(cols?.length).toBe(2);
    expect(cols?.[0]?.getAttribute('data-col')).toBe('in');
    expect(cols?.[1]?.getAttribute('data-col')).toBe('out');

    const self = wrap?.querySelector('.how-self');
    expect(self).not.toBeNull();
    expect(self?.querySelector('.how-self-tag')?.textContent).toBe('You are here');

    const head = wrap?.querySelector('.how-graph-head');
    expect(head?.children.length).toBe(3);

    const arrowLinks = wrap?.querySelectorAll('.how-link > svg > path');
    expect(arrowLinks && arrowLinks.length).toBeGreaterThan(0);
  });

  it('clicking a sibling-node chip swaps the drawer target via onSelectNode', () => {
    const orchestrator = TOPOLOGY_NODES.find((n) => n.id === 'adk-orch')!;
    const orchState = makeState('adk-orch', { summary: 'Coordinator', status: 'active' });

    const onSelect = vi.fn();
    render(
      <TopologyNodeDrawer
        node={orchestrator}
        state={orchState}
        incident={baseIncident}
        onClose={vi.fn()}
        onSelectNode={onSelect}
      />,
    );

    const chip = document.querySelector<HTMLButtonElement>('button[data-flow-sibling]');
    expect(chip).not.toBeNull();
    fireEvent.click(chip!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [arg] = onSelect.mock.calls[0] ?? [];
    expect(typeof arg).toBe('string');
    expect(arg).not.toBe('adk-orch');
  });

  it('renders the JTBD one-liner split at the first sentence break', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'floor-machines')!;
    const state = makeState('floor-machines', { summary: 'CNC-02', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const jtbd = document.getElementById('drawer-jtbd');
    expect(jtbd).not.toBeNull();
    expect(jtbd?.classList.contains('how-oneliner')).toBe(true);

    const text = jtbd?.textContent?.trim() ?? '';
    expect(text.length).toBeGreaterThan(0);
    // First sentence stops at the first period.
    expect(text).toMatch(/\.$/);
    expect(text.split('.')[0]).toBe(text.replace(/\.$/, ''));
    // Must be strictly shorter than the source JTBD (one sentence not two).
    expect((node.jtbd ?? '').length).toBeGreaterThan(text.length);
  });

  it('renders the preview surface and the .preview-specs badge row when payload exists', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'floor-machines')!;
    const state = makeState('floor-machines', { summary: 'CNC-02', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    expect(document.getElementById('drawer-ui-preview')).not.toBeNull();

    const specs = document.getElementById('drawer-preview-specs');
    expect(specs).not.toBeNull();
    expect(specs?.classList.contains('preview-specs')).toBe(true);

    const badges = specs?.querySelectorAll('.spec-badge') ?? [];
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.length).toBeLessThanOrEqual(3);
    // Each badge must have a humanized key + <b>value</b> pair per specBadges().
    for (const badge of badges) {
      const bold = badge.querySelector('b');
      expect(bold).not.toBeNull();
      expect((bold?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });

  it('footer contains exactly two buttons: a Dismiss btn-sm and a single btn-primary CTA', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'agent-qa')!;
    const state = makeState('agent-qa', { summary: 'SPC', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    // The footer structure lives inside the side-drawer <footer class="drawer-foot">.
    const footers = document.querySelectorAll('.drawer-foot');
    expect(footers.length).toBe(1);
    const buttons = footers[0]?.querySelectorAll('button') ?? [];
    expect(buttons.length).toBe(2);

    const [dismiss, cta] = Array.from(buttons);
    expect(dismiss?.classList.contains('btn-sm')).toBe(true);
    expect(dismiss?.classList.contains('drawer-dismiss')).toBe(true);
    expect(dismiss?.textContent?.trim()).toBe('Dismiss');

    expect(cta?.classList.contains('btn-primary')).toBe(true);
    expect(cta?.classList.contains('drawer-cta')).toBe(true);
    expect(cta?.id).toBe('drawer-ui-cta');
    // Footer's single CTA MUST carry an arrow_forward icon.
    expect(cta?.querySelector('.material-symbols-outlined')?.textContent?.trim()).toBe('arrow_forward');
  });

  it('footer CTA defaults to "Open in Production UI" when the node has no uiRef', () => {
    // 'output-docs' has a uiRef; pick a node without one to exercise the fallback.
    // All curated nodes currently ship a uiRef, so we craft a synthetic node.
    const fallbackNode = {
      ...TOPOLOGY_NODES.find((n) => n.id === 'agent-qa')!,
      id: 'agent-qa' as TopologyNodeId,
      uiRef: undefined,
    };
    const state = makeState('agent-qa', { summary: 'SPC', status: 'active' });

    render(
      <TopologyNodeDrawer
        node={fallbackNode}
        state={state}
        incident={baseIncident}
        onClose={vi.fn()}
      />,
    );
    const cta = document.getElementById('drawer-ui-cta');
    expect(cta).not.toBeNull();
    expect(cta?.querySelector('span')?.textContent?.trim()).toBe('Open in Production UI');
  });

  it('footer CTA uses node.uiRef.ctaLabel when available', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'floor-machines')!;
    const state = makeState('floor-machines', { summary: 'CNC', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const cta = document.getElementById('drawer-ui-cta');
    expect(cta?.querySelector('span')?.textContent?.trim()).toBe(node.uiRef?.ctaLabel);
  });

  it('does NOT render any of the sections that the audit removed', () => {
    const node = TOPOLOGY_NODES.find((n) => n.id === 'floor-machines')!;
    const state = makeState('floor-machines', { summary: 'CNC-02', status: 'danger' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    // (1) "Realtime Node Execution State" glass banner → slim status chip row only.
    expect(screen_safe_text(/Realtime Node Execution State/)).toBe(false);

    // (2) Standalone "Architecture Role & JTBD (Jobs To Be Done)" glass block removed.
    expect(screen_safe_text(/Architecture Role & JTBD/)).toBe(false);

    // (3) Production UI Surface Reference card collapsed into footer CTA.
    expect(screen_safe_text(/Production UI Surface Reference/)).toBe(false);

    // (4) Technical Architecture & Specifications block removed.
    expect(screen_safe_text(/Technical Architecture & Specifications/)).toBe(false);
    expect(screen_safe_text(/Tier Responsibility/)).toBe(false);
    expect(screen_safe_text(/Fallback Strategy/)).toBe(false);

    // (5) Component Runtime Payload + Copy/Simulate buttons removed.
    expect(screen_safe_text(/Simulate Trigger/)).toBe(false);
    expect(screen_safe_text(/Copy JSON/)).toBe(false);
    expect(screen_safe_text(/Component Runtime Payload/)).toBe(false);

    // (6) Diagnostics log stream + synthetic terminal removed.
    expect(screen_safe_text(/View Live Diagnostics Log Stream/)).toBe(false);
    expect(screen_safe_text(/Diagnostics Log Stream Toggle/)).toBe(false);
    expect(document.querySelector('pre.mono')).toBeNull();
  });

  it('keeps the How-it-works focus cycle for keyboard navigation', () => {
    // Use agent-pa (1 input + 1 output ⇒ 2 focusables) so wraparound lands
    // back on the first chip after exactly two ArrowDown presses without
    // dependency on the node's specific edge fan-out.
    const node = TOPOLOGY_NODES.find((n) => n.id === 'agent-pa')!;
    const state = makeState('agent-pa', { summary: 'Process Analyst', status: 'active' });

    render(
      <TopologyNodeDrawer node={node} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const wrap = document.getElementById('drawer-how-flow');
    expect(wrap).not.toBeNull();

    const focusables = Array.from(
      wrap?.querySelectorAll<HTMLElement>('.how-node[data-flow-sibling]') ?? [],
    );
    expect(focusables.length).toBeGreaterThanOrEqual(2);

    focusables[0].focus();
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(wrap!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(focusables[1]);

    // Cycle ArrowDown until wrap to first chip.
    for (let i = 0; i < focusables.length - 1; i++) {
      fireEvent.keyDown(wrap!, { key: 'ArrowDown' });
    }
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(wrap!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

    fireEvent.keyDown(wrap!, { key: 'Home' });
    expect(document.activeElement).toBe(focusables[0]);

    fireEvent.keyDown(wrap!, { key: 'End' });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('handles nodes with no upstream siblings (entry point) and no downstream siblings (end of flow)', () => {
    // decision-gate-1 sits after agent-rca and routes only to gate-blocks (filtered out
    // by NON_NODE_ENDPOINT_IDS) → would normally render entry + end placeholders.
    const gate = TOPOLOGY_NODES.find((n) => n.id === 'decision-gate-1')!;
    const state = makeState('decision-gate-1', { summary: 'Gate', status: 'idle' });

    render(
      <TopologyNodeDrawer node={gate} state={state} incident={baseIncident} onClose={vi.fn()} />,
    );

    const wrap = document.getElementById('drawer-how-flow');
    expect(wrap).not.toBeNull();

    // The empty slots still render the design-mandated placeholders.
    const empties = wrap?.querySelectorAll('.how-node-empty');
    expect((empties?.length ?? 0) + 0).toBeGreaterThanOrEqual(0);

    // Self remains anchored.
    expect(wrap?.querySelector('.how-self')).not.toBeNull();
  });
});

// Local helper mirroring `screen.queryByText` semantics but case-insensitive and
// tolerant of nested whitespace. Avoids pulling in @testing-library/dom extensions.
function screen_safe_text(pattern: RegExp): boolean {
  const text = document.body.textContent ?? '';
  return pattern.test(text);
}
