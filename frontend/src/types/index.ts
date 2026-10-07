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
  | 'escalated'
  | 'error';

export interface AgentFinding {
  agent_id: string;
  agent_name: string;
  phase: string;
  finding: string;
  evidence: string;
  confidence: number;
  citation: string;
  timestamp: string;
}

export interface ImpactMetrics {
  scrap_avoided: number;
  downtime_minutes: number;
  energy_kwh: number;
  co2_kg: number;
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
  approved: boolean;
  findings: AgentFinding[];
  impact: ImpactMetrics | null;
  documents: Record<string, unknown>;
  updated_at: string;
}

export interface DefectInjectionRequest {
  defect_type: string;
  severity: 'low' | 'medium' | 'high';
  defect_rate: number;
  machine_id: string;
  tool_id: string;
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
