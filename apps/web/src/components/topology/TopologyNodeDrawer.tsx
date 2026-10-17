// Side drawer presenting deep-dive JTBD, tech specifications, and realtime
// blackboard payloads (Issue #205 & #211 / TKT-067).
// Issue #259: status chip row + decluttered How-it-works graph + preview specs
// + single footer CTA — design authority `.stitch/designs/system_topology_workflow.html`
// AC-TOP-27, AC-TOP-28, AC-TOP-29.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DashboardTab,
  IncidentState,
  TopologyNodeDefinition,
  TopologyNodeId,
  TopologyNodeState,
} from '../../types';
import SideDrawer from '../SideDrawer';
import { TOPOLOGY_EDGES, TOPOLOGY_LAYERS, TOPOLOGY_NODES, TOPOLOGY_PHASES } from '../../lib/topology';
import { getDrawerPreviewComponent } from './drawer-previews';
import StaticPreviewSVG from './drawer-previews/StaticPreviewSVG';
import NoPreviewPlaceholder from './drawer-previews/NoPreviewPlaceholder';
import { hasStaticSvg } from './drawer-previews/svgManifest';

interface TopologyNodeDrawerProps {
  node: TopologyNodeDefinition | null;
  state: TopologyNodeState | null;
  incident: IncidentState | null;
  onClose: () => void;
  onNavigateToIncident?: () => void;
  onNavigateToTab?: (tab: DashboardTab) => void;
  onSimulateTrigger?: (nodeId: string) => void;
  /** Issue #259: when the operator clicks a sibling-node reference inside the
   *  How-it-works graph, the drawer swaps to that node. The host view owns the
   *  selected-node state machine and re-renders the drawer with the new node. */
  onSelectNode?: (nodeId: TopologyNodeId) => void;
}

/** Endpoints that the How-it-works graph must never surface as clickable siblings:
 *  gate condition blocks (independent route handlers) and the pub/sub conduit
 *  (a stretch label, not a node). */
const NON_NODE_ENDPOINT_IDS: ReadonlySet<string> = new Set([
  'pubsub-cross-bridge',
  'gate1-yes',
  'gate1-no',
  'gate2-yes',
  'gate2-no',
]);

function resolveNodeIcon(id: string): string {
  const node = TOPOLOGY_NODES.find((n) => n.id === id);
  return node?.icon ?? 'radio_button_unchecked';
}

function shortLabel(id: string): string {
  // Mirror `.short` in design's node data; fall back to first label sentence.
  const node = TOPOLOGY_NODES.find((n) => n.id === id);
  if (!node) return id;
  return node.label.split(/[·:(]/)[0].trim() || node.label;
}

/** Compose a one-liner from the JTBD. Trim at the first literal "." (decimal
 *  points excluded via the obvious split) and re-append a period so the
 *  result reads as a complete single sentence. Designed to satisfy the
 *  contract `text === split('.')[0] + '.'` which the regression test
 *  enforces, including JTBDs whose first sentence contains a decimal
 *  (e.g. "feed rate 0.28 mm/rev"). */
function oneLiner(text: string | undefined): string {
  if (!text) return '';
  const firstChunk = text.split('.')[0] ?? text;
  return firstChunk.endsWith('.') ? firstChunk : `${firstChunk}.`;
}

const SPEC_BADGE_FALLBACK_KEYS = new Set([
  'machine_id',
  'document_path',
  'incident_id',
  'agent_id',
  'tool_id',
  'workpiece_serial',
]);

/** Build the preview-spec badge list rendered under the visual preview.
 *  Limits to at most three short string/number/boolean keys so the row stays compact. */
function specBadges(details: Record<string, unknown> | undefined): { key: string; value: string }[] {
  if (!details) return [];
  const entries: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(details)) {
    if (entries.length >= 3) break;
    const t = typeof raw;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') continue;
    const value = String(raw);
    if (value.length === 0 || value.length > 28) continue;
    if (SPEC_BADGE_FALLBACK_KEYS.has(key) || !key.startsWith('_')) {
      entries.push({ key, value });
    }
  }
  return entries;
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function statusChipClass(status: TopologyNodeState['status']): string {
  switch (status) {
    case 'danger':
    case 'error':
      return 'chip-red';
    case 'warning':
      return 'chip-amber';
    case 'active':
    case 'pending_approval':
    case 'waiting':
      return 'chip-blue';
    case 'done':
    case 'completed':
    case 'nominal':
      return 'chip-green';
    case 'locked':
    case 'idle':
    default:
      return 'chip-slate';
  }
}

export default function TopologyNodeDrawer({
  node,
  state,
  incident,
  onClose,
  onNavigateToIncident,
  onNavigateToTab,
  onSimulateTrigger,
  onSelectNode,
}: TopologyNodeDrawerProps): React.ReactElement | null {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const howFlowRef = useRef<HTMLDivElement>(null);

  // Keep an explicit layer / phase resolution so the eyebrow chip stays in sync
  // with the topology canvas's card status badge.
  const layer = useMemo(
    () => (node ? TOPOLOGY_LAYERS.find((l) => l.id === node.layer || l.id === node.phase) : undefined),
    [node],
  );
  const phase = useMemo(
    () => (node ? TOPOLOGY_PHASES.find((p) => p.id === node.phase) : undefined),
    [node],
  );

  // Issue #259 / AC-TOP-27: derive How-it-works siblings from TOPOLOGY_EDGES.
  // Inputs = edges arriving at this node (excluding non-clickable endpoints).
  // Outputs = edges departing from this node (also excluding non-clickable).
  const howSiblings = useMemo(() => {
    const inputs: { id: string; label: string; icon: string }[] = [];
    const outputs: { id: string; label: string; icon: string }[] = [];
    if (!node) return { inputs, outputs };
    const nodeIds = new Set<string>(TOPOLOGY_NODES.map((n) => n.id));

    const collect = (
      edge: { from: string; to: string },
      targets: { id: string; label: string; icon: string }[],
    ) => {
      const other = targets === inputs ? edge.from : edge.to;
      if (!nodeIds.has(other)) return;
      if (NON_NODE_ENDPOINT_IDS.has(other)) return;
      if (other === node.id) return;
      targets.push({ id: other, label: shortLabel(other), icon: resolveNodeIcon(other) });
    };

    for (const edge of TOPOLOGY_EDGES) {
      if (edge.to === node.id) collect(edge, inputs);
      if (edge.from === node.id) collect(edge, outputs);
    }

    const dedupe = (items: { id: string; label: string; icon: string }[]) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };

    return { inputs: dedupe(inputs), outputs: dedupe(outputs) };
  }, [node]);

  // Reset focus to the first focusable flow-node when the drawer swaps to a
  // new node, so keyboard arrow nav has a usable anchor immediately.
  useEffect(() => {
    const root = howFlowRef.current;
    if (!root) return;
    const firstFlow = root.querySelector<HTMLElement>('.how-node[data-flow-sibling]');
    firstFlow?.focus({ preventScroll: true });
  }, [node?.id]);

  const handleFlowKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    const root = howFlowRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('.how-node[data-flow-sibling]'),
    );
    if (focusables.length === 0) return;
    const currentIndex = focusables.findIndex((el) => el === document.activeElement);
    let nextIndex = currentIndex;
    if (currentIndex < 0) {
      // No chip focused yet — start at the first chip for Home/ArrowDown, or
      // the last chip for End/ArrowUp. Treats ArrowDown on a freshly-focused
      // graph as "advance into the list" so the user always moves forward.
      if (event.key === 'End' || event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        nextIndex = focusables.length - 1;
      } else {
        nextIndex = 0;
      }
      event.preventDefault();
      focusables[nextIndex]?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % focusables.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + focusables.length) % focusables.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = focusables.length - 1;
    }
    event.preventDefault();
    focusables[nextIndex]?.focus();
  }, []);

  const handleSiblingClick = useCallback(
    (nodeId: string) => {
      if (!onSelectNode) return;
      onSelectNode(nodeId as TopologyNodeId);
    },
    [onSelectNode],
  );

  if (!node || !state) return null;

  const triggerCta = () => {
    if (node.uiRef?.targetTab && onNavigateToTab) {
      onClose();
      onNavigateToTab(node.uiRef.targetTab);
      return;
    }
    if (onNavigateToIncident) {
      onClose();
      onNavigateToIncident();
      return;
    }
    if (onSimulateTrigger) {
      onSimulateTrigger(node.id);
    }
  };

  const ctaLabel = node.uiRef?.ctaLabel ?? 'Open in Production UI';
  const previewComponent = getDrawerPreviewComponent(node, state, incident);
  const oneLineJtbd = oneLiner(node.jtbd);
  const specs = specBadges(node.payload ?? (state.details as Record<string, unknown> | undefined));

  const eyebrow = (
    <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      {layer ? (
        <span className={`chip ${layer.badgeColor}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          {layer.name.split('·')[0].trim()}
        </span>
      ) : phase ? (
        <span className="chip chip-blue" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Phase {phase.letter} · {phase.name}
        </span>
      ) : null}
      <span
        className="chip"
        style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(15,23,42,0.06)' }}
      >
        {node.tier}
      </span>
      {node.isDecisionGate && (
        <span className="chip chip-purple" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          Decision Gate
        </span>
      )}
    </div>
  );

  const title = (
    <div className="row" style={{ gap: '0.6rem', alignItems: 'center', minWidth: 0, flex: 1 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>
        {node.icon}
      </span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {node.label}
      </span>
    </div>
  );

  const headerActions = (
    <button
      type="button"
      className="drawer-fullscreen-btn"
      onClick={() => setIsFullscreen(!isFullscreen)}
      title={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
      aria-label={isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
        {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
      </span>
    </button>
  );

  return (
    <SideDrawer
      title={title}
      eyebrow={eyebrow}
      headerActions={headerActions}
      isFullscreen={isFullscreen}
      width={580}
      onClose={onClose}
      footer={
        <div className="drawer-cta-row">
          <button type="button" className="btn btn-sm drawer-dismiss" onClick={onClose}>
            Dismiss
          </button>
          <button
            type="button"
            id="drawer-ui-cta"
            className="btn btn-primary drawer-cta"
            onClick={triggerCta}
            aria-label={ctaLabel}
          >
            <span>{ctaLabel}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_forward
            </span>
          </button>
        </div>
      }
    >
      <div className="col" style={{ gap: '1.25rem' }}>
        {/* Status chip row (Issue #259 / AC-TOP-27): mirrors the canvas card
            status badge so the operator doesn't need a separate "Realtime Node
            Execution State" glass banner. */}
        <div id="drawer-status-chips" className="drawer-status-row">
          <span
            id="drawer-status-chip"
            className={`chip chip-sm ${statusChipClass(state.status)}`}
          >
            {state.status.toUpperCase()}
          </span>
          <span className="chip chip-sm chip-neutral">{state.summary || node.sublabel}</span>
          {state.badgeText && (
            <span className="chip chip-sm chip-neutral mono">{state.badgeText}</span>
          )}
        </div>

        {/* How-it-works graph (Issue #259 / AC-TOP-27): three-column flow
            `inputs → this node → outputs`, each input/output is a clickable
            sibling that swaps the drawer. Arrow / Home / End keys cycle focus. */}
        <div className="drawer-section">
          <div className="section-label">How it works</div>
          <div
            id="drawer-how-flow"
            className="how-wrap"
            ref={howFlowRef}
            onKeyDown={handleFlowKeyDown}
          >
            <div className="how-graph-head" aria-hidden="true">
              <span>Inputs</span>
              <span>This node</span>
              <span>Outputs</span>
            </div>
            <div className="how-graph">
              <div className="how-col" data-col="in">
                {howSiblings.inputs.length === 0 ? (
                  <div className="how-slot">
                    <div
                      className="how-node how-node-empty"
                      data-empty-reason="entry"
                      aria-label="Entry point"
                    >
                      <span className="material-symbols-outlined">login</span>
                      <span>Entry point</span>
                    </div>
                  </div>
                ) : (
                  howSiblings.inputs.map((s) => (
                    <div className="how-slot" key={`in-${s.id}`}>
                      <button
                        type="button"
                        tabIndex={0}
                        className="how-node"
                        data-flow-sibling
                        data-node-id={s.id}
                        data-flow-kind="in"
                        onClick={() => handleSiblingClick(s.id)}
                        aria-label={`Input from ${s.label}`}
                      >
                        <span className="material-symbols-outlined">{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="how-link" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  {howSiblings.inputs.length === 0 ? (
                    <path d="M0 50 C50 50 50 50 100 50" />
                  ) : (
                    howSiblings.inputs.map((_s, i) => {
                      const y = ((i + 0.5) / howSiblings.inputs.length) * 100;
                      return <path key={i} d={`M0 ${y} C50 ${y} 50 50 100 50`} />;
                    })
                  )}
                </svg>
              </div>

              <div
                className="how-self"
                role="group"
                aria-label={`This node · ${node.label}`}
              >
                <span className="material-symbols-outlined">{node.icon}</span>
                <span>{shortLabel(node.id)}</span>
                <span className="how-self-tag">You are here</span>
              </div>

              <div className="how-link" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  {howSiblings.outputs.length === 0 ? (
                    <path d="M0 50 C50 50 50 50 100 50" />
                  ) : (
                    howSiblings.outputs.map((_s, i) => {
                      const y = ((i + 0.5) / howSiblings.outputs.length) * 100;
                      return <path key={i} d={`M0 50 C50 50 50 ${y} 100 ${y}`} />;
                    })
                  )}
                </svg>
              </div>

              <div className="how-col" data-col="out">
                {howSiblings.outputs.length === 0 ? (
                  <div className="how-slot">
                    <div
                      className="how-node how-node-empty how-node-out"
                      data-empty-reason="exit"
                      aria-label="End of flow"
                    >
                      <span className="material-symbols-outlined">flag</span>
                      <span>End of flow</span>
                    </div>
                  </div>
                ) : (
                  howSiblings.outputs.map((s) => (
                    <div className="how-slot" key={`out-${s.id}`}>
                      <button
                        type="button"
                        tabIndex={0}
                        className="how-node"
                        data-flow-sibling
                        data-node-id={s.id}
                        data-flow-kind="out"
                        onClick={() => handleSiblingClick(s.id)}
                        aria-label={`Output to ${s.label}`}
                      >
                        <span className="material-symbols-outlined">{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <p id="drawer-jtbd" className="how-oneliner">
            {oneLineJtbd}
          </p>
        </div>

        {/* Preview (Issue #259 / AC-TOP-28): visual preview per node type with
            a tiny spec badge row underneath. Resolution hierarchy:
            custom React → static SVG → placeholder (defensive). */}
        <div className="drawer-section">
          <div className="section-label">Preview</div>
          <div id="drawer-ui-preview" className="ui-ref-preview-box">
            {previewComponent ?? (hasStaticSvg(node.id) ? <StaticPreviewSVG nodeId={node.id} /> : <NoPreviewPlaceholder nodeId={node.id} />)}
          </div>
          {specs.length > 0 && (
            <div id="drawer-preview-specs" className="preview-specs">
              {specs.map(({ key, value }) => (
                <span className="spec-badge" key={key}>
                  {humanizeKey(key)} <b>{value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </SideDrawer>
  );
}
