// Manifest of every topology node id that ships a static SVG schematic
// in `apps/web/public/previews/topology/` (TKT-076 / Issue #277 —
// AC-TOP-28a). The 30 files are copied verbatim from
// `.stitch/previews/topology/` at build time.
//
// Keeping the manifest as an explicit `Set` (rather than computing from
// `TOPOLOGY_NODES`) lets us narrow to a curated subset and gives tests a
// stable surface to assert against without coupling to `topology.ts`.
export const PREVIEW_SVG_NODE_IDS: ReadonlySet<string> = new Set<string>([
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
]);

export function hasStaticSvg(nodeId: string): boolean {
  return PREVIEW_SVG_NODE_IDS.has(nodeId);
}