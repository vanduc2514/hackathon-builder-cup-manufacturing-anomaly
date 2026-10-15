// Shared incident helpers: Andon phase mapping, status labels and demo-safe fallback narrative.
import type {
  AgentFinding,
  AndonPhaseDetails,
  AndonPhaseKey,
  AndonPhaseStatus,
  FiveWhysStep,
  IncidentState,
  IncidentStatus,
} from '../types';

export const FALLBACK_FINDINGS: AgentFinding[] = [
  {
    agent_id: 'quality_inspector',
    agent_name: 'Quality Inspector',
    phase: 'A',
    finding: 'Defect rate 3.42% breached UCL 3.00% — vertical scratch on Face A, parts #8378–#8382.',
    evidence: 'CAM-LINE01-EOL frames classified "scratch" at 99.4% confidence; 300-part moving average crossed UCL at part #8380.',
    confidence: 0.994,
    citation: 'SPC-RULE-1 · AS9100 Rev D §8.7',
    timestamp: '2024-10-24T14:02:11Z',
  },
  {
    agent_id: 'traceability',
    agent_name: 'Traceability Agent',
    phase: 'B',
    finding: 'All defective serials share Op-20 on CNC-02 with tool T07; CNC-01 and CNC-03 cleared.',
    evidence: 'BigQuery genealogy join over lot #L8830-TI (24 pcs): 5/5 defects routed via CNC-02, 0/19 good parts flagged upstream.',
    confidence: 0.942,
    citation: 'bq://traceability.part_route',
    timestamp: '2024-10-24T14:04:37Z',
  },
  {
    agent_id: 'process_analyst',
    agent_name: 'Process Analyst',
    phase: 'B',
    finding: 'CNC-02 spindle vibration +35% (2.14 mm/s vs 0.38 baseline) coincident with defect onset.',
    evidence: 'Axis-Z RMS crossed 1.95 mm/s warn at 14:01:48; motor current rose 12.0 → 13.9 A; CNC-01/03 flat.',
    confidence: 0.918,
    citation: 'ISO-10816-3 Zone C',
    timestamp: '2024-10-24T14:06:02Z',
  },
  {
    agent_id: 'root_cause',
    agent_name: 'Root Cause Agent',
    phase: 'B',
    finding: 'T07 insert exceeded tool life (482 / 450 cycles) — delayed auto-offset in PLC sub-routine 14B.',
    evidence: '5-Whys grounded in OEM manual + 8D-2023-088; field flank-wear scan 0.32 mm raised confidence 68.4% → 91.8%.',
    confidence: 0.918,
    citation: 'SOP-CNC-402 §4.2 · 8D-2023-088',
    timestamp: '2024-10-24T14:11:20Z',
  },
  {
    agent_id: 'technician_copilot',
    agent_name: 'Technician Copilot',
    phase: 'C',
    finding: 'Insert T07 indexed to edge 2, damper torque 24.5 Nm, runout re-checked at 0.0012 mm.',
    evidence: 'Gemini Live session with Marcus Vance (TECH-902), dial indicator reading confirmed on camera.',
    confidence: 0.97,
    citation: 'Walkthrough #08 · SOP #209',
    timestamp: '2024-10-24T14:31:44Z',
  },
  {
    agent_id: 'incident_scribe',
    agent_name: 'Incident Scribe',
    phase: 'D',
    finding: '50/50 consecutive good parts verified. 8D report #8D-INC-A389F1 drafted for sign-off.',
    evidence: 'Streak #8383 → #8432 at CAM-EOL with zero defects; SOP #209 bumped to Rev 4.2.',
    confidence: 1,
    citation: 'AIAG 8D · IATF 16949 §10.2',
    timestamp: '2024-10-24T14:44:29Z',
  },
  {
    agent_id: 'continuous_learning',
    agent_name: 'Continuous Learning',
    phase: 'D',
    finding: 'Hard tripwire interlock added in PLC Macro B at cycle 440 (10-cycle buffer before wear limit).',
    evidence: 'SOP #209 updated with a mandatory laser auto-offset check across all 4 CNC milling bays; 8D lesson indexed for RAG.',
    confidence: 0.96,
    citation: 'SOP #209 Rev 4.2 · 8D-INC-A389F1',
    timestamp: '2024-10-24T14:44:29Z',
  },
];

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

/** Real Blackboard findings when available; demo narrative only when the backend is unreachable. */
export function resolveFindings(incident: IncidentState | null): AgentFinding[] {
  if (incident?.findings?.length) return incident.findings;
  return incident ? [] : FALLBACK_FINDINGS;
}

/** Archived reference incident rendered when no live Blackboard snapshot exists. */
export const DEMO_INCIDENT: IncidentState = {
  incident_id: 'INC-A389F1',
  status: 'closed',
  status_reason: 'Archived reference incident (backend offline)',
  defect_type: 'scratch',
  defect_rate: 0.0342,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Tool T07 exceeded service life due to delayed automated tool-offset trigger in PLC sub-routine 14B.',
  verification_count: 50,
  verification_target: 50,
  repair_done: true,
  approved: false,
  findings: FALLBACK_FINDINGS,
  impact: {
    scrap_avoided: 142,
    downtime_minutes: 192,
    energy_kwh: 318,
    co2_kg: 1240,
    cost_savings_usd: 18460,
  },
  documents: {},
  updated_at: '2024-10-24T14:44:29Z',
};

export const PHASES: AndonPhaseDetails[] = [
  {
    key: 'A',
    letter: 'A',
    name: 'Detection',
    vietnameseName: 'Phát hiện',
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
    vietnameseName: 'Truy ngược & RCA',
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
    vietnameseName: 'Xử lý & Xác nhận',
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
    vietnameseName: 'Học hỏi',
    lampColor: 'green',
    lampHex: '#12a150',
    description: 'Knowledge-base ingestion, 8D report, impact calculation and shift-leader sign-off.',
    activities: ['Continuous Learning', 'Impact Calculator', 'Shift-leader approval'],
    inputs: ['Closed incident board', 'Emission benchmarks'],
    outputs: ['8D report', 'Scrap / CO₂ avoided', 'Sign-off recorded'],
    statuses: ['closed'],
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
  if (!incident) return false;
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
  closed: 'Closed',
  dismissed: 'Dismissed',
  escalated: 'Escalated',
  error: 'Error',
};

export const FALLBACK_FIVE_WHYS: FiveWhysStep[] = [
  {
    level: 1,
    why: 'Surface scratch on finished bore?',
    answer: 'Harmonic chatter and micro-deflection during finishing cut cycle.',
    evidence: 'Keyence Cam-EOL #8380',
    citation: 'ISO-9001:2015 §8.7',
  },
  {
    level: 2,
    why: 'Harmonic chatter generated?',
    answer: 'Spindle vibration spiked to 2.14 mm/s at 18,400 RPM resonant node.',
    evidence: 'FFT Accelerometer /telemetry',
    citation: 'ISO-10816-3 Std',
  },
  {
    level: 3,
    why: 'Vibration resonance occurred?',
    answer: 'Cutting insert T07 edge micro-chipping caused severe shearing friction.',
    evidence: 'Flank Wear Scan 0.32mm',
    citation: 'Tooling Spec T07-CARB',
  },
  {
    level: 4,
    why: 'Severe wear on carbide insert?',
    answer: 'Insert operated to cycle 482 without indexing (threshold 450 cycles).',
    evidence: 'Fanuc PLC Register #D1042',
    citation: 'Cycle Threshold Log',
  },
  {
    level: 5,
    why: 'Exceeded threshold without changeout?',
    answer: 'Auto tool-life offset counter trigger delayed in PLC sub-routine 14B due to unacknowledged calibration flag.',
    evidence: 'PLC Log 14:02:11',
    citation: 'Fanuc Macro B Rev 4.1',
  },
];

export const FALLBACK_ISHIKAWA: Record<string, string[]> = {
  Machine: ['Spindle bearing preload; T07 holder thermal deflection'],
  Method: ['Feed-rate override at 102%; delayed PLC sub-routine 14B'],
  Material: ['Ti-6Al-4V Grade 5 heat batch #B77402 nominal'],
  Man: ['Shift handover gap at cycle-450 warning event'],
  Measurement: ['Laser tool setter calibrated 14 days ago (valid)'],
  'Mother Nature': ['Bay 3B ambient 21.4 °C, controlled'],
};

/** Ishikawa categories flagged as causal in the fallback narrative. */
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
  if (!Number.isNaN(dStart.getTime()) && !Number.isNaN(dEnd.getTime()) && startRaw.includes('-') && endRaw.includes('-')) {
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

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

/** In-progress reference incident (post-repair verification) rendered when no live Blackboard snapshot exists. */
export const DEMO_ACTIVE_INCIDENT: IncidentState = {
  incident_id: 'INC-B71E42',
  status: 'verifying',
  status_reason: 'Post-repair verification streak in progress (backend offline)',
  defect_type: 'burr',
  defect_rate: 0.0386,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-03',
  suspect_tool: 'T12',
  root_cause: 'Coolant concentration fell to 4.1% after the dosing alarm was suppressed, causing built-up edge on drill T12.',
  verification_count: 18,
  verification_target: 50,
  repair_done: true,
  approved: false,
  impact: null,
  documents: {},
  updated_at: minutesAgo(0),
  findings: [
    {
      agent_id: 'quality_inspector',
      agent_name: 'Quality Inspector',
      phase: 'A',
      finding: 'Defect rate 3.86% breached UCL 3.00% — edge burr on the oil-gallery bore exit, parts #5512–#5519.',
      evidence: 'CAM-LINE01-EOL frames classified "burr" at 97.6% confidence; 300-part moving average crossed UCL at part #5517.',
      confidence: 0.976,
      citation: 'SPC-RULE-1 · ISO 13715',
      timestamp: minutesAgo(38),
    },
    {
      agent_id: 'traceability',
      agent_name: 'Traceability Agent',
      phase: 'B',
      finding: 'All burred serials share Op-30 on CNC-03 with tool T12; CNC-01 and CNC-02 cleared.',
      evidence: 'BigQuery genealogy join over lot #L9024-AL (32 pcs): 8/8 defects routed via CNC-03, 0/24 good parts flagged upstream.',
      confidence: 0.951,
      citation: 'bq://traceability.part_route',
      timestamp: minutesAgo(35),
    },
    {
      agent_id: 'process_analyst',
      agent_name: 'Process Analyst',
      phase: 'B',
      finding: 'CNC-03 spindle load +22% on the exit pass, coincident with the burr onset.',
      evidence: 'Motor current rose 11.8 → 14.4 A during Op-30 exit; vibration 1.62 mm/s vs 0.41 baseline; CNC-01/02 flat.',
      confidence: 0.902,
      citation: 'ISO-10816-3 Zone B',
      timestamp: minutesAgo(33),
    },
    {
      agent_id: 'root_cause',
      agent_name: 'Root Cause Agent',
      phase: 'B',
      finding: 'T12 edge wear from built-up edge — coolant concentration fell to 4.1% after the dosing alarm was suppressed.',
      evidence: 'Grounded in the OEM coolant manual + 8D-2024-017; field refractometer reading of 4.1% raised confidence 71.2% → 89.4%.',
      confidence: 0.894,
      citation: 'SOP-CL-07 §3.1 · 8D-2024-017',
      timestamp: minutesAgo(28),
      five_whys: [
        { level: 1, why: 'Burr on oil-gallery bore exit?', answer: 'Material tearing instead of shearing on the exit pass.', evidence: 'Keyence Cam-EOL #5517', citation: 'ISO 13715' },
        { level: 2, why: 'Material tearing on exit?', answer: 'Rounded cutting edge raised exit cutting force by 22%.', evidence: 'Spindle load /telemetry', citation: 'ISO-10816-3 Std' },
        { level: 3, why: 'Cutting edge rounded?', answer: 'Aluminium built-up edge wore through the T12 coating.', evidence: 'Edge scan 0.08mm BUE', citation: 'Tooling Spec T12-DLC' },
        { level: 4, why: 'Built-up edge formed?', answer: 'Coolant concentration dropped to 4.1% (spec 7–9%).', evidence: 'Refractometer log #C-311', citation: 'Coolant SOP-CL-07' },
        {
          level: 5,
          why: 'Coolant concentration dropped?',
          answer: 'Auto-dosing pump alarm was suppressed after a sensor fault on night shift.',
          evidence: 'PLC Log 02:47:19',
          citation: 'Fanuc Macro B Rev 4.1',
        },
      ],
      ishikawa: {
        Machine: ['Coolant dosing pump alarm suppressed'],
        Method: ['Alarm acknowledged without root-cause check'],
        Material: ['AlSi9Cu3 casting lot #L9024 nominal'],
        Man: ['Sensor fault cleared without escalation'],
        Measurement: ['Refractometer logged but not trended'],
        'Mother Nature': ['Bay 2 ambient 22.0 °C, controlled'],
      },
    },
    {
      agent_id: 'technician_copilot',
      agent_name: 'Technician Copilot',
      phase: 'C',
      finding: 'Drill T12 replaced, coolant topped up to 8.2%, dosing alarm re-armed.',
      evidence: 'Gemini Live session with Lena Ortiz (TECH-417); refractometer reading of 8.2% confirmed on camera.',
      confidence: 0.95,
      citation: 'Walkthrough #12 · SOP #214',
      timestamp: minutesAgo(16),
    },
  ],
};

/**
 * Open incident per Line-01 product. A live Blackboard incident is attributed to the active product;
 * the reference incidents appear only while the backend is unreachable (no snapshot at all).
 */
export function productIncidents(live: IncidentState | null): Record<string, IncidentState> {
  if (!live) return { [ACTIVE_PRODUCT]: DEMO_INCIDENT, 'Cylinder Head': DEMO_ACTIVE_INCIDENT };
  return live.status === 'normal' ? {} : { [ACTIVE_PRODUCT]: live };
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
