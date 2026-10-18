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
  | 'pending_approval'
  | 'closed'
  | 'dismissed'
  | 'escalated'
  | 'error';

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

export interface HandoverNote {
  author: string;
  note: string;
  created_at: string;
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
  approved_by?: string | null;
  approved_at?: string | null;
  archived?: boolean;
  archived_by?: string | null;
  archived_at?: string | null;
  findings: AgentFinding[];
  impact: ImpactMetrics | null;
  documents: Record<string, unknown>;
  documents_exported?: boolean;
  documents_export_error?: string | null;
  latest_telemetry?: MachineTelemetryPayload | null;
  telemetry_alerts?: TelemetryAlert[];
  diagnostic_request?: string | null;
  handover_notes?: HandoverNote[];
  opened_at?: string | null;
  closed_at?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string | null;
  line_id?: string | null;
  product?: string | null;
  mttr_target_minutes?: number | null;
  updated_at: string;
}

export interface IncidentSummary {
  incident_id: string;
  status: IncidentStatus;
  status_reason?: string | null;
  severity: string;
  defect_type?: string | null;
  defect_rate: number;
  spc_ucl: number;
  suspect_machine?: string | null;
  suspect_tool?: string | null;
  root_cause?: string | null;
  repair_done: boolean;
  approved: boolean;
  archived?: boolean;
  archived_by?: string | null;
  archived_at?: string | null;
  verification_count: number;
  verification_target: number;
  opened_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  impact?: ImpactMetrics | null;
}

export interface IncidentDocumentLink {
  name: string;
  title: string;
  uri: string;
}

export interface IncidentDocumentsResponse {
  incident_id: string;
  exported: boolean;
  export_error: string | null;
  destination: 'gcs' | 'local';
  bucket: string | null;
  console_url: string | null;
  documents: IncidentDocumentLink[];
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

export interface IncidentDocuments {
  work_order?: string;
  report_8d?: string;
  sop_proposal?: string;
}

export interface TelemetryBaselineResponse {
  baseline: SensorBaseline;
  vibration_warning_threshold: number;
  current_warning_threshold: number;
  anomaly_onset_time: string | null;
  description: string;
}

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  gcp_project: string | null;
}

export interface GeminiLiveStatus {
  status: string;
  service?: string;
  copilot_available: boolean;
  active_sessions: number;
  model: string;
  language: string;
  timestamp?: string;
}

export interface GeminiLiveSessionStatus {
  session_id: string;
  status: string;
  client_messages_received: number;
  server_messages_sent: number;
  created_at: string;
  last_active_at: string;
}

export interface InjectionResponse {
  status: string;
  scenario?: string;
  mode?: string;
  duration_seconds?: number;
  defect_type?: string | null;
  target_machine?: string | null;
  target_tool?: string | null;
  burst_telemetry?: Record<string, unknown>;
  message?: string;
}

export interface ResetResponse {
  status: string;
  message?: string;
  state?: IncidentState;
  bigquery?: { status?: string; message?: string };
}

export type AuthRole = 'technician' | 'shift_leader';

export interface AuthUser {
  username: string;
  display_name: string;
  role: AuthRole;
}

export interface AuthSession {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export interface DemoAccount {
  username: string;
  display_name: string;
  role: AuthRole;
}

export interface OeeFactors {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

export interface OeePoint extends OeeFactors {
  timestamp: string;
}

export type OeeLossKind = 'planned_stop' | 'unplanned_downtime' | 'speed' | 'quality';

export interface OeeLoss {
  kind: OeeLossKind;
  points: number;
  machine_id?: string | null;
  reason?: string | null;
  incident_id?: string | null;
}

export interface MachineOeeMetric extends OeeFactors {
  machine_id: string;
  good_parts: number;
  total_parts: number;
  series: OeePoint[];
}

export interface LineOeeResponse extends OeeFactors {
  line_id: string;
  target: number;
  series: OeePoint[];
  machines: MachineOeeMetric[];
  losses: OeeLoss[];
}

export interface NelsonRuleViolation {
  rule_id: number;
  rule_name: string;
  description: string;
  violation_indices: number[];
}

export interface SpcSeriesPoint {
  index: number;
  product_id: string;
  timestamp: string;
  machine_id: string;
  is_defect: boolean;
  defect_rate: number;
  subgroup_n: number;
  out_of_control: boolean;
}

export interface SpcSeriesResponse {
  machine_id: string | null;
  window: number;
  subgroup: number;
  centerline: number;
  ucl: number;
  ucl_3sigma: number;
  lcl: number;
  sigma: number;
  peak_rate: number;
  points: SpcSeriesPoint[];
  violations: NelsonRuleViolation[];
  source: "bigquery" | "mock_buffer" | "seed";
}

export interface FleetAsset {
  machine_id: string;
  machine_type: "cnc" | "im";
  bay: string;
  part: string;
  operation: string;
  on_demand: boolean;
}

export interface FleetRegistryResponse {
  line_id: string;
  line_name: string;
  planned_availability: number;
  mttr_target_minutes: number;
  oee_target: number;
  assets: FleetAsset[];
}

export interface EsgLedgerTotals {
  incidents: number;
  scrap_avoided: number;
  downtime_minutes: number;
  energy_kwh: number;
  co2_kg: number;
  energy_co2_kg: number;
  material_co2_kg: number;
  cost_savings_usd: number;
}

export interface EsgLedgerEntryResponse {
  incident_id: string;
  closed_at: string | null;
  approved: boolean;
  impact: ImpactMetrics;
  incident: IncidentState;
}

export interface EsgLedgerResponse {
  totals: EsgLedgerTotals;
  entries: EsgLedgerEntryResponse[];
  factory_type: string;
  /** Origin of impact inputs: benchmark estimates or measured production data. */
  basis: 'benchmark' | 'measured';
}

export type DashboardTab = 'overview' | 'incident-detail' | 'impact' | 'walkthroughs' | 'sops';
export type PresetCategory =
  | "surface_scratch"
  | "crack"
  | "fracture"
  | "assembly_gap"
  | "normal";

export interface VisualEvidencePreset {
  id: string;
  title: string;
  category: PresetCategory;
  machine_id: string;
  tool_id?: string | null;
  description: string;
  analysis: string;
  thumbnail_url: string;
  image_url: string;
  expected_defect_detected: boolean;
  expected_wear_mm?: number | null;
  suggested_sop_code?: number | null;
}

export interface VisualEvidencePresetListResponse {
  presets: VisualEvidencePreset[];
}

export interface PresetEvidenceRequest {
  preset_id: string;
  notes?: string | null;
}

export interface FactoryMachineTelemetry {
  machine_id: string;
  tool_id: string;
  spindle_vibration: number;
  motor_current: number;
  spindle_temp: number;
  rpm: number;
  operating_status: string;
  dryer_dew_point?: number | null;
}

export interface FactoryConveyorPart {
  product_id: string;
  machine_id: string;
  status: string;
  confidence: number;
}

export interface FactoryEdgeStatistics {
  total_frames_evaluated: number;
  pass_frames_dropped: number;
  defect_frames_forwarded: number;
  estimated_bandwidth_saved_mb: number;
  cloud_bandwidth_reduction_pct: number;
}

export interface FactoryActiveAnomaly {
  scenario?: string | null;
  machine_id?: string | null;
  tool_id?: string | null;
  severity: number;
  elapsed_seconds: number;
}

export interface FactoryTickPacket {
  tick_index: number;
  machines?: FactoryMachineTelemetry[];
  telemetry?: FactoryMachineTelemetry[];
  recent_parts?: FactoryConveyorPart[];
  parts?: FactoryConveyorPart[];
  edge_stats?: FactoryEdgeStatistics | null;
  active_anomaly?: FactoryActiveAnomaly | null;
}
