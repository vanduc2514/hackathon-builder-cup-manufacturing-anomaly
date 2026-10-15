/**
 * Domain types for the Technician mobile app (work orders, evidence, repair steps,
 * notifications, chat). Front-end view models derived from the incident stream.
 */
import type {
  FiveWhysStep,
  ImpactMetrics,
  IncidentStatus,
  VisualEvidencePayload,
} from './index';

export type WorkStage = 'active' | 'processing' | 'completed';

/** `evidence` = AI needs more field proof; `fix` = root cause known, repair needed. */
export type WorkKind = 'evidence' | 'fix';

export type Priority = 'P1' | 'P2' | 'P3';

export type MediaType = 'photo' | 'video';

export type EvidenceSource = 'sensor' | 'camera' | 'technician';

export interface EvidenceItem {
  id: string;
  label: string;
  hint: string;
  mediaType: MediaType;
  captured: boolean;
  source?: EvidenceSource;
  thumbnail?: string;
  capturedAt?: string;
  guidance?: string[];
  /** Real sensor samples (e.g. vibration history) drawn as bars instead of a photo. */
  series?: number[];
}

export interface RepairStep {
  id: number;
  title: string;
  instruction: string;
  instructionVi: string;
  target: string;
  tolerance?: string;
  reference: string;
  /** Scripted copilot lines, only on demo work orders. Live orders use Gemini Live. */
  copilotVi?: string;
  copilotEn?: string;
}

export interface SensorReading {
  label: string;
  value: string;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  alert: boolean;
}

export interface ProcessingInfo {
  submittedAt: string;
  verified: number;
  target: number;
  lead: string;
  aiNote: string;
}

/** A finding the AI produced, shown as "Why the AI flagged this". */
export interface AiReason {
  agentName: string;
  finding: string;
  evidence: string;
  citation: string;
  timestamp: string;
  fiveWhys?: FiveWhysStep[];
}

/** Backend facts attached to the work order that mirrors the live incident. */
export interface LiveIncidentInfo {
  status: IncidentStatus;
  /** True only while the backend is in `awaiting_evidence`; uploads at other times would reset the workflow status. */
  canSubmitEvidence: boolean;
  repairDone: boolean;
  approved: boolean;
  defectRate: number;
  verificationCount: number;
  verificationTarget: number;
  spcUcl: number;
  reason?: AiReason;
  copilotNote?: AiReason;
  workOrderText?: string;
  report8d?: string;
  sopProposal?: string;
  visualEvidence?: VisualEvidencePayload | null;
  impact?: ImpactMetrics | null;
  sensorSource: 'stream' | 'history' | 'none';
}

export interface WorkOrder {
  id: string;
  kind: WorkKind;
  stage: WorkStage;
  priority: Priority;
  title: string;
  machine: string;
  location: string;
  summary: string;
  image: string;
  /** Root Cause Agent confidence in %, or null when the AI has not produced one yet. */
  aiConfidence: number | null;
  createdAt: string;
  /** Estimated minutes; only demo orders carry one (the backend has no estimate). */
  estMinutes?: number;
  rootCause?: string;
  suspectTool?: string;
  aiRequest?: string;
  sensors: SensorReading[];
  evidence: EvidenceItem[];
  steps: RepairStep[];
  partsNeeded: string[];
  processing?: ProcessingInfo;
  completedAt?: string;
  outcome?: string;
  statusReason?: string;
  /** Present only on the order that mirrors the backend incident. */
  live?: LiveIncidentInfo;
}

export type NotificationTone = 'red' | 'orange' | 'blue' | 'green' | 'indigo';

export interface MobileNotification {
  id: string;
  icon: string;
  tone: NotificationTone;
  title: string;
  body: string;
  time: string;
  group: 'Today' | 'Earlier';
  unread: boolean;
  workId?: string;
}

export interface TechnicianProfile {
  employeeId: string;
  role: string;
  phone: string;
  email: string;
  shift: string;
  bay: string;
  leadName?: string;
  language: 'vi-VN' | 'en-US';
  voiceGuidance: boolean;
  pushAlerts: boolean;
  haptics: boolean;
}
