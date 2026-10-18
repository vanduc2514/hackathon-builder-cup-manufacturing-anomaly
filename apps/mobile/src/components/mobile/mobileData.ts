/**
 * Mock technician data for the mobile app (work orders, notifications, profile, AI replies).
 * Demo orders sit below the live incident order built by buildLiveOrder() from the backend state.
 */
import type {
  AiReason,
  EvidenceItem,
  LiveIncidentInfo,
  MobileNotification,
  NotificationTone,
  ProcessingInfo,
  SensorReading,
  TechnicianProfile,
  WorkKind,
  WorkOrder,
  WorkStage,
} from '../../types/mobile';
import type { TelemetryContext } from '../../hooks/useTelemetry';
import type { AgentFinding, AuthUser, IncidentState, IncidentSummary } from '../../types';

export const IMG = {
  lathe: '/mobile/lathe.jpg',
  mill: '/mobile/mill.jpg',
  insert: '/mobile/insert.jpg',
  spindle: '/mobile/spindle.jpg',
};



/** Empty fallback work order list; work orders are loaded dynamically from /api/incidents/history. */
export const INITIAL_WORK_ORDERS: WorkOrder[] = [];

/** Resolves the Shift Leader / approver identity. */
export function getLeadName(profile?: TechnicianProfile, incident?: IncidentState | null): string {
  const docApprover = incident?.documents?.approved_by;
  if (typeof docApprover === 'string' && docApprover.trim()) {
    return docApprover;
  }
  if (profile?.leadName && profile.leadName.trim()) {
    return profile.leadName;
  }
  return 'Shift Leader';
}

/** Formats snake_case defect strings for clear technician display. */
export function formatDefectName(defect?: string | null): string {
  if (!defect) return 'Defect';
  return defect
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolves plant layout location for a given equipment ID (front-end lookup; the backend has no layout). */
export function getMachineLocation(machine?: string | null): string {
  if (!machine) return 'Location not mapped';
  const m = machine.toUpperCase();
  if (m.includes('CNC-01') || m.includes('LATHE 01')) return 'Line 01 · Bay A';
  if (m.includes('CNC-02') || m.includes('LATHE 02')) return 'Line 02 · Bay C';
  if (m.includes('CNC-03') || m.includes('MILL 03')) return 'Line 03 · Bay B';
  if (m.includes('CNC-04') || m.includes('MILL 04')) return 'Line 04 · Bay B';
  if (m.includes('CNC-05') || m.includes('LATHE 05')) return 'Line 02 · Bay D';
  if (m.includes('IM-05')) return 'Line 05 · Bay E';
  return 'Location not mapped';
}

/** Formats a timestamp (ISO or time string) into local 24h time HH:mm in the user's timezone. */
export function formatTime(raw?: string | null): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  } catch {
    // fallback below
  }
  const match = raw.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  return match ? match[1] : raw;
}

/** Formats an order's creation or completion timestamp into clean local time for work cards. */
export function formatOrderTimestamp(raw?: string | null): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      if (isToday) {
        return timeStr;
      }
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const shortTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${dateStr}, ${shortTime}`;
    }
  } catch {
    // fallback below
  }
  const cleaned = raw.replace(/(\.\d{3})\d+/, '$1').replace(/\+$/, '');
  return cleaned;
}

function latestFinding(
  incident: IncidentState,
  match: (f: AgentFinding) => boolean,
): AgentFinding | undefined {
  for (let i = incident.findings.length - 1; i >= 0; i -= 1) {
    if (match(incident.findings[i])) return incident.findings[i];
  }
  return undefined;
}

const isRootCause = (f: AgentFinding) => f.agent_id === 'RCA';
const isCopilotRepair = (f: AgentFinding) => f.agent_id === 'COPILOT' && f.phase === 'Phase C - Resolution';
const isQuality = (f: AgentFinding) => f.agent_id === 'QA';

function toReason(f?: AgentFinding): AiReason | undefined {
  if (!f) return undefined;
  return {
    agentName: f.agent_name,
    finding: f.finding,
    evidence: f.evidence,
    citation: f.citation,
    timestamp: formatTime(f.timestamp),
    fiveWhys: f.five_whys,
  };
}

/** Root Cause Agent confidence in %, or null when the AI has not produced a root cause yet. */
export function getIncidentConfidence(incident?: IncidentState | null): number | null {
  if (!incident?.findings?.length) return null;
  const rca = latestFinding(incident, isRootCause);
  if (!rca) return null;
  return Math.round(rca.confidence <= 1 ? rca.confidence * 100 : rca.confidence);
}

function classify(incident: IncidentState): { kind: WorkKind; stage: WorkStage } {
  switch (incident.status) {
    case 'repairing':
      return { kind: 'fix', stage: 'active' };
    case 'verifying':
      return { kind: 'fix', stage: 'processing' };
    case 'closed':
    case 'pending_approval':
      // Learning done = product evidence passed; the lead still has to sign off before it is done.
      return { kind: 'fix', stage: incident.approved ? 'completed' : 'processing' };
    case 'dismissed':
      return { kind: 'evidence', stage: 'completed' };
    case 'escalated':
    case 'error':
      return { kind: incident.repair_done ? 'fix' : 'evidence', stage: 'processing' };
    default:
      // detecting, tracing, investigating, analyzing, awaiting_evidence
      return { kind: 'evidence', stage: 'active' };
  }
}

const ANALYSIS_LABEL: Partial<Record<IncidentState['status'], string>> = {
  detecting: 'confirming the defect',
  tracing: 'tracing affected parts',
  investigating: 'investigating the process',
  analyzing: 'analysing sensors and evidence',
};

function firstSentence(text: string, max = 72): string {
  const s = text.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function trendVs(value: number, reference?: number): SensorReading['trend'] {
  if (reference === undefined || reference === 0) return 'flat';
  if (value > reference * 1.05) return 'up';
  if (value < reference * 0.95) return 'down';
  return 'flat';
}

interface SensorSample {
  vibration: number;
  temperature: number;
  current: number;
  anomalous: boolean;
}

function buildSensors(
  incident: IncidentState,
  telemetry: TelemetryContext,
): { sensors: SensorReading[]; source: LiveIncidentInfo['sensorSource'] } {
  const tel = incident.latest_telemetry;
  const last = telemetry.history[telemetry.history.length - 1];
  let sample: SensorSample | undefined;
  let source: LiveIncidentInfo['sensorSource'] = 'none';
  if (tel) {
    sample = {
      vibration: tel.spindle_vibration,
      temperature: tel.spindle_temp,
      current: tel.motor_current,
      anomalous: tel.operating_status !== 'NORMAL',
    };
    source = 'stream';
  } else if (last) {
    sample = {
      vibration: last.vibration_mm_s,
      temperature: last.temperature_c,
      current: last.current_a,
      anomalous: last.is_anomalous,
    };
    source = 'history';
  }

  const b = telemetry.baseline;
  const sensors: SensorReading[] = [];
  if (sample) {
    const vibAlert = b ? sample.vibration >= b.vibration_warning_threshold : sample.anomalous;
    const curAlert = b ? sample.current >= b.current_warning_threshold : false;
    sensors.push(
      {
        label: 'Vibration',
        value: sample.vibration.toFixed(2),
        unit: 'mm/s',
        trend: trendVs(sample.vibration, b?.baseline.vibration),
        alert: vibAlert,
      },
      {
        label: 'Motor current',
        value: sample.current.toFixed(1),
        unit: 'A',
        trend: trendVs(sample.current, b?.baseline.current),
        alert: curAlert,
      },
      {
        label: 'Spindle temp',
        value: sample.temperature.toFixed(1),
        unit: '°C',
        trend: trendVs(sample.temperature, b?.baseline.temperature),
        // The backend defines no temperature threshold, so this tile never alerts.
        alert: false,
      },
    );
  }
  const overUcl = incident.defect_rate > incident.spc_ucl;
  sensors.push({
    label: 'Defect rate',
    value: (incident.defect_rate * 100).toFixed(1),
    unit: '%',
    trend: overUcl ? 'up' : 'flat',
    alert: overUcl,
  });
  return { sensors, source };
}

export interface LiveCapture {
  thumbnail: string;
  capturedAt: string;
}

/** The one photo the AI's `diagnostic_request` asks for. */
export const LIVE_PHOTO_ITEM_ID = 'live-photo';

const PHOTO_GUIDANCE = [
  'Stop the machine and lock it out before opening the guard',
  'Hold the phone about 10 cm from the part the AI asked about',
  'Make sure that area is sharp and well lit',
];

function buildEvidence(
  incident: IncidentState,
  telemetry: TelemetryContext,
  captures: Record<string, LiveCapture>,
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const tel = incident.latest_telemetry;
  const history = telemetry.history;
  if (tel || history.length) {
    const vib = tel ? tel.spindle_vibration : history[history.length - 1].vibration_mm_s;
    items.push({
      id: 'live-sensor',
      label: 'Spindle vibration',
      hint: `${vib.toFixed(2)} mm/s${telemetry.baseline ? ` · limit ${telemetry.baseline.vibration_warning_threshold}` : ''}`,
      mediaType: 'photo',
      captured: true,
      source: 'sensor',
      capturedAt: tel ? formatTime(tel.timestamp) : history[history.length - 1] ? formatTime(history[history.length - 1].timestamp) : undefined,
      series: history.slice(-14).map((p) => p.vibration_mm_s),
    });
  }
  const alerts = incident.telemetry_alerts ?? [];
  if (alerts.length) {
    const a = alerts[alerts.length - 1];
    items.push({
      id: 'live-alerts',
      label: `${alerts.length} sensor alert${alerts.length > 1 ? 's' : ''}`,
      hint: `${a.metric_name} ${a.metric_value.toFixed(2)} > ${a.threshold}`,
      mediaType: 'photo',
      captured: true,
      source: 'sensor',
      capturedAt: formatTime(a.timestamp),
    });
  }
  if (incident.visual_evidence) {
    const v = incident.visual_evidence;
    items.push({
      id: 'live-visual',
      label: 'Your photo · AI read',
      hint: v.wear_measurement_mm != null ? `Wear ${v.wear_measurement_mm} mm` : v.defect_detected ? 'Defect confirmed' : 'No defect seen',
      mediaType: 'photo',
      captured: true,
      source: 'technician',
      capturedAt: formatTime(v.timestamp),
    });
  }
  const capture = captures[LIVE_PHOTO_ITEM_ID];
  if (incident.status === 'awaiting_evidence' || capture) {
    items.push({
      id: LIVE_PHOTO_ITEM_ID,
      label: 'Photo requested by AI',
      hint: 'Close-up · see the AI request above',
      mediaType: 'photo',
      captured: Boolean(capture),
      source: capture ? 'technician' : undefined,
      thumbnail: capture?.thumbnail,
      capturedAt: capture?.capturedAt,
      guidance: PHOTO_GUIDANCE,
    });
  } else if (items.length === 0) {
    // Early stages (detecting/tracing/investigating/analyzing) with no telemetry:
    // show a placeholder so the evidence screen is not blank.
    items.push({
      id: 'waiting-for-ai',
      label: 'Waiting for AI analysis',
      hint: 'The AI is still analysing the anomaly. You will be notified when a photo is needed.',
      mediaType: 'photo',
      captured: false,
      source: 'sensor',
    });
  }
  return items;
}

/** Builds the work order that mirrors the backend incident, or null when the line is normal. */
export function buildLiveOrder(
  incident: IncidentState | null | undefined,
  leadName: string,
  telemetry: TelemetryContext,
  captures: Record<string, LiveCapture> = {},
): WorkOrder | null {
  if (!incident || !incident.incident_id || incident.status === 'normal' || incident.archived) return null;

  const { kind, stage } = classify(incident);
  const status = incident.status;
  const machine = incident.suspect_machine ?? 'Machine not identified yet';
  const defectName = formatDefectName(incident.defect_type);
  const rca = latestFinding(incident, isRootCause);
  const copilot = latestFinding(incident, isCopilotRepair);
  const quality = latestFinding(incident, isQuality);
  const { sensors, source } = buildSensors(incident, telemetry);
  const rateText = `${(incident.defect_rate * 100).toFixed(1)}% vs UCL ${(incident.spc_ucl * 100).toFixed(1)}%`;

  let title: string;
  let summary: string;
  if (kind === 'evidence') {
    title = incident.defect_type ? `Investigate ${defectName}` : 'Investigate quality alert';
    if (status === 'dismissed') {
      summary = incident.status_reason ?? 'No anomaly confirmed.';
    } else if (status === 'escalated' || status === 'error') {
      summary = incident.status_reason ?? 'The AI could not reach a confident root cause.';
    } else if (incident.diagnostic_request) {
      summary = incident.diagnostic_request;
    } else {
      summary = `AI is ${ANALYSIS_LABEL[status] ?? 'working on this incident'}. Defect rate ${rateText}.`;
    }
  } else {
    title = incident.root_cause ? `Fix: ${firstSentence(incident.root_cause)}` : `Repair ${defectName}`;
    summary = incident.root_cause ?? `Root cause confirmed on ${machine}.`;
  }

  let aiRequest: string | undefined;
  if (kind === 'evidence') {
    if (incident.diagnostic_request) aiRequest = incident.diagnostic_request;
    else if (incident.visual_evidence) aiRequest = 'Your photo was received. The AI is re-analysing the root cause.';
    else aiRequest = 'The AI has not asked for field evidence yet. You will get a notification when it does.';
  }

  let processing: ProcessingInfo | undefined;
  if (stage === 'processing') {
    let aiNote: string;
    if (status === 'escalated' || status === 'error') {
      aiNote = `Escalated: ${incident.status_reason ?? 'see the incident board'}`;
    } else if (status === 'closed' || status === 'pending_approval') {
      aiNote = quality?.finding ?? `${incident.verification_count} consecutive good parts verified.`;
    } else {
      aiNote = copilot?.finding ?? 'Inline camera is checking parts after the repair.';
    }
    processing = {
      submittedAt: incident.updated_at,
      verified: incident.verification_count,
      target: incident.verification_target,
      lead: leadName,
      aiNote,
    };
  }

  let outcome: string | undefined;
  let completedAt: string | undefined;
  if (stage === 'completed') {
    completedAt = incident.updated_at;
    if (status === 'dismissed') {
      outcome = `Dismissed · ${incident.status_reason ?? 'No anomaly confirmed'}`;
    } else {
      const scrap = incident.impact ? ` · ${incident.impact.scrap_avoided} scrap avoided` : '';
      outcome = `${incident.verification_count} good parts in a row (target ${incident.verification_target}) · Approved by ${leadName}${scrap}`;
    }
  }

  const overUcl = incident.defect_rate > incident.spc_ucl;
  const docs = incident.documents ?? {};

  return {
    id: incident.incident_id,
    kind,
    stage,
    priority: status === 'escalated' || status === 'error' || overUcl ? 'P1' : 'P2',
    title,
    machine,
    location: getMachineLocation(incident.suspect_machine),
    summary,
    image: machine.toUpperCase().startsWith('IM') ? IMG.insert : IMG.lathe,
    aiConfidence: getIncidentConfidence(incident),
    createdAt: incident.opened_at ?? incident.findings[0]?.timestamp ?? incident.updated_at,
    rootCause: incident.root_cause ?? undefined,
    suspectTool: incident.suspect_tool ?? undefined,
    aiRequest,
    sensors,
    evidence: kind === 'evidence' ? buildEvidence(incident, telemetry, captures) : [],
    steps: [],
    partsNeeded: [],
    processing,
    completedAt,
    outcome,
    statusReason: incident.status_reason ?? undefined,
    live: {
      status,
      canSubmitEvidence: status === 'awaiting_evidence',
      repairDone: Boolean(incident.repair_done),
      approved: incident.approved,
      defectRate: incident.defect_rate,
      verificationCount: incident.verification_count,
      verificationTarget: incident.verification_target,
      spcUcl: incident.spc_ucl,
      reason: toReason(rca),
      copilotNote: toReason(copilot),
      workOrderText: typeof docs.work_order === 'string' ? docs.work_order : undefined,
      report8d: typeof docs.report_8d === 'string' ? docs.report_8d : undefined,
      sopProposal: typeof docs.sop_proposal === 'string' ? docs.sop_proposal : undefined,
      visualEvidence: incident.visual_evidence,
      impact: incident.impact,
      sensorSource: source,
    },
  };
}

/** Puts the live incident order at the top of the list; demo orders stay below it. */
export function applyIncident(
  orders: WorkOrder[],
  incident: IncidentState | null | undefined,
  leadName: string,
  telemetry: TelemetryContext,
  captures: Record<string, LiveCapture> = {},
): WorkOrder[] {
  const live = buildLiveOrder(incident, leadName, telemetry, captures);
  if (!live) return orders;
  return [live, ...orders.filter((o) => o.id !== live.id)];
}

/** Converts an IncidentSummary from /api/incidents/history to a WorkOrder card. */
export function summaryToWorkOrder(summary: IncidentSummary, leadName: string): WorkOrder {
  const machine = summary.suspect_machine ?? 'Machine not identified yet';
  const defectName = formatDefectName(summary.defect_type);
  const status = summary.status;

  let stage: WorkStage;
  if (summary.approved || status === 'closed' || status === 'dismissed') {
    stage = 'completed';
  } else if (summary.repair_done || status === 'verifying' || status === 'pending_approval') {
    stage = 'processing';
  } else {
    stage = 'active';
  }

  const kind: WorkKind =
    summary.repair_done || status === 'repairing' || status === 'verifying' || status === 'closed' || status === 'pending_approval' || Boolean(summary.root_cause)
      ? 'fix'
      : 'evidence';

  let title: string;
  let summaryText: string;
  if (kind === 'evidence') {
    title = summary.defect_type ? `Investigate ${defectName}` : 'Investigate quality alert';
    summaryText = summary.status_reason ?? `Defect rate ${(summary.defect_rate * 100).toFixed(1)}% vs UCL ${(summary.spc_ucl * 100).toFixed(1)}%`;
  } else {
    title = summary.root_cause ? `Fix: ${firstSentence(summary.root_cause)}` : `Repair ${defectName}`;
    summaryText = summary.root_cause ?? summary.status_reason ?? `Root cause confirmed on ${machine}.`;
  }

  let processing: ProcessingInfo | undefined;
  if (stage === 'processing') {
    processing = {
      submittedAt: summary.updated_at ? formatTime(summary.updated_at) : 'Recent',
      verified: summary.verification_count,
      target: summary.verification_target,
      lead: leadName,
      aiNote: 'Inline camera is checking parts after the repair.',
    };
  }

  let outcome: string | undefined;
  let completedAt: string | undefined;
  if (stage === 'completed') {
    completedAt = summary.closed_at ?? summary.updated_at ?? 'Completed';
    if (status === 'dismissed') {
      outcome = `Dismissed · ${summary.status_reason ?? 'No anomaly confirmed'}`;
    } else {
      const scrap = summary.impact ? ` · ${summary.impact.scrap_avoided} scrap avoided` : '';
      outcome = `${summary.verification_count}/${summary.verification_target} parts verified · ${summary.approved ? `Approved by ${leadName}` : 'Closed'}${scrap}`;
    }
  }

  const overUcl = summary.defect_rate > summary.spc_ucl;
  const isP1 = summary.severity === 'critical' || summary.severity === 'high' || status === 'escalated' || overUcl;
  const isP2 = summary.severity === 'medium';

  return {
    id: summary.incident_id,
    kind,
    stage,
    priority: isP1 ? 'P1' : isP2 ? 'P2' : 'P3',
    title,
    machine,
    location: getMachineLocation(summary.suspect_machine),
    summary: summaryText,
    image: machine.toUpperCase().startsWith('IM') ? IMG.insert : IMG.lathe,
    aiConfidence: summary.root_cause ? 92 : null,
    createdAt: summary.opened_at ?? summary.updated_at ?? 'Today',
    rootCause: summary.root_cause ?? undefined,
    suspectTool: summary.suspect_tool ?? undefined,
    aiRequest: kind === 'evidence' ? summaryText : undefined,
    sensors: [],
    evidence: [],
    steps: [],
    partsNeeded: [],
    processing,
    completedAt,
    outcome,
    statusReason: summary.status_reason ?? undefined,
  };
}

/** Generates notifications from past and recent incidents. */
export function buildHistoryNotifications(history: IncidentSummary[]): MobileNotification[] {
  if (!history || history.length === 0) return [];
  return history.slice(0, 10).map((inc, idx) => {
    const isToday = idx < 5;
    let icon = 'notifications';
    let tone: NotificationTone = 'blue';
    let title = `Incident ${inc.incident_id}`;
    let body = inc.status_reason || (inc.defect_type ? `Defect ${formatDefectName(inc.defect_type)}` : 'System notice');

    if (inc.status === 'closed' || inc.approved) {
      icon = 'verified';
      tone = 'green';
      title = `Approved · ${inc.suspect_machine ?? 'Equipment'}`;
      body = `Verification completed (${inc.verification_count}/${inc.verification_target} parts). Closed.`;
    } else if (inc.status === 'pending_approval') {
      icon = 'task_alt';
      tone = 'blue';
      title = `Awaiting sign-off · ${inc.suspect_machine ?? 'Equipment'}`;
      body = `Verification completed (${inc.verification_count}/${inc.verification_target} parts). Waiting for the shift leader.`;
    } else if (inc.status === 'awaiting_evidence') {
      icon = 'photo_camera';
      tone = 'red';
      title = `Evidence needed · ${inc.suspect_machine ?? 'Equipment'}`;
      body = inc.root_cause || 'AI requests visual inspection photos.';
    } else if (inc.status === 'repairing') {
      icon = 'build';
      tone = 'indigo';
      title = `Repair in progress · ${inc.suspect_machine ?? 'Equipment'}`;
      body = inc.root_cause || 'Corrective action assigned.';
    } else if (inc.status === 'verifying') {
      icon = 'fact_check';
      tone = 'blue';
      title = `Verification running · ${inc.suspect_machine ?? 'Equipment'}`;
      body = `${inc.verification_count} of ${inc.verification_target} parts verified so far.`;
    } else if (inc.status === 'escalated' || inc.status === 'error') {
      icon = 'warning';
      tone = 'red';
      title = `Escalated · ${inc.suspect_machine ?? 'Equipment'}`;
      body = inc.status_reason || 'Shift leader intervention required.';
    }

    return {
      id: `hist-${inc.incident_id}-${idx}`,
      icon,
      tone,
      title,
      body,
      time: inc.closed_at ? 'Closed' : inc.opened_at ? 'Recent' : 'Today',
      group: isToday ? 'Today' : 'Earlier',
      unread: !inc.closed_at && !inc.approved,
      workId: inc.incident_id,
    };
  });
}

/** Fallback empty notification list; real notifications are derived from history & SSE. */
export const INITIAL_NOTIFICATIONS: MobileNotification[] = [];

/** Constructs technician profile from authenticated session user. */
export function createTechnicianProfile(user?: AuthUser | null): TechnicianProfile {
  const isLead = user?.role === 'shift_leader';
  return {
    employeeId: user?.username ? `EMP-${user.username.toUpperCase()}` : 'TECH-0427',
    name: user?.display_name || (isLead ? 'Shift Leader' : 'Maintenance Technician'),
    role: isLead ? 'Shift Leader' : 'Maintenance Technician',
    shift: 'Shift A · 06:00–14:00',
    bay: 'Bay 4',
    leadName: isLead ? 'Plant Manager' : 'Shift Leader (Duty)',
    language: 'vi-VN',
    voiceGuidance: true,
    pushAlerts: true,
    haptics: true,
  };
}

export const INITIAL_PROFILE: TechnicianProfile = createTechnicianProfile(null);

