/**
 * Core domain types for Kaizen Agent Dashboard.
 * Mirrored from backend/core/models.py Pydantic schemas.
 */

export type IncidentStatus =
  | 'normal'
  | 'detecting'
  | 'tracing'
  | 'investigating'
  | 'analyzing'
  | 'awaiting_evidence'
  | 'repairing'
  | 'verifying'
  | 'closed'
  | 'dismissed'
  | 'escalated'
  | 'error';

/** Live connection state of the incident SSE stream. */
export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** Display-only role of a signed-in account (mirrors backend `AuthRole`). */
export type AuthRole = 'technician' | 'shift_leader';

export interface AuthUser {
  username: string;
  display_name: string;
  role: AuthRole;
}

/** Response of `POST /api/auth/login`, persisted in localStorage. */
export interface AuthSession {
  token: string;
  expires_at: string;
  user: AuthUser;
}

/** Entry of `GET /api/auth/accounts`; `password` is null in production. */
export interface DemoAccount {
  username: string;
  display_name: string;
  role: AuthRole;
  password: string | null;
}

export interface FiveWhysStep {
  level: number;
  why: string;
  answer: string;
  evidence?: string;
  citation?: string;
}

export interface IshikawaFactor {
  category: string;
  factor: string;
  is_causal: boolean;
  detail?: string;
}

export interface AgentFinding {
  agent_id: string;
  agent_name: string;
  phase: string;
  finding: string;
  evidence: string;
  confidence: number;
  citation: string;
  timestamp: string;
  five_whys?: FiveWhysStep[];
  ishikawa?: Record<string, string[]>;
}

export interface RootCauseFindingDraft {
  finding: string;
  evidence: string;
  confidence: number;
  citation: string;
  five_whys?: FiveWhysStep[];
  ishikawa?: Record<string, string[]>;
  diagnostic_request?: string;
}

export interface CitationReference {
  document_id: string;
  title: string;
  page_number?: number;
  section?: string;
  snippet: string;
  relevance_score: number;
  last_revised?: string;
  citation?: string;
}

export interface RAGSearchResult {
  defect_symptom: string;
  suspect_asset: string;
  query: string;
  citations: CitationReference[];
  confidence: number;
  summary?: string;
  engine: string;
  total_found: number;
}

export interface ImpactMetrics {
  scrap_avoided: number;
  downtime_minutes: number;
  energy_kwh: number;
  co2_kg: number;
  cost_savings_usd?: number;
  energy_co2_kg?: number;
  material_co2_kg?: number;
  factory_type?: string;
}

export interface ManufacturingBenchmark {
  name: string;
  description: string;
  line_speed_parts_per_min: number;
  detection_lead_time_minutes: number;
  manual_diagnosis_minutes: number;
  ai_diagnosis_minutes: number;
  energy_kwh_per_unit: number;
  part_mass_kg: number;
  grid_emission_factor_kg_per_kwh: number;
  material_emission_factor_kg_per_kg: number;
  part_cost_usd: number;
  downtime_cost_per_hour_usd: number;
}

export interface ImpactCalculationRequest {
  factory_type?: string;
  custom_benchmark?: ManufacturingBenchmark;
  earlier_detection_minutes?: number;
  manual_diagnosis_minutes?: number;
  ai_diagnosis_minutes?: number;
  line_speed_parts_per_min?: number;
  energy_kwh_per_unit?: number;
  part_mass_kg?: number;
  part_cost_usd?: number;
  grid_emission_factor_kg_per_kwh?: number;
  material_emission_factor_kg_per_kg?: number;
  downtime_cost_per_hour_usd?: number;
}

export interface MachineTelemetryPayload {
  machine_id: string;
  timestamp: string;
  tool_id?: string | null;
  operating_status: string;
  spindle_vibration: number;
  spindle_temp: number;
  motor_current: number;
  rpm: number;
  anomaly_score: number;
}

export interface TelemetryAlert {
  machine_id: string;
  timestamp: string;
  anomaly_score: number;
  operating_status: string;
  metric_name: string;
  metric_value: number;
  threshold: number;
  message: string;
}

export interface IncidentState {
  incident_id: string;
  status: IncidentStatus;
  status_reason: string | null;
  defect_type: string | null;
  defect_rate: number;
  spc_ucl: number;
  suspect_machine: string | null;
  suspect_tool: string | null;
  root_cause: string | null;
  verification_count: number;
  verification_target: number;
  repair_done?: boolean;
  approved: boolean;
  findings: AgentFinding[];
  impact: ImpactMetrics | null;
  documents: IncidentDocuments;
  latest_telemetry?: MachineTelemetryPayload | null;
  telemetry_alerts?: TelemetryAlert[];
  diagnostic_request?: string | null;
  visual_evidence?: VisualEvidencePayload | null;
  updated_at: string;
}

/** Mirrors `VisualEvidencePayload`: the Copilot's read of a technician photo. */
export interface VisualEvidencePayload {
  image_id: string;
  filename?: string | null;
  mime_type: string;
  size_bytes: number;
  image_base64?: string | null;
  analysis: string;
  defect_detected: boolean;
  wear_measurement_mm?: number | null;
  timestamp: string;
  citation: string;
}

/** Keys the Incident Scribe (and approval flow) write into `IncidentState.documents`. */
export interface IncidentDocuments {
  work_order?: string;
  report_8d?: string;
  sop_proposal?: string;
  approved_by?: string;
  [key: string]: unknown;
}

/** Response of `POST /api/incidents/evidence`. */
export interface EvidenceUploadResponse {
  status: string;
  evidence: VisualEvidencePayload;
  finding: AgentFinding;
  incident_status: IncidentStatus;
}

/** Response of `GET /api/telemetry/baseline`. */
export interface TelemetryBaselineResponse {
  baseline: SensorBaseline;
  vibration_warning_threshold: number;
  current_warning_threshold: number;
  anomaly_onset_time: string | null;
  description: string;
}

/** Response of `GET /api/gemini-live/status`. */
export interface GeminiLiveServiceStatus {
  status: string;
  service: string;
  simulation_mode: boolean;
  active_sessions: number;
  default_model: string;
  default_voice: string;
  default_language: string;
  timestamp: string;
}

/** Mirrors `GeminiLiveSessionStatus` (`POST /api/gemini-live/session`, `GET /api/gemini-live/sessions`). */
export interface GeminiLiveSessionStatus {
  session_id: string;
  status: string;
  mode: string;
  client_messages_received: number;
  server_messages_sent: number;
  created_at: string;
  last_active_at: string;
}

export interface GeminiLiveServerContent {
  text?: string | null;
  audio_pcm_base64?: string | null;
  input_transcription?: string | null;
  output_transcription?: string | null;
  interrupted: boolean;
  turn_complete: boolean;
  generation_complete: boolean;
}

/** Mirrors `GeminiLiveServerMessage` sent over `WS /api/gemini-live/ws`. */
export interface GeminiLiveServerMessage {
  type: string;
  session_id?: string | null;
  server_content?: GeminiLiveServerContent | null;
  resumption_handle?: string | null;
  last_consumed_client_message_index?: number | null;
  error_message?: string | null;
  timestamp: string;
}

/** Mirrors `RepairCheckpoint` (one OEM repair step with an optional measured target). */
export interface RepairCheckpoint {
  step_number: number;
  title_vi: string;
  instruction_vi: string;
  citation: string;
  metric_name?: string | null;
  target_threshold?: number | null;
  comparator?: string | null;
  unit?: string | null;
}

export interface TelemetryPoint {
  timestamp: string;
  machine_id: string;
  vibration_mm_s: number;
  temperature_c: number;
  current_a: number;
  spindle_speed_rpm: number;
  is_anomalous: boolean;
  anomaly_score: number;
}

export interface SensorBaseline {
  vibration: number;
  temperature: number;
  current: number;
}

export interface MultiMachineTelemetryResponse {
  series: Record<string, TelemetryPoint[]>;
  baseline: SensorBaseline;
  vibration_warning_threshold: number;
  current_warning_threshold: number;
  anomaly_onset_time: string | null;
  time_window: string;
  source: string;
}

export type AndonPhaseKey = 'A' | 'B' | 'C' | 'D';
export type AndonPhaseStatus = 'pending' | 'active' | 'completed' | 'escalated';

export interface AndonPhaseDetails {
  key: AndonPhaseKey;
  letter: string;
  name: string;
  vietnameseName: string;
  lampColor: 'red' | 'yellow' | 'blue' | 'green';
  lampHex: string;
  description: string;
  activities: string[];
  inputs: string[];
  outputs: string[];
  statuses: IncidentStatus[];
}

export interface DefectInjectionRequest {
  scenario?: 'cnc_tool_wear' | 'im_damp_material' | string;
  mode?: 'demo' | 'fast' | string;
  duration_seconds?: number;
  defect_type?: string;
  severity?: 'low' | 'medium' | 'high';
  defect_rate?: number;
  machine_id?: string;
  tool_id?: string;
}

export interface SimulationStatusResponse {
  status: 'running' | 'idle' | string;
  active_scenario: string | null;
  mode: string | null;
  target_machine: string | null;
  target_tool: string | null;
  elapsed_seconds: number | null;
  total_seconds?: number | null;
}

export interface SpcDataPoint {
  sample_id: number;
  timestamp: string;
  defect_rate: number;
  ucl: number;
  cl: number;
  breach: boolean;
}

export interface MachineStatus {
  machine_id: string;
  name: string;
  status: 'running' | 'warning' | 'error' | 'idle';
  current_tool: string;
  vibration_mm_s: number;
  temperature_c: number;
  last_maintenance: string;
}
