// Static topology of the Kaizen system: 17 nodes, their links and the deployed app each opens.
import type { AppTarget, ScenarioStep, TopologyEdge, TopologyNode, Zone } from '../types/topology';

// Each app's login screen prefills its password from ?pwd= for the role it signs in as.
const LOGIN_ROLE: Record<AppTarget, string> = {
  web: 'shift_leader',
  mobile: 'technician',
  factory: 'technician',
};

function appUrl(base: string, target: AppTarget): string {
  const pwd = __APP_PASSWORDS__[LOGIN_ROLE[target]];
  return pwd ? `${base}/?pwd=${encodeURIComponent(pwd)}` : base;
}

export const APP_LINKS: Record<AppTarget, { url: string; title: string }> = {
  web: { url: appUrl('https://kaizen-lab-web.web.app', 'web'), title: 'Plant Ops Dashboard' },
  mobile: { url: appUrl('https://kaizen-lab-mobile.web.app', 'mobile'), title: 'Technician App' },
  factory: { url: appUrl('https://kaizen-lab-factory.web.app', 'factory'), title: 'Factory Floor Console' },
};

export const NODES: TopologyNode[] = [
  {
    id: 'factory-floor',
    label: 'Factory Floor',
    sublabel: 'CNC · Cameras · Sensors',
    shape: 'machine',
    zone: 'onprem',
    position: [0, 18],
    target: 'factory',
    icon: 'precision_manufacturing',
  },
  {
    id: 'edge-gateway',
    label: 'Edge Gateway',
    sublabel: 'Gemma 3 + MQTT Bridge',
    shape: 'gateway',
    zone: 'onprem',
    position: [-7, 19],
    target: 'factory',
    icon: 'memory',
  },
  {
    id: 'pubsub',
    label: 'Cloud Pub/Sub',
    sublabel: 'Real-Time Ingestion Bus',
    shape: 'router',
    zone: 'cloud',
    position: [-13, 11],
    target: 'web',
    icon: 'alt_route',
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    sublabel: 'Traceability & Telemetry',
    shape: 'database',
    zone: 'cloud',
    position: [-19, -6],
    target: 'web',
    icon: 'database',
  },
  {
    id: 'firestore',
    label: 'Firestore',
    sublabel: 'Incident Blackboard',
    shape: 'database',
    zone: 'cloud',
    position: [-17, 1],
    target: 'web',
    icon: 'view_kanban',
  },
  {
    id: 'rag',
    label: 'Vertex AI Search',
    sublabel: '8D Archives & Manuals',
    shape: 'database',
    zone: 'cloud',
    position: [-16, -19],
    target: 'web',
    icon: 'menu_book',
  },
  {
    id: 'gemini',
    label: 'Gemini on Vertex AI',
    sublabel: 'LLM · Vision · Live API',
    shape: 'cloud',
    zone: 'cloud',
    position: [-15, -26],
    target: 'web',
    icon: 'smart_toy',
  },
  {
    id: 'orchestrator',
    label: 'ADK Orchestrator',
    sublabel: 'Sole Blackboard Writer',
    shape: 'hub',
    zone: 'team',
    position: [-9, 7],
    target: 'web',
    icon: 'account_tree',
  },
  {
    id: 'qa',
    label: 'Quality Inspector',
    sublabel: 'Detect · Verify',
    shape: 'agent',
    zone: 'team',
    position: [-4, 0],
    target: 'web',
    icon: 'fact_check',
  },
  {
    id: 'tra',
    label: 'Traceability',
    sublabel: 'Lot genealogy',
    shape: 'agent',
    zone: 'team',
    position: [-4, -6],
    target: 'web',
    icon: 'route',
  },
  {
    id: 'pa',
    label: 'Process Analyst',
    sublabel: 'Sensor analysis',
    shape: 'agent',
    zone: 'team',
    position: [-4, -12],
    target: 'web',
    icon: 'monitoring',
  },
  {
    id: 'rca',
    label: 'Root Cause',
    sublabel: 'Cause analysis',
    shape: 'agent',
    zone: 'team',
    position: [-4, -18],
    target: 'web',
    icon: 'troubleshoot',
  },
  {
    id: 'doc',
    label: 'Incident Scribe',
    sublabel: '8D documentation',
    shape: 'agent',
    zone: 'team',
    position: [-4, -24],
    target: 'web',
    icon: 'edit_note',
  },
  {
    id: 'copilot',
    label: 'Tech Copilot',
    sublabel: 'Live repair guide',
    shape: 'agent',
    zone: 'team',
    position: [2, -18],
    target: 'web',
    icon: 'support_agent',
  },
  {
    id: 'learn',
    label: 'Learning',
    sublabel: 'Knowledge capture',
    shape: 'agent',
    zone: 'team',
    position: [-11, -11],
    target: 'web',
    icon: 'school',
  },
  {
    id: 'plant-ops',
    label: 'Plant Ops Dashboard',
    sublabel: 'Incidents · Sign-off',
    shape: 'monitor',
    zone: 'people',
    position: [-6, -33],
    target: 'web',
    icon: 'dashboard',
  },
  {
    id: 'technician-app',
    label: 'Technician App',
    sublabel: 'Live Copilot · Repair',
    shape: 'phone',
    zone: 'people',
    position: [3, -35],
    target: 'mobile',
    icon: 'handyman',
  },
];

export const EDGES: TopologyEdge[] = [
  { from: 'factory-floor', to: 'edge-gateway', label: 'Images · Telemetry', route: 'zx' },
  { from: 'edge-gateway', to: 'pubsub', label: 'Defective images + anomalies' },
  { from: 'pubsub', to: 'bigquery', label: 'Raw telemetry storage' },
  { from: 'pubsub', to: 'orchestrator', label: 'Defect / SPC event' },
  { from: 'orchestrator', to: 'firestore', label: 'Sole writer' },
  { from: 'orchestrator', to: 'qa', label: 'Dispatch' },
  { from: 'qa', to: 'tra', label: 'Defect confirmed', route: 'zx' },
  { from: 'tra', to: 'pa', label: 'Suspect lots', route: 'zx' },
  { from: 'pa', to: 'rca', label: 'Sensor evidence', route: 'zx' },
  { from: 'rca', to: 'copilot', label: 'Fix guidance', route: 'zx' },
  { from: 'rca', to: 'doc', label: 'Findings', route: 'zx' },
  { from: 'copilot', to: 'qa', label: 'Repair done -> verify', route: 'zx' },
  { from: 'qa', to: 'learn', label: 'Verified -> learn' },
  { from: 'tra', to: 'bigquery', label: 'Lot genealogy', route: 'zx' },
  { from: 'rca', to: 'rag', label: 'RAG lookup' },
  { from: 'copilot', to: 'gemini', label: 'Vision · Live API', route: 'zx' },
  { from: 'copilot', to: 'technician-app', label: 'Live voice + camera' },
  { from: 'technician-app', to: 'factory-floor', label: 'Repair + verify' },
  { from: 'firestore', to: 'plant-ops', label: 'Live incident board' },
  { from: 'plant-ops', to: 'orchestrator', label: 'Shift-leader approval' },
];

export const edgeKey = (e: TopologyEdge): string => `${e.from}->${e.to}`;

/** Packets travel along `edges` (1.6 s), optionally with `working` agents. */
const move = (caption: string, edges: string[], working: string[] = []): ScenarioStep => ({
  caption,
  seconds: 1.6,
  edges,
  working,
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
  move('Orchestrator dispatches the agent team', ['orchestrator->qa'], ['orchestrator']),
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
  move(
    'Incident closed and shown on the dashboard',
    ['orchestrator->firestore', 'firestore->plant-ops'],
    ['orchestrator'],
  ),
  move('Shift leader approves', ['plant-ops->orchestrator'], ['orchestrator']),
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

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/** Yaw (atan2(dx, dz)) of the first segment of the edge's L route, as EdgeFlow draws it. */
function firstSegmentYaw(edge: TopologyEdge): number {
  const from = NODE_BY_ID.get(edge.from);
  const to = NODE_BY_ID.get(edge.to);
  if (!from || !to) throw new Error(`Unknown node in edge ${edgeKey(edge)}`);
  const [fx, fz] = from.position;
  const [tx, tz] = to.position;
  const zFirst = fx === tx || (fz !== tz && edge.route === 'zx');
  return zFirst ? Math.atan2(0, Math.sign(tz - fz)) : Math.atan2(Math.sign(tx - fx), 0);
}

/** Per agent id, the heading for every scenario step (filled lazily). */
const headingCache = new Map<string, (number | null)[]>();

/**
 * Yaw agent `id` should face at scenario step `stepIndex`: the direction its next outgoing data
 * leaves in, searching forward from this step and wrapping once; null if it never sends data.
 */
export function headingAt(id: string, stepIndex: number): number | null {
  let headings = headingCache.get(id);
  if (!headings) {
    const own = SCENARIO.map((step) => {
      const edge = EDGES.find((e) => e.from === id && step.edges.includes(edgeKey(e)));
      return edge ? firstSegmentYaw(edge) : null;
    });
    headings = own.map((_, i) => {
      for (let k = 0; k < own.length; k += 1) {
        const yaw = own[(i + k) % own.length];
        if (yaw !== null) return yaw;
      }
      return null;
    });
    headingCache.set(id, headings);
  }
  return headings[stepIndex] ?? null;
}

export const ZONES: Zone[] = [
  // Flow runs away from the camera (factory front, people back); each chip sits just outside its
  // plate where it clears labels, the legend and the caption.
  {
    id: 'onprem',
    label: 'Factory Floor',
    rect: [-11, 15, 3.5, 23],
    chip: [4.1, 23.8],
  },
  { id: 'cloud', label: 'Google Cloud', rect: [-21, -28.5, 4.8, 13], chip: [5.4, -29.1] },
  { id: 'team', label: 'Agent Team', rect: [-12.5, -27, 3.5, 9], chip: [4.1, -9] },
  { id: 'people', label: 'Apps', rect: [-9, -39, 4.5, -31], chip: [-9.6, -39.6] },
];
