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
    position: [4, 21],
    target: 'factory',
    icon: 'precision_manufacturing',
  },
  {
    id: 'edge-gateway',
    label: 'Edge Gateway',
    sublabel: 'Gemma 3 + MQTT Bridge',
    shape: 'gateway',
    zone: 'onprem',
    position: [12, 21],
    icon: 'memory',
  },
  {
    id: 'pubsub',
    label: 'Cloud Pub/Sub',
    sublabel: 'Real-Time Ingestion Bus',
    shape: 'router',
    zone: 'cloud',
    position: [12, 9],
    icon: 'alt_route',
  },
  {
    id: 'bigquery',
    label: 'BigQuery',
    sublabel: 'Traceability & Telemetry',
    shape: 'database',
    zone: 'cloud',
    position: [4, 9],
    icon: 'database',
  },
  {
    id: 'rag',
    label: 'Vertex AI Search',
    sublabel: '8D Archives & Manuals',
    shape: 'cloud',
    zone: 'cloud',
    position: [-4, 9],
    icon: 'menu_book',
  },
  {
    id: 'gemini',
    label: 'Gemini on Vertex AI',
    sublabel: 'LLM · Vision · Live API',
    shape: 'cloud',
    zone: 'cloud',
    position: [-12, 9],
    icon: 'smart_toy',
  },
  // Inside ADK Agent Swarm Blackbox
  {
    id: 'orchestrator',
    label: 'ADK Orchestrator',
    sublabel: 'Sole Blackboard Writer',
    shape: 'hub',
    zone: 'team',
    position: [11, -3],
    icon: 'account_tree',
  },
  {
    id: 'qa',
    label: 'Quality Inspector',
    sublabel: 'Detect · Verify',
    shape: 'agent',
    zone: 'team',
    position: [4, -3],
    icon: 'fact_check',
  },
  {
    id: 'tra',
    label: 'Traceability',
    sublabel: 'Lot genealogy',
    shape: 'agent',
    zone: 'team',
    position: [-4, -3],
    icon: 'route',
  },
  {
    id: 'pa',
    label: 'Process Analyst',
    sublabel: 'Sensor analysis',
    shape: 'agent',
    zone: 'team',
    position: [-11, -3],
    icon: 'monitoring',
  },
  {
    id: 'rca',
    label: 'Root Cause',
    sublabel: 'Cause analysis',
    shape: 'agent',
    zone: 'team',
    position: [-11, -8.5],
    icon: 'troubleshoot',
  },
  {
    id: 'copilot',
    label: 'Tech Copilot',
    sublabel: 'Live repair guide',
    shape: 'agent',
    zone: 'team',
    position: [-4, -8.5],
    icon: 'support_agent',
  },
  {
    id: 'doc',
    label: 'Incident Scribe',
    sublabel: '8D documentation',
    shape: 'agent',
    zone: 'team',
    position: [4, -8.5],
    icon: 'edit_note',
  },
  {
    id: 'learn',
    label: 'Learning',
    sublabel: 'Knowledge capture',
    shape: 'agent',
    zone: 'team',
    position: [11, -8.5],
    icon: 'school',
  },
  // External Apps
  {
    id: 'technician-app',
    label: 'Technician App',
    sublabel: 'Live Copilot · Repair',
    shape: 'phone',
    zone: 'people',
    position: [-4, -20],
    target: 'mobile',
    icon: 'handyman',
  },
  {
    id: 'plant-ops',
    label: 'Plant Ops Dashboard',
    sublabel: 'Incidents · Sign-off',
    shape: 'monitor',
    zone: 'people',
    position: [12, -20],
    target: 'web',
    icon: 'dashboard',
  },
];

export const EDGES: TopologyEdge[] = [
  // Factory and ingestion
  { from: 'factory-floor', to: 'edge-gateway', label: 'Images · Telemetry' },
  { from: 'edge-gateway', to: 'pubsub', label: 'Defective images + anomalies' },
  { from: 'pubsub', to: 'bigquery', label: 'Raw telemetry storage' },
  { from: 'pubsub', to: 'orchestrator', toPort: [12, 1], label: 'Defect / SPC event' },
  // Internal swarm connections (inside blackbox)
  { from: 'orchestrator', to: 'qa', label: 'Dispatch' },
  { from: 'qa', to: 'tra', label: 'Defect confirmed' },
  { from: 'tra', to: 'pa', label: 'Suspect lots' },
  { from: 'pa', to: 'rca', label: 'Sensor evidence' },
  { from: 'rca', to: 'copilot', label: 'Fix guidance' },
  { from: 'rca', to: 'doc', label: 'Findings' },
  { from: 'copilot', to: 'qa', label: 'Repair done -> verify', route: 'zx' },
  { from: 'qa', to: 'learn', label: 'Verified -> learn', route: 'zx' },
  // External connections: Blackbox boundary to Cloud resources
  { from: 'tra', to: 'bigquery', fromPort: [4, 1], label: 'Lot genealogy query' },
  { from: 'rca', to: 'rag', fromPort: [-4, 1], label: 'RAG knowledge search' },
  { from: 'copilot', to: 'gemini', fromPort: [-12, 1], label: 'Multimodal foundation model' },
  // External connections: Blackbox boundary to Apps
  { from: 'copilot', to: 'technician-app', fromPort: [-4, -12], label: 'Live voice + camera' },
  { from: 'orchestrator', to: 'plant-ops', fromPort: [12, -12], label: 'Live incident board' },
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
  move('Camera frame + telemetry leave the machine', ['factory-floor->edge-gateway'], ['factory-floor']),
  move('Gemma flags a defect, event sent to Pub/Sub', ['edge-gateway->pubsub'], ['edge-gateway']),
  move(
    'Event reaches the orchestrator; raw data stored',
    ['pubsub->orchestrator', 'pubsub->bigquery'],
    ['pubsub'],
  ),
  move('Orchestrator dispatches the agent team', ['orchestrator->qa'], ['orchestrator']),
  work('Quality Inspector confirms the defect', ['qa']),
  move('Defect confirmed, passed to Traceability', ['qa->tra']),
  work('Traceability queries lot genealogy from BigQuery', ['tra', 'bigquery'], ['tra->bigquery']),
  move('Suspect lots passed to Process Analyst', ['tra->pa']),
  work('Process Analyst reads sensor data', ['pa']),
  move('Sensor evidence passed to Root Cause', ['pa->rca']),
  work('Root Cause searches 8D archives in Vertex AI', ['rca', 'rag'], ['rca->rag']),
  move('Findings go to Copilot and Scribe', ['rca->copilot', 'rca->doc']),
  work(
    'Copilot guides technician with Gemini live model',
    ['copilot', 'doc', 'gemini', 'technician-app'],
    ['copilot->gemini', 'copilot->technician-app'],
  ),
  work('Technician performs physical repair on bay', ['copilot', 'technician-app']),
  move('Repair done, sent for verification', ['copilot->qa']),
  work('Quality Inspector verifies on product evidence', ['qa']),
  move('Verified result goes to Learning', ['qa->learn']),
  work('Learning captures the knowledge', ['learn']),
  move('Incident closed and broadcast to dashboard', ['orchestrator->plant-ops'], ['plant-ops']),
  work('Shift leader reviews and approves on dashboard', ['plant-ops']),
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

export const AGENT_IDS = new Set([
  'orchestrator',
  'qa',
  'tra',
  'pa',
  'rca',
  'copilot',
  'doc',
  'learn',
]);

export function isAgentId(id: string | null | undefined): boolean {
  return Boolean(id && AGENT_IDS.has(id));
}

/** Whether agent `id` is working (processing data) `seconds` into the scenario. */
export function isAgentWorking(id: string, seconds: number): boolean {
  return scenarioAt(seconds).step.working.includes(id);
}

/** Whether node `id` is active or working in the scenario `seconds` into the loop. */
export function isNodeActive(id: string, seconds: number): boolean {
  const { step } = scenarioAt(seconds);
  if (step.working.includes(id)) return true;
  if (id === 'gemini' && step.working.some((w) => AGENT_IDS.has(w))) return true;
  return step.edges.some((key) => key.startsWith(`${id}->`) || key.endsWith(`->${id}`));
}

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

/** Yaw (atan2(dx, dz)) of the first segment of the edge's L route, as EdgeFlow draws it. */
function firstSegmentYaw(edge: TopologyEdge): number {
  const from = NODE_BY_ID.get(edge.from);
  const to = NODE_BY_ID.get(edge.to);
  if (!from || !to) throw new Error(`Unknown node in edge ${edgeKey(edge)}`);
  const fx = edge.fromPort ? edge.fromPort[0] : from.position[0];
  const fz = edge.fromPort ? edge.fromPort[1] : from.position[1];
  const target = edge.waypoints && edge.waypoints.length > 0
    ? edge.waypoints[0]
    : (edge.toPort ? edge.toPort : to.position);
  const [tx, tz] = target;
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
  {
    id: 'onprem',
    label: 'Factory Floor',
    rect: [0, 17, 16, 25],
    chip: [8, 25.8],
  },
  {
    id: 'cloud',
    label: 'Google Cloud',
    rect: [-17, -15, 17, 13],
    chip: [-12, 13.8],
  },
  {
    id: 'team',
    label: 'ADK Agent Swarm',
    rect: [-15, -12, 15, 1],
    chip: [0, 1.8],
  },
  {
    id: 'people',
    label: 'Apps',
    rect: [-8, -24, 16, -16],
    chip: [4, -24.8],
  },
];
