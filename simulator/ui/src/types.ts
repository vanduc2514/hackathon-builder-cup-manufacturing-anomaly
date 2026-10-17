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

export interface PubSubDeliveryReport {
  topic: string;
  message_id: string;
  latency_ms: number;
  status: 'delivered' | 'buffered' | 'failed' | string;
  timestamp: string;
  payload_type?: string;
  error?: string | null;
}

export interface InjectionResponse {
  status: string;
  message: string;
  details?: any;
  speed_multiplier?: number;
  pubsub_dispatch?: {
    quality_event: boolean;
    telemetry: boolean;
    traceability: boolean;
  };
  delivery_reports?: PubSubDeliveryReport[];
  edge_stats?: EdgeFilterStatistics;
}

export interface FactoryTickPacket {
  tick_index: number;
  machines?: MachineTelemetry[];
  telemetry?: MachineTelemetry[];
  recent_parts?: ConveyorPart[];
  parts?: ConveyorPart[];
  edge_stats?: EdgeFilterStatistics;
  active_anomaly?: ActiveAnomalyStatus | null;
  pubsub_delivery?: PubSubDeliveryReport[] | null;
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

