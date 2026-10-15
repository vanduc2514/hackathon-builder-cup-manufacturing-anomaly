/**
 * Mock technician data for the mobile app (work orders, notifications, profile, AI replies).
 * Demo orders sit below the live incident order built by buildLiveOrder() from the backend state.
 */
import type {
  AiReason,
  EvidenceItem,
  LiveIncidentInfo,
  MobileNotification,
  ProcessingInfo,
  RepairStep,
  SensorReading,
  TechnicianProfile,
  WorkKind,
  WorkOrder,
  WorkStage,
} from '../../types/mobile';
import type { TelemetryContext } from '../../hooks/useTelemetry';
import { getRepairParts, getRepairSteps } from './oemRepairManuals';
import type { AgentFinding, IncidentState } from '../../types';

export const IMG = {
  lathe: '/mobile/lathe.jpg',
  mill: '/mobile/mill.jpg',
  insert: '/mobile/insert.jpg',
  spindle: '/mobile/spindle.jpg',
};

const COLLAR_STEPS: RepairStep[] = [
  {
    id: 1,
    title: 'Isolate power & lock out spindle',
    instruction: 'Switch Bay C breaker #04 OFF, attach your padlock and confirm zero energy.',
    instructionVi: 'Ngắt CB #04 khu C, khóa an toàn và xác nhận không còn điện.',
    target: '0.0 V',
    tolerance: 'Zero energy',
    reference: 'SOP-LOTO §2.1',
    copilotVi: 'Tôi thấy CB đã ở vị trí OFF. Hãy gắn ổ khóa rồi chạm đồng hồ đo vào cực L1.',
    copilotEn: 'Breaker is OFF. Attach your lock, then touch the meter to terminal L1.',
  },
  {
    id: 2,
    title: 'Remove cracked collar & O-ring',
    instruction: 'Loosen the 4× M6 hex bolts, slide the collar out and clean the seating face.',
    instructionVi: 'Tháo 4 bu-lông M6, rút vòng kẹp ra và lau sạch mặt tựa.',
    target: 'Clean seat',
    tolerance: 'No debris',
    reference: 'OEM v4.2 §8.2',
    copilotVi: 'Có vết mạt kim loại ở góc 2 giờ. Lau sạch trước khi lắp vòng mới.',
    copilotEn: 'Metal chips at the 2 o’clock position. Wipe them before fitting the new collar.',
  },
  {
    id: 3,
    title: 'Tighten collar bolts to 45 Nm',
    instruction: 'Fit the new collar, then tighten in a star pattern 1-3-2-4 in two passes.',
    instructionVi: 'Lắp vòng mới, siết chéo theo thứ tự 1-3-2-4 qua hai lượt.',
    target: '45.0 Nm',
    tolerance: '± 1.5 Nm',
    reference: 'OEM v4.2 §8.4',
    copilotVi: 'Đã nhận diện ốc số 2. Chuyển sang ốc số 4 đối diện, siết ở mức 45 Nm.',
    copilotEn: 'Bolt 2 confirmed. Move to bolt 4 on the opposite side, tighten to 45 Nm.',
  },
  {
    id: 4,
    title: 'Check spindle runout',
    instruction: 'Sweep the dial indicator through a full 360° turn of the spindle.',
    instructionVi: 'Quay trục chính 360° và đọc đồng hồ so.',
    target: '< 0.015 mm',
    tolerance: 'Radial runout',
    reference: 'OEM v4.2 §9.1',
    copilotVi: 'Giá trị đọc 0.008 mm — đạt yêu cầu. Bạn có thể tiếp tục.',
    copilotEn: 'Reading 0.008 mm — within spec. You can continue.',
  },
  {
    id: 5,
    title: 'Dry run at 500 RPM',
    instruction: 'Run the spindle for 10 s with no load and keep the camera on the toolhead.',
    instructionVi: 'Chạy không tải 500 RPM trong 10 giây, giữ camera hướng vào đầu dao.',
    target: '< 0.8 mm/s',
    tolerance: 'RMS vibration',
    reference: 'QA-VIB-03',
    copilotVi: 'Rung động 0.41 mm/s, ổn định. Sửa chữa hoàn tất.',
    copilotEn: 'Vibration 0.41 mm/s and steady. Repair complete.',
  },
];

const NOZZLE_STEPS: RepairStep[] = [
  {
    id: 1,
    title: 'Stop coolant pump',
    instruction: 'Press coolant OFF on the HMI and wait for flow to stop.',
    instructionVi: 'Tắt bơm dung dịch trên màn hình HMI và chờ ngừng chảy.',
    target: '0 bar',
    tolerance: 'Line pressure',
    reference: 'SOP-CL-01',
    copilotVi: 'Áp suất đã về 0. Bạn có thể tháo đầu phun.',
    copilotEn: 'Pressure is at 0. You can remove the nozzle.',
  },
  {
    id: 2,
    title: 'Flush nozzle manifold',
    instruction: 'Remove nozzle #3 and blow out chips with compressed air.',
    instructionVi: 'Tháo đầu phun số 3 và thổi sạch phoi bằng khí nén.',
    target: 'Clear bore',
    tolerance: 'No blockage',
    reference: 'SOP-CL-01 §3',
    copilotVi: 'Lỗ phun đã thông. Lắp lại và siết tay.',
    copilotEn: 'Bore is clear. Refit and hand-tighten.',
  },
  {
    id: 3,
    title: 'Restart & confirm pressure',
    instruction: 'Turn coolant ON and confirm pressure on the gauge.',
    instructionVi: 'Bật lại bơm và kiểm tra áp suất trên đồng hồ.',
    target: '14.0 bar',
    tolerance: '± 0.5 bar',
    reference: 'SOP-CL-01 §4',
    copilotVi: 'Áp suất 14.2 bar — đạt. Hoàn tất.',
    copilotEn: 'Pressure 14.2 bar — OK. Done.',
  },
];

export const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'INC-8924',
    kind: 'evidence',
    stage: 'active',
    priority: 'P1',
    title: 'Spindle vibration drift',
    machine: 'CNC Mill 04',
    location: 'Line 04 · Bay B',
    summary: 'Vibration at 3,450 RPM is 18 dB over baseline. AI needs photos to confirm the cause.',
    image: IMG.mill,
    aiConfidence: 64,
    createdAt: '10 min ago',
    estMinutes: 8,
    rootCause: 'Possible micro-crack or heat damage on the cutting insert',
    suspectTool: 'Carbide insert WNMG-080408',
    aiRequest:
      'I can’t tell yet if this is a cracked insert or a loose collar. A close-up of the insert edge and a short clip of the spindle running will settle it.',
    sensors: [
      { label: 'Vibration', value: '4.8', unit: 'mm/s', trend: 'up', alert: true },
      { label: 'Spindle temp', value: '61', unit: '°C', trend: 'up', alert: false },
      { label: 'Defect rate', value: '2.1', unit: '%', trend: 'up', alert: true },
    ],
    evidence: [
      {
        id: 'e1',
        label: 'Vibration spectrum',
        hint: 'Peak at 172 Hz',
        mediaType: 'photo',
        captured: true,
        source: 'sensor',
        capturedAt: '14:02',
      },
      {
        id: 'e2',
        label: 'Inline camera frame',
        hint: 'Chatter marks on part #3381',
        mediaType: 'photo',
        captured: true,
        source: 'camera',
        thumbnail: IMG.mill,
        capturedAt: '14:05',
      },
      {
        id: 'e3',
        label: 'Insert cutting edge',
        hint: 'Close-up photo · 45° angle',
        mediaType: 'photo',
        captured: false,
        guidance: [
          'Stop the spindle and open the guard',
          'Hold the phone about 10 cm from the insert',
          'Tilt 45° so the light hits the cutting edge',
        ],
      },
      {
        id: 'e4',
        label: 'Collar seating face',
        hint: 'Photo · straight on',
        mediaType: 'photo',
        captured: false,
        guidance: [
          'Point straight at the clamping collar',
          'Make sure all 4 bolts are in frame',
          'Turn on the flash if it’s dark',
        ],
      },
      {
        id: 'e5',
        label: 'Spindle running',
        hint: 'Video · 10 s at 500 RPM',
        mediaType: 'video',
        captured: false,
        guidance: [
          'Close the guard and run at 500 RPM',
          'Keep the phone steady on the toolhead',
          'Record at least 10 seconds with sound',
        ],
      },
    ],
    steps: [],
    partsNeeded: [],
  },
  {
    id: 'INC-8919',
    kind: 'fix',
    stage: 'active',
    priority: 'P1',
    title: 'Replace collar & torque bolts',
    machine: 'CNC Lathe 02',
    location: 'Line 02 · Bay C',
    summary: 'Cracked clamping collar is causing toolhead chatter. Parts are ready in Locker 3B.',
    image: IMG.lathe,
    aiConfidence: 92,
    createdAt: '25 min ago',
    estMinutes: 25,
    rootCause: 'Micro-crack in clamping collar causing runout',
    suspectTool: 'Carbide insert T-410 · ISO 40 holder',
    sensors: [
      { label: 'Vibration', value: '3.9', unit: 'mm/s', trend: 'up', alert: true },
      { label: 'Runout', value: '0.047', unit: 'mm', trend: 'up', alert: true },
      { label: 'Spindle temp', value: '58', unit: '°C', trend: 'flat', alert: false },
    ],
    evidence: [],
    steps: COLLAR_STEPS,
    partsNeeded: ['Clamping collar CL-40 (×1)', 'O-ring 42×2 mm (×1)', 'Torque wrench 20–100 Nm'],
  },
  {
    id: 'INC-8927',
    kind: 'fix',
    stage: 'active',
    priority: 'P3',
    title: 'Clear clogged coolant nozzle',
    machine: 'CNC Lathe 05',
    location: 'Line 02 · Bay D',
    summary: 'Coolant pressure dropped to 9 bar. Nozzle #3 is likely blocked with chips.',
    image: IMG.insert,
    aiConfidence: 88,
    createdAt: '1 h ago',
    estMinutes: 10,
    rootCause: 'Chip build-up in nozzle #3',
    suspectTool: 'Coolant manifold N-3',
    sensors: [
      { label: 'Coolant', value: '9.1', unit: 'bar', trend: 'down', alert: true },
      { label: 'Tool temp', value: '74', unit: '°C', trend: 'up', alert: false },
      { label: 'Defect rate', value: '0.6', unit: '%', trend: 'flat', alert: false },
    ],
    evidence: [],
    steps: NOZZLE_STEPS,
    partsNeeded: ['Compressed air gun', 'Nozzle wrench 13 mm'],
  },
  {
    id: 'INC-8916',
    kind: 'fix',
    stage: 'processing',
    priority: 'P2',
    title: 'Bearing preload adjusted',
    machine: 'CNC Lathe 01',
    location: 'Line 01 · Bay A',
    summary: 'Repair done. Inline camera is checking the next 50 parts before the lead signs off.',
    image: IMG.spindle,
    aiConfidence: 90,
    createdAt: '2 h ago',
    estMinutes: 0,
    sensors: [],
    evidence: [],
    steps: [],
    partsNeeded: [],
    processing: {
      submittedAt: '12:40',
      verified: 38,
      target: 50,
      lead: 'Tuan Nguyen',
      aiNote: 'Vibration back to 0.42 mm/s. No defects in the last 38 parts.',
    },
  },
  {
    id: 'INC-8902',
    kind: 'fix',
    stage: 'completed',
    priority: 'P2',
    title: 'Spindle collar re-seated',
    machine: 'Haas ST-10',
    location: 'Line 03',
    summary: 'Replaced collar and insert. Runout now 0.008 mm.',
    image: IMG.lathe,
    aiConfidence: 95,
    createdAt: 'Today',
    estMinutes: 0,
    sensors: [],
    evidence: [],
    steps: [],
    partsNeeded: [],
    completedAt: '11:30',
    outcome: '50/50 parts passed · Approved by Shift Leader',
  },
  {
    id: 'INC-8898',
    kind: 'evidence',
    stage: 'completed',
    priority: 'P3',
    title: 'Coolant flow photos',
    machine: 'CNC Lathe 02',
    location: 'Line 02',
    summary: 'Photos confirmed swarf in manifold. Ticket handed to maintenance.',
    image: IMG.insert,
    aiConfidence: 91,
    createdAt: 'Today',
    estMinutes: 0,
    sensors: [],
    evidence: [],
    steps: [],
    partsNeeded: [],
    completedAt: '09:15',
    outcome: 'Root cause confirmed · AI confidence 91%',
  },
  {
    id: 'INC-8890',
    kind: 'fix',
    stage: 'completed',
    priority: 'P3',
    title: 'Belt tension adjusted',
    machine: 'CNC Mill 03',
    location: 'Line 04',
    summary: 'Re-tensioned spindle belt to 180 Hz.',
    image: IMG.mill,
    aiConfidence: 89,
    createdAt: 'Yesterday',
    estMinutes: 0,
    sensors: [],
    evidence: [],
    steps: [],
    partsNeeded: [],
    completedAt: 'Yesterday 16:45',
    outcome: '50/50 parts passed · Approved by Shift Leader',
  },
];

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
    timestamp: f.timestamp,
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
      // Closed = product evidence passed; the lead still has to sign off before it is done.
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
      capturedAt: tel ? tel.timestamp.slice(11, 16) : history[history.length - 1].timestamp.slice(11, 16),
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
      capturedAt: a.timestamp.slice(11, 16),
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
      capturedAt: v.timestamp.slice(11, 16),
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
  if (!incident || !incident.incident_id || incident.status === 'normal') return null;

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
    } else if (status === 'closed') {
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
    createdAt: incident.findings[0]?.timestamp ?? incident.updated_at,
    rootCause: incident.root_cause ?? undefined,
    suspectTool: incident.suspect_tool ?? undefined,
    aiRequest,
    sensors,
    evidence: kind === 'evidence' ? buildEvidence(incident, telemetry, captures) : [],
    steps: getRepairSteps(incident.suspect_machine),
    partsNeeded: getRepairParts(incident.suspect_machine),
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

export const INITIAL_NOTIFICATIONS: MobileNotification[] = [
  {
    id: 'n1',
    icon: 'photo_camera',
    tone: 'red',
    title: 'Evidence needed · CNC Mill 04',
    body: 'AI is 64% sure. Take 2 photos and 1 short video.',
    time: '2m',
    group: 'Today',
    unread: true,
    workId: 'INC-8924',
  },
  {
    id: 'n2',
    icon: 'build',
    tone: 'indigo',
    title: 'New repair assigned',
    body: 'Replace collar on CNC Lathe 02. Parts in Locker 3B.',
    time: '25m',
    group: 'Today',
    unread: true,
    workId: 'INC-8919',
  },
  {
    id: 'n3',
    icon: 'fact_check',
    tone: 'blue',
    title: 'Verification running',
    body: '38 of 50 parts passed on CNC Lathe 01.',
    time: '1h',
    group: 'Today',
    unread: false,
    workId: 'INC-8916',
  },
  {
    id: 'n4',
    icon: 'verified',
    tone: 'green',
    title: 'Approved by Shift Leader',
    body: 'Spindle collar re-seat on Haas ST-10 is closed.',
    time: '3h',
    group: 'Today',
    unread: false,
    workId: 'INC-8902',
  },
  {
    id: 'n5',
    icon: 'schedule',
    tone: 'orange',
    title: 'Shift handover in 30 min',
    body: 'Add notes to any open work before 18:00.',
    time: 'Yesterday',
    group: 'Earlier',
    unread: false,
  },
];

export const INITIAL_PROFILE: TechnicianProfile = {
  employeeId: 'TECH-0427',
  role: 'Maintenance Technician',
  phone: '+84 90 123 4567',
  email: 'technician@apex-factory.vn',
  shift: 'Shift A · 06:00–14:00',
  bay: 'Bay 4',
  leadName: 'Shift Leader (Duty)',
  language: 'vi-VN',
  voiceGuidance: true,
  pushAlerts: true,
  haptics: true,
};

