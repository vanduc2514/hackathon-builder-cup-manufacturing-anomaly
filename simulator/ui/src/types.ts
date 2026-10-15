export interface MachineTelemetry {
  machine_id: string;
  tool_id: string;
  spindle_vibration: number;
  motor_current: number;
  spindle_temp: number;
  rpm: number;
  operating_status: string;
  dryer_dew_point?: number | null;
}

export interface ConveyorPart {
  product_id: string;
  machine_id: string;
  status: string;
  confidence: number;
}

export interface EdgeFilterStatistics {
  total_frames_evaluated: number;
  pass_frames_dropped: number;
  defect_frames_forwarded: number;
  estimated_bandwidth_saved_mb: number;
  cloud_bandwidth_reduction_pct: number;
}

export interface ActiveAnomalyStatus {
  scenario?: string | null;
  machine_id?: string | null;
  tool_id?: string | null;
  severity: number;
  elapsed_seconds: number;
}

export interface FactoryTickPacket {
  tick_index: number;
  machines?: MachineTelemetry[];
  telemetry?: MachineTelemetry[];
  recent_parts?: ConveyorPart[];
  parts?: ConveyorPart[];
  edge_stats?: EdgeFilterStatistics;
  active_anomaly?: ActiveAnomalyStatus | null;
}
