// Static topology of the Kaizen system: 17 nodes, their links and the deployed app each opens.
import type { AppTarget, ScenarioStep, TopologyEdge, TopologyNode, Zone } from '../types/topology';

export const APP_LINKS: Record<AppTarget, { url: string; title: string }> = {
  web: { url: 'https://kaizen-lab-web.web.app', title: 'Plant Ops Dashboard' },
  mobile: { url: 'https://kaizen-lab-mobile.web.app', title: 'Technician App' },
  factory: { url: 'https://kaizen-lab-factory.web.app', title: 'Factory Floor Console' },
};

export const NODES: TopologyNode[] = [
  {
    id: 'factory-floor',
    label: 'Factory Floor',
    sublabel: 'CNC · Cameras · Sensors',
    shape: 'machine',
    zone: 'onprem',
    position: [-16, 0],
    target: 'factory',
    icon: 'precision_manufacturing',
  },
  {
    id: 'edge-gateway',
    label: 'Edge Gateway',
    sublabel: 'Gemma 3 + MQTT Bridge',
    shape: 'gateway',
    zone: 'onprem',
    position: [-19, -7],
    target: 'factory',
    icon: 'memory',
  },
  {
    id: 'pubsub',
    label: 'Cloud Pub/Sub',
    sublabel: 'Real-Time Ingestion Bus',
    shape: 'router',
    zone: 'cloud',
    position: [-11, -8],
    target: 'web',
    icon: 'alt_route',
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    sublabel: 'Traceability & Telemetry',
    shape: 'database',
    zone: 'cloud',
    position: [6, -15],
    target: 'web',
    icon: 'database',
  },
  {
    id: 'firestore',
    label: 'Firestore',
    sublabel: 'Incident Blackboard',
    shape: 'database',
    zone: 'cloud',
    position: [-5, -18],
    target: 'web',
    icon: 'view_kanban',
  },
  {
    id: 'rag',
    label: 'Vertex AI Search',
    sublabel: '8D Archives & Manuals',
    shape: 'database',
    zone: 'cloud',
    position: [19, -17],
    target: 'web',
    icon: 'menu_book',
  },
  {
    id: 'gemini',
    label: 'Gemini on Vertex AI',
    sublabel: 'LLM · Vision · Live API',
    shape: 'cloud',
    zone: 'cloud',
    position: [22, -14],
    target: 'web',
    icon: 'smart_toy',
  },
  {
    id: 'orchestrator',
    label: 'ADK Orchestrator',
    sublabel: 'Sole Blackboard Writer',
    shape: 'hub',
    zone: 'team',
    position: [-7, -5],
    target: 'web',
    icon: 'account_tree',
  },
  {
    id: 'qa',
    label: 'Quality Inspector',
    sublabel: 'Detect · Verify',
    shape: 'agent',
    zone: 'team',
    position: [0, -4],
    target: 'web',
    icon: 'fact_check',
  },
  {
    id: 'tra',
    label: 'Traceability',
    sublabel: 'Lot genealogy',
    shape: 'agent',
    zone: 'team',
    position: [6, -4],
    target: 'web',
    icon: 'route',
  },
  {
    id: 'pa',
    label: 'Process Analyst',
    sublabel: 'Sensor analysis',
    shape: 'agent',
    zone: 'team',
    position: [12, -4],
    target: 'web',
    icon: 'monitoring',
  },
  {
    id: 'rca',
    label: 'Root Cause',
    sublabel: 'Cause analysis',
    shape: 'agent',
    zone: 'team',
    position: [18, -4],
    target: 'web',
    icon: 'troubleshoot',
  },
  {
    id: 'doc',
    label: 'Incident Scribe',
    sublabel: '8D documentation',
    shape: 'agent',
    zone: 'team',
    position: [24, -4],
    target: 'web',
    icon: 'edit_note',
  },
  {
    id: 'copilot',
    label: 'Tech Copilot',
    sublabel: 'Live repair guide',
    shape: 'agent',
    zone: 'team',
    position: [18, 2],
    target: 'web',
    icon: 'support_agent',
  },
  {
    id: 'learn',
    label: 'Learning',
    sublabel: 'Knowledge capture',
    shape: 'agent',
    zone: 'team',
    position: [9, -10],
    target: 'web',
    icon: 'school',
  },
  {
    id: 'plant-ops',
    label: 'Plant Ops Dashboard',
    sublabel: 'Incidents · Sign-off',
    shape: 'monitor',
    zone: 'people',
    position: [-4, 6],
    target: 'web',
    icon: 'dashboard',
  },
  {
    id: 'technician-app',
    label: 'Technician App',
    sublabel: 'Live Copilot · Repair',
    shape: 'phone',
    zone: 'people',
    position: [4, 6],
    target: 'mobile',
    icon: 'handyman',
  },
];

export const EDGES: TopologyEdge[] = [
  { from: 'factory-floor', to: 'edge-gateway', label: 'Images · Telemetry', route: 'zx' },
  { from: 'edge-gateway', to: 'pubsub', label: 'Defective images + anomalies' },
  { from: 'pubsub', to: 'bigquery', label: 'Raw telemetry storage', route: 'zx' },
  { from: 'pubsub', to: 'orchestrator', label: 'Defect / SPC event' },
  { from: 'orchestrator', to: 'firestore', label: 'Sole writer', bidir: true, route: 'zx' },
  { from: 'orchestrator', to: 'qa', label: 'Dispatch', route: 'zx' },
  { from: 'qa', to: 'tra', label: 'Defect confirmed' },
  { from: 'tra', to: 'pa', label: 'Suspect lots' },
  { from: 'pa', to: 'rca', label: 'Sensor evidence' },
  { from: 'rca', to: 'copilot', label: 'Fix guidance' },
  { from: 'rca', to: 'doc', label: 'Findings' },
  { from: 'copilot', to: 'qa', label: 'Repair done -> verify' },
  { from: 'qa', to: 'learn', label: 'Verified -> learn', route: 'zx' },
  { from: 'tra', to: 'bigquery', label: 'Lot genealogy' },
  { from: 'rca', to: 'rag', label: 'RAG lookup', route: 'zx' },
  { from: 'copilot', to: 'gemini', label: 'Vision · Live API' },
  {
    from: 'copilot',
    to: 'technician-app',
    label: 'Live voice + camera',
    bidir: true,
    route: 'zx',
  },
  { from: 'technician-app', to: 'factory-floor', label: 'Repair + verify', route: 'zx' },
  { from: 'firestore', to: 'plant-ops', label: 'Live incident board' },
  { from: 'plant-ops', to: 'orchestrator', label: 'Shift-leader approval' },
];

export const edgeKey = (e: TopologyEdge): string => `${e.from}->${e.to}`;

/** Packets travel along `edges` (1.6 s). */
const move = (caption: string, edges: string[]): ScenarioStep => ({
  caption,
  seconds: 1.6,
  edges,
  working: [],
});

/** `working` agents process data, optionally querying over `edges` (2.0 s). */
const work = (caption: string, working: string[], edges: string[] = []): ScenarioStep => ({
  caption,
  seconds: 2.0,
  edges,
  working,
});

/** Looping incident scenario: each step lights its edges once (start -> end) and its agents. */
export const SCENARIO: ScenarioStep[] = [
  move('Camera frame + telemetry leave the machine', ['factory-floor->edge-gateway']),
  move('Gemma flags a defect, event sent to Pub/Sub', ['edge-gateway->pubsub']),
  move('Event reaches the orchestrator; raw data stored', [
    'pubsub->orchestrator',
    'pubsub->bigquery',
  ]),
  move('Orchestrator dispatches the agent team', ['orchestrator->qa']),
  work('Quality Inspector confirms the defect', ['qa']),
  move('Defect confirmed, passed to Traceability', ['qa->tra']),
  work('Traceability queries lot genealogy', ['tra'], ['tra->bigquery']),
  move('Suspect lots passed to Process Analyst', ['tra->pa']),
  work('Process Analyst reads sensor data', ['pa']),
  move('Sensor evidence passed to Root Cause', ['pa->rca']),
  work('Root Cause searches 8D archives', ['rca'], ['rca->rag']),
  move('Findings go to Copilot and Scribe', ['rca->copilot', 'rca->doc']),
  work(
    'Copilot guides the technician; Scribe drafts 8D',
    ['copilot', 'doc'],
    ['copilot->gemini', 'copilot->technician-app'],
  ),
  move('Technician repairs the machine', ['technician-app->factory-floor']),
  move('Repair done, sent for verification', ['copilot->qa']),
  work('Quality Inspector verifies on product evidence', ['qa']),
  move('Verified result goes to Learning', ['qa->learn']),
  work('Learning captures the knowledge', ['learn']),
  move('Incident closed and shown on the dashboard', [
    'orchestrator->firestore',
    'firestore->plant-ops',
  ]),
  move('Shift leader approves', ['plant-ops->orchestrator']),
  { caption: 'Incident resolved, restarting', seconds: 1.5, edges: [], working: [] },
];

const SCENARIO_TOTAL = SCENARIO.reduce((s, x) => s + x.seconds, 0);

/** Seconds on the shared scenario clock (same source for edges, robots and caption). */
export function scenarioNow(): number {
  return performance.now() / 1000;
}

export interface ScenarioState {
  index: number;
  step: ScenarioStep;
  progress: number;
}

/** Step active `seconds` into the endlessly looping scenario; progress is 0..1 within the step. */
export function scenarioAt(seconds: number): ScenarioState {
  let t = seconds % SCENARIO_TOTAL;
  for (let index = 0; index < SCENARIO.length; index += 1) {
    const step = SCENARIO[index];
    if (t < step.seconds) return { index, step, progress: t / step.seconds };
    t -= step.seconds;
  }
  const index = SCENARIO.length - 1;
  return { index, step: SCENARIO[index], progress: 1 };
}

/** Whether agent `id` is working (processing data) `seconds` into the scenario. */
export function isAgentWorking(id: string, seconds: number): boolean {
  return scenarioAt(seconds).step.working.includes(id);
}

export const ZONES: Zone[] = [
  // The on-prem chip sits above the plate's back corner; its front corner is under the legend.
  {
    id: 'onprem',
    label: 'Factory Floor · On-Premises Edge',
    rect: [-23, -11, -15, 3.5],
    chip: [-23.6, -11.6],
  },
  { id: 'cloud', label: 'Google Cloud · Control Plane', rect: [-13, -21, 28.5, 4.8], chip: [29.1, 5.4] },
  { id: 'team', label: 'Agent Team · ADK Workflow', rect: [-9, -12.5, 27, 3.5], chip: [27.6, -4.5] },
  { id: 'people', label: 'People · Apps', rect: [-9, 5.2, 9, 11], chip: [9.6, 11.6] },
];
