// Shared incident helpers: Andon phase mapping, status labels and helper utilities.
import type {
  AgentFinding,
  AndonPhaseDetails,
  AndonPhaseKey,
  AndonPhaseStatus,
  IncidentState,
  IncidentStatus,
} from '../types';

/** Product currently running on Line-01; end-of-line defects are attributed to it. */
export const ACTIVE_PRODUCT = 'Gearbox Casing';

/** Human-readable archetype for each vision defect class. Supports backend keys (scratch_vertical, short_fill, sink_mark, etc.) */
const _BASE_DEFECT_ARCHETYPE: Record<string, string> = {
  // Live backend & simulator defect keys
  scratch_vertical: 'Surface Micro-Blemish / Axial Chatter Runout',
  surface_scratch: 'Surface Micro-Blemish / Axial Chatter Runout',
  short_fill: 'Incomplete Mold Cavity Fill / Short Shot',
  sink_mark: 'Surface Sink Mark / Thermal Contraction Void',
  minor_burr: 'Edge Burr / Incomplete Deburr Pass',
  'short_fill / sink_mark': 'Incomplete Mold Fill & Sink Mark / Moisture Splay',
  'short_fill/sink_mark': 'Incomplete Mold Fill & Sink Mark / Moisture Splay',
  'short fill': 'Incomplete Mold Cavity Fill / Short Shot',
  'sink mark': 'Surface Sink Mark / Thermal Contraction Void',
  'minor burr': 'Edge Burr / Incomplete Deburr Pass',
  tool_wear: 'Insert Flank Wear / Spindle Dynamic Chatter',
  damp_material: 'Moisture Splay / Material Degradation Voids',
  spindle_vibration: 'Excessive Spindle Vibration / Dynamic Harmonic Runout',
  // Short archetype identifiers & fallbacks
  scratch: 'Surface Micro-Blemish / Axial Chatter Runout',
  dent: 'Impact Deformation / Handling Damage',
  porosity: 'Sub-Surface Porosity / Moisture Voids',
  burr: 'Edge Burr / Incomplete Deburr Pass',
  splay: 'Moisture Splay / Material Degradation Voids',
  flash: 'Parting Line Flash / Mold Clamping Defect',
};

const _BASE_DEFECT_FRIENDLY_NAME: Record<string, string> = {
  scratch_vertical: 'Vertical Scratch',
  surface_scratch: 'Surface Scratch',
  short_fill: 'Short Fill',
  sink_mark: 'Sink Mark',
  minor_burr: 'Minor Burr',
  'short_fill / sink_mark': 'Short Fill & Sink Mark',
  'short_fill/sink_mark': 'Short Fill & Sink Mark',
  'short fill': 'Short Fill',
  'sink mark': 'Sink Mark',
  'minor burr': 'Minor Burr',
  tool_wear: 'Tool Wear',
  damp_material: 'Damp Material Splay',
  spindle_vibration: 'Spindle Chatter',
  scratch: 'Surface Scratch',
  dent: 'Handling Dent',
  porosity: 'Material Porosity',
  burr: 'Edge Burr',
  splay: 'Moisture Splay',
  flash: 'Parting Flash',
};

export function friendlyDefectName(defectType?: string | null): string {
  if (!defectType) return 'Surface Defect';
  const norm = defectType.toLowerCase().trim().replace(/^defect[_-]/, '');
  if (_BASE_DEFECT_FRIENDLY_NAME[norm]) return _BASE_DEFECT_FRIENDLY_NAME[norm];
  if (norm.includes('scratch')) return 'Vertical Scratch';
  if (norm.includes('short_fill') || norm.includes('short fill')) return 'Short Fill';
  if (norm.includes('sink')) return 'Sink Mark';
  if (norm.includes('burr')) return 'Minor Burr';
  if (norm.includes('poros')) return 'Material Porosity';
  if (norm.includes('dent')) return 'Handling Dent';
  if (norm.includes('splay')) return 'Moisture Splay';
  if (norm.includes('flash')) return 'Parting Flash';
  if (norm.includes('tool')) return 'Tool Wear';
  if (norm.includes('damp') || norm.includes('moist')) return 'Damp Material Splay';
  if (norm.includes('vib') || norm.includes('chatter')) return 'Spindle Chatter';
  return titleCase(norm);
}

export function resolveDefectArchetype(defectType?: string | null): string {
  if (!defectType) return 'Surface Micro-Blemish / Axial Chatter Runout';
  const norm = defectType.toLowerCase().trim().replace(/^defect[_-]/, '');
  if (_BASE_DEFECT_ARCHETYPE[norm]) return _BASE_DEFECT_ARCHETYPE[norm];
  if (norm.includes('scratch')) return _BASE_DEFECT_ARCHETYPE.scratch_vertical;
  if (norm.includes('short_fill') || norm.includes('short fill')) return _BASE_DEFECT_ARCHETYPE.short_fill;
  if (norm.includes('sink')) return _BASE_DEFECT_ARCHETYPE.sink_mark;
  if (norm.includes('burr')) return _BASE_DEFECT_ARCHETYPE.minor_burr;
  if (norm.includes('poros')) return _BASE_DEFECT_ARCHETYPE.porosity;
  if (norm.includes('dent')) return _BASE_DEFECT_ARCHETYPE.dent;
  if (norm.includes('splay')) return _BASE_DEFECT_ARCHETYPE.splay;
  if (norm.includes('flash')) return _BASE_DEFECT_ARCHETYPE.flash;
  if (norm.includes('tool')) return _BASE_DEFECT_ARCHETYPE.tool_wear;
  if (norm.includes('damp') || norm.includes('moist')) return _BASE_DEFECT_ARCHETYPE.damp_material;
  if (norm.includes('vib') || norm.includes('chatter')) return _BASE_DEFECT_ARCHETYPE.spindle_vibration;
  return titleCase(norm);
}

/** Human-readable archetype for each vision defect class. Supports bracket notation with any backend key */
export const DEFECT_ARCHETYPE: Record<string, string> = new Proxy(_BASE_DEFECT_ARCHETYPE, {
  get(target, prop: string | symbol) {
    if (typeof prop === 'string') {
      if (prop in target) return target[prop];
      return resolveDefectArchetype(prop);
    }
    return Reflect.get(target, prop);
  },
});

/** Friendly display name for each vision defect class. Supports bracket notation with any backend key */
export const DEFECT_FRIENDLY_NAME: Record<string, string> = new Proxy(_BASE_DEFECT_FRIENDLY_NAME, {
  get(target, prop: string | symbol) {
    if (typeof prop === 'string') {
      if (prop in target) return target[prop];
      return friendlyDefectName(prop);
    }
    return Reflect.get(target, prop);
  },
});

/** Which of the five dossier steps (1-based) each incident status is currently working on. */
export const STEP_OF_STATUS: Record<IncidentStatus, number> = {
  normal: 1,
  error: 1,
  detecting: 1,
  tracing: 2,
  investigating: 2,
  analyzing: 3,
  awaiting_evidence: 3,
  escalated: 3,
  repairing: 4,
  verifying: 4,
  pending_approval: 5,
  closed: 5,
  dismissed: 5,
};

export type StepState = 'done' | 'active' | 'pending';

/** Done / active / pending for a dossier step; an approved incident has every step done. */
export function stepState(
  step: number,
  incident: Pick<IncidentState, 'status' | 'approved'>,
  hasFindings = false,
): StepState {
  if (incident.approved) return 'done';
  const current = STEP_OF_STATUS[incident.status];
  if (step < current) return 'done';
  if (step === current) return 'active';
  if (hasFindings) return 'done';
  return 'pending';
}

export function titleCase(text: string): string {
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AGENT_ROLE_MAP: Record<string, string[]> = {
  quality_inspector: ['quality_inspector', 'qa'],
  traceability: ['traceability', 'tra'],
  process_analyst: ['process_analyst', 'pa'],
  root_cause: ['root_cause', 'rca'],
  technician_copilot: ['technician_copilot', 'copilot'],
  incident_scribe: ['incident_scribe', 'doc', 'scribe'],
  continuous_learning: ['continuous_learning', 'learn'],
};

export function matchesAgentRole(finding: AgentFinding, role: string): boolean {
  const roleAliases = AGENT_ROLE_MAP[role] ?? [role.toLowerCase()];
  const id = (finding.agent_id || '').trim().toLowerCase();
  const name = (finding.agent_name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return roleAliases.some((a) => id === a || id.includes(a)) || name.includes(role);
}

export const AGENT_ICON: Record<string, string> = {
  quality_inspector: 'photo_camera',
  qa: 'photo_camera',
  traceability: 'account_tree',
  tra: 'account_tree',
  process_analyst: 'ssid_chart',
  pa: 'ssid_chart',
  root_cause: 'psychology',
  rca: 'psychology',
  technician_copilot: 'engineering',
  copilot: 'engineering',
  incident_scribe: 'edit_document',
  doc: 'edit_document',
  continuous_learning: 'school',
  learn: 'school',
};

export function agentIcon(agentId: string, agentName = ''): string {
  const id = (agentId || '').trim().toLowerCase();
  if (AGENT_ICON[id]) return AGENT_ICON[id];
  const name = (agentName || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const key = Object.keys(AGENT_ICON).find((k) => id.includes(k) || name.includes(k));
  return key ? AGENT_ICON[key] : 'smart_toy';
}

/** Real Blackboard findings when available; empty array if none. */
export function resolveFindings(incident: IncidentState | null): AgentFinding[] {
  return incident?.findings ?? [];
}

export const PHASES: AndonPhaseDetails[] = [
  {
    key: 'A',
    letter: 'A',
    name: 'Detection',
    lampColor: 'red',
    lampHex: '#e5484d',
    description: 'Edge vision classification and SPC upper-control-limit monitoring.',
    activities: ['Gemma 3 edge pre-filter', 'Gemini Vision defect classification', 'SPC gatekeeper (UCL 3.0%)'],
    inputs: ['EOL camera frames', 'SPC baseline 0.5%'],
    outputs: ['Defect class + severity', 'Incident opened'],
    statuses: ['detecting'],
  },
  {
    key: 'B',
    letter: 'B',
    name: 'Tracing & RCA',
    lampColor: 'yellow',
    lampHex: '#f5a524',
    description: 'Genealogy tracing, telemetry correlation and grounded 5-Whys analysis.',
    activities: ['Traceability (BigQuery)', 'Process Analyst telemetry', 'Root Cause (Vertex RAG)'],
    inputs: ['Defective serials', 'CNC telemetry', 'OEM manuals & 8D archive'],
    outputs: ['Suspect machine / tool', 'Root cause + confidence'],
    statuses: ['tracing', 'investigating', 'analyzing', 'awaiting_evidence'],
  },
  {
    key: 'C',
    letter: 'C',
    name: 'Resolution & Verification',
    lampColor: 'blue',
    lampHex: '#3b82f6',
    description: 'Technician Copilot repair guidance and 50-part physical verification streak.',
    activities: ['Technician Copilot (Gemini Live)', 'Incident Scribe work order', 'Streak gatekeeper'],
    inputs: ['Grounded diagnosis', 'Technician camera / voice', 'Post-repair EOL frames'],
    outputs: ['Repair confirmed', '50 good parts certified'],
    statuses: ['repairing', 'verifying'],
  },
  {
    key: 'D',
    letter: 'D',
    name: 'Learning',
    lampColor: 'green',
    lampHex: '#12a150',
    description: 'Knowledge-base ingestion, 8D report, impact calculation and shift-leader sign-off.',
    activities: ['Continuous Learning', 'Impact Calculator', 'Shift-leader approval'],
    inputs: ['Closed incident board', 'Emission benchmarks'],
    outputs: ['8D report', 'Scrap / CO₂ avoided', 'Sign-off recorded'],
    statuses: ['pending_approval', 'closed'],
  },
];

export function getPhaseStatus(phase: AndonPhaseKey, status: IncidentStatus): AndonPhaseStatus {
  if (status === 'escalated') {
    if (phase === 'A') return 'completed';
    return phase === 'B' || phase === 'C' ? 'escalated' : 'pending';
  }
  const order: AndonPhaseKey[] = ['A', 'B', 'C', 'D'];
  const activeIdx = PHASES.findIndex((p) => p.statuses.includes(status));
  if (status === 'closed') return 'completed';
  if (activeIdx < 0) return 'pending';
  const idx = order.indexOf(phase);
  if (idx < activeIdx) return 'completed';
  if (idx === activeIdx) return 'active';
  return 'pending';
}

export function isIncidentActive(incident: IncidentState | null): boolean {
  if (!incident || incident.archived) return false;
  return !['normal', 'closed', 'dismissed'].includes(incident.status);
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  normal: 'Nominal',
  detecting: 'Detecting',
  tracing: 'Tracing',
  investigating: 'Investigating',
  analyzing: 'Analyzing',
  awaiting_evidence: 'Awaiting Evidence',
  repairing: 'Repairing',
  verifying: 'Verifying',
  pending_approval: 'Pending Approval',
  closed: 'Closed',
  dismissed: 'Dismissed',
  escalated: 'Escalated',
  error: 'Error',
};

/** Default Ishikawa categories considered causal when no explicit signals match. */
export const CAUSAL_CATEGORIES = new Set(['Machine', 'Method']);

/** Deduces whether an Ishikawa factor category represents a root cause or a cleared/nominal factor. */
export function isIshikawaCategoryCausal(category: string, items: string[] = [], rootCauseSummary?: string): boolean {
  if (!items || items.length === 0) return false;
  const text = items.join(' ').toLowerCase();
  if (!text.trim() || text.trim() === '—') return false;

  const clearedSignals = [
    'ruled out',
    'nominal',
    'normal',
    'cleared',
    'within standard',
    'no anomaly',
    'correctly detected',
    'human error ruled out',
    'environmental factors nominal',
    'operating within standard',
    'calibrated',
    'valid',
    'controlled',
  ];
  const isExplicitlyCleared = clearedSignals.some((sig) => text.includes(sig));

  const causalSignals = [
    'causal',
    'root cause',
    'flank wear',
    'vibration spike',
    'saturated',
    'dewpoint degraded',
    'dewpoint drift',
    'calendar-based',
    'lacked automated',
    'lacked inline',
    'exceeded rated',
    'exceeded tool life',
    'moisture elevated',
    'degraded to',
    'chipping',
    'chatter',
    'bearing preload',
    'thermal deflection',
    'override',
    'delayed plc',
  ];
  const hasCausalSignal = causalSignals.some((sig) => text.includes(sig));

  if (isExplicitlyCleared && !hasCausalSignal) return false;
  if (hasCausalSignal && !isExplicitlyCleared) return true;
  if (text.includes('ruled out')) return false;

  if (rootCauseSummary && rootCauseSummary.toLowerCase().includes(category.toLowerCase())) {
    return true;
  }

  return CAUSAL_CATEGORIES.has(category);
}

export function formatPct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatClock(iso?: string | null): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().substring(11, 19);
}

export function formatLocalClock(iso?: string | null, includeSeconds = false): string {
  if (!iso) return includeSeconds ? '--:--:--' : '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const match = iso.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    return match ? match[1] : iso;
  }
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
}

export function parseTimeSeconds(raw?: string | null): number | null {
  if (!raw) return null;
  if (raw.includes('T') || (raw.includes('-') && raw.includes(':'))) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
    }
  }
  const match = raw.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = match[3] ? parseInt(match[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

export function formatDuration(ms: number): string {
  if (Number.isNaN(ms) || ms <= 0) return '0m 00s';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

export function computeIncidentDuration(startRaw?: string | null, endRaw?: string | null): string {
  if (!startRaw || !endRaw) return '0m 00s';

  const dStart = new Date(startRaw);
  const dEnd = new Date(endRaw);
  if (!Number.isNaN(dStart.getTime()) && !Number.isNaN(dEnd.getTime()) && (startRaw.includes('-') || startRaw.includes('T')) && (endRaw.includes('-') || endRaw.includes('T'))) {
    const diff = Math.max(0, dEnd.getTime() - dStart.getTime());
    return formatDuration(diff);
  }

  const startSec = parseTimeSeconds(startRaw);
  const endSec = parseTimeSeconds(endRaw);
  if (startSec !== null && endSec !== null) {
    let diffSec = endSec - startSec;
    if (diffSec < 0) diffSec += 86400;
    return formatDuration(diffSec * 1000);
  }

  return '0m 00s';
}

export function formatIncidentDate(raw?: string | null): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!raw) return today;
  if (raw.includes('-') && raw.includes(':')) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
  }
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return today;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime())
    ? today
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Open incident per Line-01 product. A live Blackboard incident is attributed to the active product;
 * when offline or nominal, returns an empty map (no fabricated incidents).
 */
export function productIncidents(live: IncidentState | null): Record<string, IncidentState> {
  if (!live || live.status === 'normal' || live.archived) return {};
  return { [ACTIVE_PRODUCT]: live };
}

export type LineProductState = 'normal' | 'warning' | 'queued';

export interface LineProduct {
  name: string;
  state: LineProductState;
  defect: number | null;
  incident?: IncidentState;
}

/** Line-01 build sequence; `defect` is the shift's end-of-line rate, null while the product is still queued. */
const LINE_SEQUENCE: { name: string; defect: number | null }[] = [
  { name: 'Engine Block', defect: 0.01 },
  { name: 'Cylinder Head', defect: 0.01 },
  { name: ACTIVE_PRODUCT, defect: 0.0042 },
  { name: 'Clutch Housing', defect: null },
  { name: 'Flywheel Housing', defect: null },
];

/** Per-product end-of-line state; a product with an unapproved incident is in warning until sign-off. */
export function lineProducts(live: IncidentState | null): LineProduct[] {
  const incidents = productIncidents(live);
  return LINE_SEQUENCE.map((p) => {
    const inc = incidents[p.name];
    if (inc && !inc.approved) return { name: p.name, state: 'warning', defect: inc.defect_rate, incident: inc };
    const defect = p.name === ACTIVE_PRODUCT && live ? live.defect_rate : p.defect;
    return { name: p.name, state: defect === null ? 'queued' : 'normal', defect };
  });
}

/** Short card label for where an open incident currently stands. */
export function incidentStage(inc: IncidentState): string {
  if (inc.status === 'closed') return 'Awaiting sign-off';
  if (inc.status === 'verifying') return `Verifying ${inc.verification_count}/${inc.verification_target}`;
  return STATUS_LABEL[inc.status];
}
