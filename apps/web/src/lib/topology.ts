// System Topology & 5-Layer Multi-Agent Architecture (Issue #205, #211, #254 / TKT-063)
import type {
  EdgeVisualState,
  GateConditionBlock,
  IncidentState,
  IncidentStatus,
  NodeLayout,
  PhaseLane,
  TopologyEdge,
  TopologyEndpointId,
  TopologyLayerDefinition,
  TopologyNodeDefinition,
  TopologyNodeId,
  TopologyNodeState,
  TopologyPhaseDefinition,
  TopologyPhaseId,
  TopologyPhaseState,
  TopologyScenarioId,
  TopologyWindowId,
  WaypointRoute,
} from '../types';
import { matchesAgentRole } from './incident';

export type { TopologyWindowId };

export interface TopologyScenarioConfig {
  id: TopologyScenarioId;
  label: string;
  badgeDotClass: string;
  description: string;
}

export const TOPOLOGY_SCENARIOS: TopologyScenarioConfig[] = [
  {
    id: 'nominal',
    label: '1. Nominal Standby',
    badgeDotClass: 'green',
    description: 'All 5 factory lines running nominally. Gemma edge filters >95% normal frames.',
  },
  {
    id: 'detecting',
    label: '2. Active Anomaly (CNC-02)',
    badgeDotClass: 'red pulse',
    description: 'Optical surface tearing spike exceeds SPC UCL 3.0%; ADK Swarm dispatched.',
  },
  {
    id: 'low_confidence',
    label: '3. Low Conf (<0.70) & Diag Loop',
    badgeDotClass: 'amber pulse',
    description: 'RCA confidence 0.58 < 0.70; dispatches photo evidence request to Bay 4 technician.',
  },
  {
    id: 'streak_verifying',
    label: '4. Verification Streak (42/50)',
    badgeDotClass: 'blue pulse',
    description: 'Post-repair continuous optical proof: 42/50 clean parts certified under Invariant #3.',
  },
  {
    id: 'streak_reset',
    label: '5. Streak Defect Break (Reset)',
    badgeDotClass: 'red pulse',
    description: 'Defect detected at part 43: streak resets to 0/50, Andon siren alarms, loops back to Copilot.',
  },
  {
    id: 'approved',
    label: '6. Closed & E-Sign Approved',
    badgeDotClass: 'green',
    description: '50/50 clean streak achieved; Shift Leader David Vance applies cryptographic e-signature.',
  },
];

export const TOPOLOGY_LAYERS: TopologyLayerDefinition[] = [
  {
    id: 'layer-1',
    tag: '1',
    name: 'Layer 1: Factory Floor · Edge Data Sources',
    subtitle: 'CNC Machines, Exit Conveyor Cameras, Vibration/Temp Sensors, Microphones & QR Codes',
    description: 'Continuous physical telemetry, high-speed optical vision, acoustic emission, and workpiece genealogy.',
    badgeColor: 'chip-green',
    badgeHex: '#16a34a',
    window: 'window-1',
    nodeIds: ['floor-machines', 'floor-cameras', 'floor-sensors', 'floor-mics', 'floor-tags'],
  },
  {
    id: 'layer-2',
    tag: '2',
    name: 'Layer 2: On-Premises Gateway · Gemma Edge & Bridge',
    subtitle: 'Gemma 3 2B Local Inference (>95% Pre-Filter) & Industrial OPC-UA / MQTT Protocol Gateway',
    description: 'Local on-prem SLM inference pre-filtering >95% nominal video frames and industrial PLC protocol translation.',
    badgeColor: 'chip-amber',
    badgeHex: '#d97706',
    window: 'window-1',
    nodeIds: ['edge-gemma', 'edge-bridge'],
  },
  {
    id: 'layer-3',
    tag: '3',
    name: 'Layer 3: Google Cloud · Data & AI Platform',
    subtitle: 'Cloud Pub/Sub, BigQuery Warehouse, Firestore Shared Blackboard, Vertex RAG & Gemini 2.5',
    description: 'High-throughput asynchronous event ingestion, petabyte lot warehousing, reactive blackboard, and enterprise RAG/multimodal reasoning.',
    badgeColor: 'chip-blue',
    badgeHex: '#2563eb',
    window: 'window-2',
    nodeIds: ['gcp-pubsub', 'gcp-bigquery', 'gcp-firestore', 'gcp-rag', 'gcp-gemini'],
  },
  {
    id: 'layer-4',
    tag: '4',
    name: 'Layer 4: Agent Team · Google ADK Multi-Agent System',
    subtitle: 'ADK Orchestrator, Quality Inspector, RCA Swarm (Traceability + Telemetry), Copilot & Continuous Learning',
    description: 'Deterministic multi-agent execution with root cause confidence gate, field photo diagnostic loop, and multimodal copilot.',
    badgeColor: 'chip-purple',
    badgeHex: '#7c3aed',
    window: 'window-2',
    nodeIds: [
      'adk-orch',
      'agent-qa',
      'agent-tra',
      'agent-pa',
      'agent-rca',
      'decision-gate-1',
      'diagnostic-agent',
      'technician-photo',
      'copilot-live',
      'agent-scribe',
      'agent-learn',
    ],
  },
  {
    id: 'layer-5',
    tag: '5',
    name: 'Layer 5: Human-in-the-Loop & Operational Outputs',
    subtitle: 'Technician Mobile Copilot, Conveyor Optical Proof (Invariant #3), Shift Leader Sign-Off & 8D Dossiers',
    description: 'Hands-free mobile technician wrenching, conveyor optical proof (streak >= 50 clean parts), shift leader sign-off, and compliance dossiers.',
    badgeColor: 'chip-pink',
    badgeHex: '#db2777',
    window: 'window-2',
    nodeIds: [
      'human-tech',
      'verify-camera',
      'decision-gate-2',
      'streak-reset',
      'human-dash',
      'human-lead',
      'output-docs',
    ],
  },
];

// Preserving legacy 4 phases for backward compatibility with existing tests
export const TOPOLOGY_PHASES: TopologyPhaseDefinition[] = [
  {
    id: 'phase-a',
    letter: 'A',
    name: 'Detection & Ingest',
    vietnameseName: 'Detection & Ingest',
    description: 'On-premise vision classification, MQTT streaming, and SPC upper control limit monitoring.',
    lampColor: 'red',
    lampHex: '#e5484d',
    window: 'window-1',
    nodeIds: [
      'floor-machines',
      'floor-cameras',
      'floor-sensors',
      'floor-mics',
      'floor-tags',
      'edge-gemma',
      'edge-bridge',
      'gcp-pubsub',
      'agent-qa',
    ],
  },
  {
    id: 'phase-b',
    letter: 'B',
    name: 'Tracing & Root Cause',
    vietnameseName: 'Tracing & Root Cause',
    description: 'BigQuery lot graph traceability, sensor anomaly analysis, and grounded 5-Whys causal reasoning.',
    lampColor: 'yellow',
    lampHex: '#f5a524',
    window: 'window-2',
    nodeIds: [
      'gcp-bigquery',
      'agent-tra',
      'agent-pa',
      'agent-rca',
      'decision-gate-1',
      'diagnostic-agent',
      'technician-photo',
    ],
  },
  {
    id: 'phase-c',
    letter: 'C',
    name: 'Resolution & Verification',
    vietnameseName: 'Resolution & Verification',
    description: 'Gemini Live multimodal technician guidance, 8D documentation, and 50-part clean conveyor verification.',
    lampColor: 'blue',
    lampHex: '#3b82f6',
    window: 'window-2',
    nodeIds: [
      'copilot-live',
      'human-tech',
      'verify-camera',
      'decision-gate-2',
      'streak-reset',
    ],
  },
  {
    id: 'phase-d',
    letter: 'D',
    name: 'Closure & Continuous Learning',
    vietnameseName: 'Closure & Continuous Learning',
    description: 'RAG institutional memory indexing, ESG sustainability ledger, and shift-leader sign-off.',
    lampColor: 'green',
    lampHex: '#12a150',
    window: 'window-2',
    nodeIds: [
      'human-lead',
      'human-dash',
      'agent-scribe',
      'agent-learn',
      'output-docs',
    ],
  },
];

export const TOPOLOGY_NODES: TopologyNodeDefinition[] = [
  // ==========================================
  // LAYER 1: FACTORY FLOOR · EDGE DATA SOURCES
  // ==========================================
  {
    id: 'floor-machines',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 1,
    label: 'CNC / Injection',
    sublabel: 'Cell Line 1 Turning',
    tier: 'Tier 1',
    tierDescription: 'High-speed physical machining center and sensor hub',
    icon: 'precision_manufacturing',
    techStack: ['Fanuc 31i-B CNC', 'Siemens S7-1500 PLC', 'Profibus / IO-Link', '24V Industrial IO'],
    sla: '< 1ms deterministic cycle',
    channel: 'opc.tcp://cnc-02.cell1.internal:4840',
    fallback: 'Hardware mechanical interlock & e-stop trip',
    jtbd: 'Executes high-precision machining cycles (spindle 3200 RPM, feed rate 0.28 mm/rev); broadcasts machine cycle status.',
    payload: {
      machine_id: 'CNC-02',
      cell: 'Cell Line 1',
      spindle_rpm: 3200,
      feed_rate_mm_rev: 0.28,
      cycle_time_sec: 42.5,
      hydraulic_pressure_bar: 68.4,
      status: 'OPERATING',
    },
    uiRef: {
      surface: 'Line Overview · CNC Fleet Grid',
      route: 'Screen 1: /overview#machines',
      component: 'Machine Fleet & Spindle Telemetry',
      ctaLabel: 'Inspect Line 1 Fleet Table',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-cameras',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 2,
    label: 'EOL Cameras',
    sublabel: 'CAM-EOL Station',
    tier: 'Tier 1',
    tierDescription: 'High-speed industrial GigE Vision inspection terminal',
    icon: 'videocam',
    techStack: ['Basler ace 2 GigE', 'Sony Pregius S Sensor', 'GenICam Protocol', 'Ring LED 6500K'],
    sla: '60 FPS @ 1080p (< 16ms/frame)',
    channel: 'rtsp://cam-eol-01.cell1.internal/live',
    fallback: 'Manual visual inspection sampling (AQL 0.65)',
    jtbd: 'Captures 60 FPS high-resolution surface images of finished workpieces exiting the machining line for defect detection.',
    payload: {
      camera_id: 'CAM-EOL-01',
      fps: 60,
      resolution: '1920x1080',
      shutter_speed_us: 250,
      exposure: 'Auto-calibrated',
      stream_health: 'NOMINAL',
    },
    uiRef: {
      surface: 'Shop-Floor Terminal · Station Camera Feed',
      route: 'Screen 1: /overview#camera-bay',
      component: 'Optical Edge Inspection Terminal',
      ctaLabel: 'View Conveyor Camera Feed',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-sensors',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 3,
    label: 'Sensors (Vib/Temp)',
    sublabel: 'Spindle Tri-axial',
    tier: 'Tier 1',
    tierDescription: 'High-frequency vibration and thermal telemetry transducers',
    icon: 'sensors',
    techStack: ['IFM VVB001 IEPE', 'PT100 RTD Probe', 'Current Transformer 50A', 'IO-Link Master'],
    sla: '100 Hz continuous sampling',
    channel: 'blackboard.telemetry.sensors_raw',
    fallback: 'Bi-hourly manual technician dial gauge check',
    jtbd: 'Monitors spindle vibration RMS, bearing temperatures, motor phase current, and hydraulic pressure at 100 Hz sampling.',
    payload: {
      spindle_vibration_rms: 1.48,
      spindle_temp_celsius: 48.2,
      motor_current_a: 14.2,
      sampling_hz: 100,
      baseline_variance: '+1.8%',
    },
    uiRef: {
      surface: 'Engineering Console · Spindle Telemetry Stream',
      route: 'Screen 2: /spc#telemetry-raw',
      component: 'High-Frequency Sensor Telemetry',
      ctaLabel: 'View Spindle Vibration FFT',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'floor-mics',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 4,
    label: 'Microphones',
    sublabel: 'Acoustic Emissions',
    tier: 'Tier 1',
    tierDescription: 'Directional acoustic emission microphone for tool chatter detection',
    icon: 'mic',
    techStack: ['PCB Piezotronics 378B02', '24-bit ADC Sound Card', 'Bandpass 2kHz-20kHz', 'Acoustic FFT'],
    sla: '44.1 kHz raw audio streaming',
    channel: 'blackboard.telemetry.acoustic_stream',
    fallback: 'Technician ear listen check during tool change',
    jtbd: 'Samples continuous acoustic emissions in CNC machining chamber to isolate high-frequency tool chatter and bearing friction.',
    payload: {
      sample_rate_khz: 44.1,
      peak_frequency_khz: 8.4,
      snr_db: 68.2,
      chatter_energy_ratio: 0.12,
      status: 'MONITORING',
    },
    uiRef: {
      surface: 'Acoustic Diagnostic Inspector',
      route: 'Screen 2: /spc#acoustic',
      component: 'Acoustic Spectrogram & Audio Analysis',
      ctaLabel: 'Inspect Chamber Acoustic Feed',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'floor-tags',
    phase: 'layer-1',
    layer: 'layer-1',
    window: 'window-1',
    order: 5,
    label: 'Traceability Code',
    sublabel: 'QR / Laser Marking',
    tier: 'Tier 1',
    tierDescription: 'Direct Part Marking (DPM) 2D DataMatrix laser code reader',
    icon: 'qr_code_2',
    techStack: ['Keyence SR-2000 Scanner', 'ISO/IEC 16022 2D Matrix', 'Laser Etch 20W', 'EtherNet/IP'],
    sla: '< 80ms scan and decode per part',
    channel: 'blackboard.traceability.part_scans',
    fallback: 'Handheld 2D Bluetooth scanner backup',
    jtbd: 'Encodes unique workpiece serial, raw billet heat lot, and conveyor tracking timestamps for full genealogy tracing.',
    payload: {
      part_serial: 'WP-2026-90412',
      billet_heat_lot: 'HEAT-7741-AL6061',
      carrier_fixture_id: 'FIX-08',
      timestamp_epoch: 1776337200,
    },
    uiRef: {
      surface: 'Quality Lab · Workpiece Genealogy Scanner',
      route: 'Screen 2: /spc#lot-tracker',
      component: '2D DataMatrix Traceability Scanner',
      ctaLabel: 'Inspect Traceability Scanner',
      targetTab: 'incident-detail',
    },
  },

  // ==========================================
  // LAYER 2: ON-PREMISES GATEWAY · GEMMA EDGE
  // ==========================================
  {
    id: 'edge-gemma',
    phase: 'layer-2',
    layer: 'layer-2',
    window: 'window-1',
    order: 6,
    label: 'Gemma Local Inference',
    sublabel: 'Gemma 3 2B Edge On-Prem',
    tier: 'Tier 1 & 2',
    tierDescription: 'Sub-50ms inference, pneumatic diverter actuation, >95% frame reduction',
    icon: 'memory',
    techStack: ['Gemma 3 2B (int4)', 'Ollama / ONNX Runtime', 'Advantech Industrial PC', 'GPIO 24V'],
    sla: '42ms inference per frame',
    channel: 'local://edge-gateway.cell1.lan:11434',
    fallback: 'Static HSV threshold computer vision fallback',
    jtbd: 'Runs local SLM vision inference to pre-filter >95% nominal video frames, detects defect spikes, and triggers 50ms pneumatic rejector.',
    payload: {
      model: 'gemma-3-2b-it-q4',
      avg_latency_ms: 42.1,
      frames_processed: 18450,
      pass_frames_dropped: 17748,
      drop_rate_pct: '96.2%',
      diverter_actuations: 14,
    },
    uiRef: {
      surface: 'Edge Gateway Telemetry & Diverter Status',
      route: 'Screen 1: /factory/edge#classifier',
      component: 'Gemma 3 On-Prem Edge Classifier',
      ctaLabel: 'Inspect Gemma Edge Runtime',
      targetTab: 'overview',
    },
  },
  {
    id: 'edge-bridge',
    phase: 'layer-2',
    layer: 'layer-2',
    window: 'window-1',
    order: 7,
    label: 'OPC-UA / MQTT Bridge',
    sublabel: 'High-Freq Telemetry Buffer',
    tier: 'Tier 1 & 2',
    tierDescription: 'Deterministic industrial protocol bridge and ring buffer',
    icon: 'hub',
    techStack: ['Eclipse EMQX Broker', 'Node-RED Edge', 'OPC-UA Client', 'RocksDB Local Buffer'],
    sla: '100 msg/s (< 5ms local latency)',
    channel: 'mqtts://edge-bridge.cell1.lan:8883',
    fallback: 'Local NVMe circular buffer (24h offline capacity)',
    jtbd: 'Translates proprietary PLC protocols into standardized MQTT / Pub/Sub payloads; buffers 100 Hz sensor and acoustic telemetry streams.',
    payload: {
      broker: 'EMQX v5.2 Industrial',
      mqtt_topics: ['factory/cell1/cnc02/telemetry', 'factory/cell1/eol/vision'],
      throughput_msgs_sec: 104,
      queue_depth: 0,
      cloud_uplink_status: 'CONNECTED',
    },
    uiRef: {
      surface: 'Edge Infrastructure · MQTT Bridge Monitor',
      route: 'Screen 1: /factory/bridge#telemetry',
      component: 'Industrial MQTT Telemetry Bridge',
      ctaLabel: 'Inspect MQTT Protocol Bridge',
      targetTab: 'overview',
    },
  },

  // ==========================================
  // LAYER 3: GOOGLE CLOUD · DATA & AI PLATFORM
  // ==========================================
  {
    id: 'gcp-pubsub',
    phase: 'layer-3',
    layer: 'layer-3',
    window: 'window-2',
    order: 8,
    label: 'Cloud Pub/Sub',
    sublabel: 'Real-Time Ingestion Bus',
    tier: 'Tier 3 & 4',
    tierDescription: 'Global Google Cloud ingestion bus for anomaly packets and SPC alarms',
    icon: 'alt_route',
    techStack: ['Google Cloud Pub/Sub', 'Cloud Run Ingest Service', 'gRPC Ingestion', 'Avro Schemas'],
    sla: '< 15ms message ingestion latency',
    channel: 'projects/kaizen-mfg-prod/topics/factory-anomalies',
    fallback: 'Dead-letter queue with Cloud Storage spooling',
    jtbd: 'High-throughput asynchronous message broker ingesting anomalous defect frames, sensor events, and SPC trigger messages.',
    payload: {
      topic: 'projects/kaizen/topics/factory-anomalies',
      subscription: 'adk-orchestrator-worker',
      ingest_rate_sec: 14.8,
      ack_latency_ms: 12.4,
      dead_letter_count: 0,
    },
    uiRef: {
      surface: 'Cloud Operations · Pub/Sub Telemetry Stream',
      route: 'Screen 1: /overview#stream',
      component: 'Google Cloud Pub/Sub Event Stream',
      ctaLabel: 'View Ingestion Stream Bus',
      targetTab: 'overview',
    },
  },
  {
    id: 'gcp-bigquery',
    phase: 'layer-3',
    layer: 'layer-3',
    window: 'window-2',
    order: 9,
    label: 'BigQuery Warehouse',
    sublabel: 'Traceability & Telemetry',
    tier: 'Tier 3 & 4',
    tierDescription: 'Petabyte-scale enterprise data warehouse and SPC time-series lake',
    icon: 'database',
    techStack: ['BigQuery BI Engine', 'Partitioned Tables', 'BigQuery Storage API', 'BigQuery Emulator (Local)'],
    sla: '< 850ms analytical query SLA',
    channel: 'kaizen_mfg.production_telemetry',
    fallback: 'Local DuckDB / SQLite cached telemetry mirror',
    jtbd: 'Stores petabyte-scale discrete lot genealogy, raw sensor time-series, Nelson Rules SPC baselines, and historical incident records.',
    payload: {
      dataset: 'kaizen_mfg',
      tables: ['lot_genealogy', 'sensor_100hz', 'spc_control_limits'],
      total_records: '148,204,190',
      p95_query_time_ms: 640,
      spc_baseline_samples: 50000,
    },
    uiRef: {
      surface: 'Data Analytics · BigQuery Telemetry Console',
      route: 'Screen 2: /spc#bigquery-raw',
      component: 'BigQuery Discrete Manufacturing Lakehouse',
      ctaLabel: 'Open BigQuery Console',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'gcp-firestore',
    phase: 'layer-3',
    layer: 'layer-3',
    window: 'window-2',
    order: 10,
    label: 'Cloud Firestore',
    sublabel: 'Shared Incident Blackboard',
    tier: 'Tier 3 & 4',
    tierDescription: 'Low-latency multi-document reactive blackboard with SSE push streaming',
    icon: 'view_kanban',
    techStack: ['Cloud Firestore (Native)', 'Server-Sent Events (SSE)', 'ACID Transactions', 'Firestore Emulator (Local)'],
    sla: '< 25ms document snapshot synchronization',
    channel: 'projects/kaizen/databases/(default)/incidents',
    fallback: 'In-memory Redis / SQLite blackboard mirror',
    jtbd: 'Provides multi-agent reactive incident blackboard with Server-Sent Events (SSE) streaming; only ADK Orchestrator holds write permissions.',
    payload: {
      active_incident_id: 'INC-2026-B42',
      session_status: 'investigating',
      findings_count: 5,
      active_subscribers: 8,
      sse_latency_ms: 24.0,
      write_permission: 'adk_orchestrator_only',
    },
    uiRef: {
      surface: 'Shared Reactive Blackboard Inspector',
      route: 'Screen 3: /incident/INC-2026-B42#blackboard',
      component: 'Live Firestore Incident Blackboard',
      ctaLabel: 'Inspect Firestore Blackboard',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'gcp-rag',
    phase: 'layer-3',
    layer: 'layer-3',
    window: 'window-2',
    order: 11,
    label: 'Vertex AI Search & RAG',
    sublabel: '8D Archives & Manuals',
    tier: 'Tier 3 & 4',
    tierDescription: 'Enterprise semantic search, hybrid keyword/vector indexing, and citation grounding',
    icon: 'menu_book',
    techStack: ['Vertex AI Search', 'Text Embedding 004', 'Cloud Storage PDF Bucket', 'Strict Citation Grounding'],
    sla: '< 450ms semantic retrieval SLA',
    channel: 'projects/kaizen/dataStores/factory-knowledge-base',
    fallback: 'Local BM25 / vector SQLite fallback',
    jtbd: 'Performs hybrid semantic search over OEM machine manuals, 8D defect-cause-fix archives, maintenance logs, and expert video transcripts.',
    payload: {
      datastore_id: 'factory-knowledge-base',
      indexed_manuals: 142,
      indexed_8d_reports: 4200,
      retrieval_latency_ms: 420,
      top_k_chunks: 5,
      strict_citation_enforced: true,
    },
    uiRef: {
      surface: 'Knowledge Base · Semantic RAG Terminal',
      route: 'Screen 4: /impact#knowledge-rag',
      component: 'Vertex AI Search Domain Knowledge RAG',
      ctaLabel: 'Explore Knowledge RAG Store',
      targetTab: 'impact',
    },
  },
  {
    id: 'gcp-gemini',
    phase: 'layer-3',
    layer: 'layer-3',
    window: 'window-2',
    order: 12,
    label: 'Gemini on Vertex AI',
    sublabel: 'Vision, Live API & Video',
    tier: 'Tier 3 & 4',
    tierDescription: 'Foundation multimodal models powering visual inspection and Live API streaming',
    icon: 'smart_toy',
    techStack: ['Gemini 2.5 Flash', 'Gemini 2.5 Pro', 'Gemini Live API (WebSockets)', 'Vertex AI Endpoint'],
    sla: '< 1.8s generation / < 200ms Live streaming',
    channel: 'vertex-ai://us-central1/gemini-2.5-flash',
    fallback: 'Quantized Gemma 3 on Cloud Run fallback',
    jtbd: 'Powers multimodal defect image inspection, causal 5-Whys hypothesis generation, bidirectional Live audio/video streaming, and video reasoning.',
    payload: {
      active_model: 'gemini-2.5-flash',
      reasoning_model: 'gemini-2.5-pro',
      context_window: '1,000,000 tokens',
      live_api_mode: 'Bidirectional Audio/Video',
      multimodal_inputs: ['image/jpeg', 'audio/pcm', 'video/mp4'],
    },
    uiRef: {
      surface: 'Multimodal AI Diagnostics Console',
      route: 'Screen 3: /incident/INC-2026-B42#multimodal',
      component: 'Gemini Multimodal Diagnostics Console',
      ctaLabel: 'View Gemini Multi-Modal Model',
      targetTab: 'incident-detail',
    },
  },

  // ==========================================
  // LAYER 4: AGENT TEAM · GOOGLE ADK SYSTEM
  // ==========================================
  {
    id: 'adk-orch',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 13,
    label: 'Orchestrator Agent (ADK)',
    sublabel: 'Single Entry/Exit · Sole Blackboard Writer',
    tier: 'Tier 4',
    tierDescription: 'Central coordinator enforcing single entry/exit and Blackboard write encapsulation',
    icon: 'account_tree',
    techStack: ['Google ADK 2.x', 'Stateful Graph Orchestrator', 'Asyncio Event Loop', 'Firestore Admin SDK'],
    sla: '< 200ms task dispatch SLA',
    channel: 'adk.graph.orchestrator',
    fallback: 'Static deterministic fallback pipeline',
    jtbd: 'Central entry and exit point: receives every input event, opens incident blackboard sessions, coordinates swarm tasks, and writes to Firestore.',
    payload: {
      orchestrator_state: 'ACTIVE',
      managed_agents: ['quality_inspector', 'traceability', 'process_analyst', 'root_cause', 'scribe'],
      active_graph_node: 'root_cause_synthesis',
      blackboard_locks_acquired: 1,
      circuit_breaker: 'CLOSED_HEALTHY',
    },
    uiRef: {
      surface: 'ADK Multi-Agent Execution Graph',
      route: 'Screen 3: /incident/INC-2026-B42#orchestrator',
      component: 'ADK Multi-Agent Orchestration Engine',
      ctaLabel: 'Inspect ADK Graph Engine',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-qa',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 14,
    label: 'Quality Inspector Agent',
    sublabel: 'Phase A: Defect Classification & SPC Alarm',
    tier: 'Tier 4',
    tierDescription: 'Vision inspection agent with SPC UCL (3.0%) threshold monitoring',
    icon: 'rule',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash Vision', 'SPC Nelson Rules', 'Defect Taxonomy v3'],
    sla: '< 1.2s defect classification',
    channel: 'adk.agents.quality_inspector',
    fallback: 'Rule-based bounding box defect tagger',
    jtbd: 'Classifies defect types from optical feeds, monitors SPC Upper Control Limit (UCL 3.0%), and acts as post-repair verification gatekeeper.',
    payload: {
      classified_defect: 'surface_scratch',
      confidence: 0.98,
      defect_rate: 0.0442,
      spc_ucl: 0.030,
      alarm_triggered: true,
      nelson_rule_violated: 'Rule 1: Point > 3-Sigma Upper Control Limit',
    },
    uiRef: {
      surface: 'Quality Inspector Findings & SPC Banner',
      route: 'Screen 3: /incident/INC-2026-B42#agent-qa',
      component: 'Quality Inspector Defect Classifier',
      ctaLabel: 'Inspect QA Finding & SPC Rule',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-tra',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 15,
    label: 'Traceability Agent',
    sublabel: 'Phase B: BigQuery Lot Genealogy',
    tier: 'Tier 4',
    tierDescription: 'Discrete manufacturing graph traversal and lot genealogy correlation',
    icon: 'fork_right',
    techStack: ['ADK Agent', 'BigQuery SQL Tool', 'Graph Traversal', 'Part Genealogy Graph'],
    sla: '< 600ms SQL query execution',
    channel: 'adk.agents.traceability',
    fallback: 'Recent 500 parts lot buffer search',
    jtbd: 'Traces discrete manufacturing topology; queries BigQuery lot genealogy to correlate workpiece barcode with suspect CNC tool insert.',
    payload: {
      workpiece_id: 'WP-2026-90412',
      suspect_machine: 'CNC-02',
      suspect_tool: 'T07 (Carbide Face Mill)',
      part_lot: 'LOT-AL6061-B42',
      operator_shift: 'Morning Shift A',
      confidence: 0.94,
    },
    uiRef: {
      surface: 'Lot Genealogy Traversal Graph',
      route: 'Screen 3: /incident/INC-2026-B42#genealogy',
      component: 'Discrete Lot Genealogy & Suspect Isolation',
      ctaLabel: 'Inspect Lot Genealogy Graph',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-pa',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 16,
    label: 'Process Analyst Agent',
    sublabel: 'Phase B: High-Freq Telemetry FFT',
    tier: 'Tier 4',
    tierDescription: 'Vibration frequency analysis and physical sensor drift correlation',
    icon: 'analytics',
    techStack: ['ADK Agent', 'FFT Spectral Transform', 'SciPy Signal Processing', 'BigQuery Emulator'],
    sla: '< 800ms window correlation',
    channel: 'adk.agents.process_analyst',
    fallback: 'Threshold comparison on moving average RMS',
    jtbd: 'Fetches high-frequency spindle vibration RMS, temperature, and motor load; runs FFT analysis to detect statistical drift prior to defect onset.',
    payload: {
      monitored_station: 'CNC-02 Spindle',
      vibration_rms: '2.84 mm/s (+89% vs baseline)',
      dominant_frequency: '2840 Hz (Bearing/Tool Chatter)',
      bearing_temperature: '62.4 C (+14.2 C drift)',
      motor_current_spikes: '3 spikes > 18A',
      confidence: 0.91,
    },
    uiRef: {
      surface: 'Process Analyst FFT & Telemetry Drift View',
      route: 'Screen 3: /incident/INC-2026-B42#process-analyst',
      component: 'FFT Vibration & Telemetry Analyzer',
      ctaLabel: 'Inspect FFT Vibration Analysis',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-rca',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 17,
    label: 'Root Cause Agent',
    sublabel: 'Phase B: 5-Whys Synthesis + RAG',
    tier: 'Tier 4',
    tierDescription: 'Grounded causal reasoning combining RAG OEM manuals and 5-Whys methodology',
    icon: 'psychology',
    techStack: ['ADK Agent', 'Gemini 2.5 Pro', 'Vertex AI Search RAG', '5-Whys & Ishikawa Generator'],
    sla: '< 3.2s causal tree synthesis',
    channel: 'adk.agents.root_cause',
    fallback: 'Pre-indexed defect taxonomy decision tree',
    jtbd: 'Synthesizes discrete lot genealogy, continuous telemetry drift, and Vertex AI Search (RAG) archives to construct 5-Whys causal tree.',
    payload: {
      root_cause: 'Worn carbide tool insert T07 on CNC-02 spindle causing excessive chatter vibration',
      confidence: 0.89,
      oem_citation: 'Fanuc RoboDrill Manual Section 4.2: Tool Flank Wear Limits',
      rag_document_id: 'DOC-8D-2024-T07-WEAR',
      five_whys_levels: 5,
      ishikawa_categories: ['Machine', 'Method', 'Material', 'Measurement', 'Man', 'Environment'],
    },
    uiRef: {
      surface: '5-Whys & Ishikawa Root Cause Synthesis',
      route: 'Screen 3: /incident/INC-2026-B42#rca-5whys',
      component: 'Interactive 5-Whys & Ishikawa Diagram',
      ctaLabel: 'Inspect 5-Whys Causal Tree',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'decision-gate-1',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 18,
    label: 'Decision Gate 1: Confidence >= 0.70?',
    sublabel: 'Causal Confidence Evaluation Gate',
    tier: 'Tier 4',
    tierDescription: 'Deterministic routing gate evaluating RCA causal certainty',
    icon: 'diamond',
    isDecisionGate: true,
    techStack: ['Deterministic Routing Rule', 'ADK Event Branch', 'Confidence Evaluator'],
    sla: '< 10ms deterministic branch evaluation',
    channel: 'adk.gate.confidence_evaluation',
    fallback: 'Default to Diagnostic Loop (< 0.70) on missing confidence',
    jtbd: 'Evaluates causal certainty before dispatching physical field intervention. Routes to Copilot (>= 0.70) or Diagnostic Agent (< 0.70).',
    payload: {
      gate_id: 'GATE-01-CONFIDENCE',
      threshold: 0.70,
      evaluated_confidence: 0.89,
      result: 'FORWARD_PHASE_C_RESOLUTION',
      alternative_route: 'DIAGNOSTIC_LOOP_AWAITING_EVIDENCE',
      branches: {
        yes_branch: 'node-copilot-live',
        no_branch: 'node-diagnostic-agent',
      },
    },
    uiRef: {
      surface: 'Desktop Dashboard · Incident Triage Gate',
      route: 'Screen 3: /incident/INC-2026-B42#decision-gate-1',
      component: 'Bayesian Confidence Gate (>70%)',
      ctaLabel: 'Inspect Gate 1 Logic',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'diagnostic-agent',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 19,
    label: 'Diagnostic Agent',
    sublabel: 'Loop: Awaiting Field Evidence',
    tier: 'Tier 4',
    tierDescription: 'Sub-agent triggered when causal confidence is below threshold (< 0.70)',
    icon: 'search_check',
    techStack: ['ADK Diagnostic Sub-Agent', 'Blackboard State Machine', 'Mobile Push Dispatcher'],
    sla: '< 500ms evidence dispatch',
    channel: 'adk.agents.diagnostic_loop',
    fallback: 'Direct technician manual telephone dispatch',
    jtbd: 'Activated when RCA confidence < 0.70. Sets incident status to awaiting_evidence and dispatches targeted photo request to technician.',
    payload: {
      status: 'awaiting_evidence',
      requested_asset: 'CNC-02 Bay 4 Tool Holder T07',
      diagnostic_prompt: 'Capture high-resolution macro photo of T07 insert edge showing cutting flank wear.',
      evidence_submitted: false,
    },
    uiRef: {
      surface: 'Field Evidence Request Banner',
      route: 'Screen 3: /incident/INC-2026-B42#diagnostic',
      component: 'Diagnostic Field Probe & Evidence Loop',
      ctaLabel: 'View Diagnostic Evidence Loop',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'technician-photo',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 20,
    label: 'Technician Photo',
    sublabel: 'Loop: Gemini Vision Tool Inspection',
    tier: 'Tier 4 & 5',
    tierDescription: 'Mobile field photo capture and Gemini Vision tool wear classification',
    icon: 'photo_camera',
    techStack: ['Mobile PWA Camera', 'Gemini 2.5 Flash Vision', 'Tool Wear Measurement', 'Tool Preset Dataset'],
    sla: '< 2.5s vision re-evaluation',
    channel: 'mobile.camera.upload',
    fallback: 'Technician manual caliper wear measurement (mm)',
    jtbd: 'Technician captures macro photo of cutting tool wear insert at Bay 4. Gemini Vision re-evaluates evidence and feeds result back to RCA.',
    payload: {
      photo_id: 'IMG-T07-FLANK-01.jpg',
      detected_wear_flank_mm: 0.38,
      wear_threshold_mm: 0.20,
      classification: 'CRITICAL_FLANK_WEAR',
      re_evaluated_confidence: 0.94,
    },
    uiRef: {
      surface: 'Technician Visual Evidence Preset & Tool Wear Modal',
      route: 'Screen 3: /incident/INC-2026-B42#gemini-vision',
      component: 'Gemini Vision Multimodal Verification',
      ctaLabel: 'View Gemini Vision Inspector',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'copilot-live',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 21,
    label: 'Technician Copilot Live',
    sublabel: 'Phase C: Gemini Live WebSocket',
    tier: 'Tier 4 & 5',
    tierDescription: 'Bidirectional low-latency audio/video streaming assistant for field technicians',
    icon: 'support_agent',
    techStack: ['Gemini Enterprise Live API', 'Bidirectional WebSocket', 'Opus Audio Codec', 'ADK Checkpoints'],
    sla: '< 180ms bidirectional voice latency',
    channel: 'wss://kaizen-api.internal/api/live/technician',
    fallback: 'Static PDF step-by-step repair checklist',
    jtbd: 'Bidirectional Gemini Live WebSocket audio/video stream providing hands-free step-by-step tool replacement and torque calibration guidance.',
    payload: {
      session_id: 'LIVE-SESS-9041',
      technician: 'Alex Morgan (Bay 4)',
      procedure: 'CNC-02 T07 Tool Insert Replacement & Torque Check',
      active_step: 3,
      total_steps: 4,
      torque_verified_nm: 4.8,
    },
    uiRef: {
      surface: 'Mobile PWA · Live Technician Copilot Stream',
      route: 'Mobile: /mobile/repair#live-stream',
      component: 'Technician Copilot Live Stream',
      ctaLabel: 'Open Technician Copilot Live',
      targetTab: 'walkthroughs',
    },
  },
  {
    id: 'agent-scribe',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 22,
    label: 'Incident Scribe Agent',
    sublabel: 'Phase C: 8D Report & Work Order',
    tier: 'Tier 4',
    tierDescription: 'Automated regulatory technical documentation and maintenance work orders',
    icon: 'description',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash', '8D Report Template (Ford Standard)', 'CMMS Work Order Schema'],
    sla: '< 1.8s generation SLA',
    channel: 'adk.agents.scribe',
    fallback: 'Pre-populated Markdown template generator',
    jtbd: 'Drafts structured 8D incident report, generates maintenance work order with torque specs, and prepares revised SOP documentation.',
    payload: {
      documents_drafted: ['8d_report_v1.md', 'work_order_WO-4481.json', 'sop_rev_5.md'],
      eight_d_completed_disciplines: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'],
      work_order_status: 'DRAFT_READY',
      preventative_maintenance_entry: 'CAL-T07-CHECK',
    },
    uiRef: {
      surface: '8D Dossier & Work Order Editor',
      route: 'Screen 3: /incident/INC-2026-B42#dossier',
      component: 'Automated 8D Dossier & Root Cause Report',
      ctaLabel: 'Review 8D Report Draft',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-learn',
    phase: 'layer-4',
    layer: 'layer-4',
    window: 'window-2',
    order: 23,
    label: 'Continuous Learning Agent',
    sublabel: 'Phase D: Video-to-Procedure RAG & ESG',
    tier: 'Tier 4',
    tierDescription: 'Knowledge indexing engine and sustainability impact ledger calculator',
    icon: 'auto_stories',
    techStack: ['ADK Agent', 'Vertex AI Vector Store', 'ESG GHG Protocol Calculator', 'Video Indexer Tool'],
    sla: '< 2.5s impact calculation and vector commit',
    channel: 'adk.agents.continuous_learning',
    fallback: 'Local tabular ESG ledger accumulation',
    jtbd: 'Calculates ESG impact (scrap avoided, energy saved), converts verified repair recording to vector SOP, and updates institutional knowledge base.',
    payload: {
      scrap_avoided_kg: 48.5,
      scrap_units_saved: 28,
      energy_kwh_saved: 142.6,
      co2e_avoided_kg: 84.2,
      financial_savings_usd: 1240.0,
      new_sop_vector_id: 'VEC-SOP-CNC02-T07-REPLACE',
    },
    uiRef: {
      surface: 'Sustainability Ledger & ESG Impact Hub',
      route: 'Screen 4: /impact#esg-ledger',
      component: 'ESG Sustainability & Scrap Avoidance Ledger',
      ctaLabel: 'View ESG Impact Ledger',
      targetTab: 'impact',
    },
  },

  // ==========================================
  // LAYER 5: HUMAN-IN-THE-LOOP & OPERATIONAL OUTPUTS
  // ==========================================
  {
    id: 'human-tech',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 24,
    label: 'Bay 4 Field Technician',
    sublabel: 'Mobile Operator App · Guided Wrenching',
    tier: 'Tier 5',
    tierDescription: 'Human operator performing physical machine wrenching and calibration',
    icon: 'handyman',
    techStack: ['Technician Mobile PWA', 'Touch UI 48px CTAs', 'Audio Voice Commands', 'Torque Wrench Bluetooth'],
    sla: '< 15 min physical repair turnaround',
    channel: 'mobile.technician.bay4',
    fallback: 'Paper maintenance logbook sign-off',
    jtbd: 'Receives hands-free step-by-step wrenching instructions, replaces worn T07 tool insert, and taps the primary 48px [Confirm Repair Done] CTA.',
    payload: {
      technician_name: 'Alex Morgan',
      assigned_bay: 'Bay 4 (CNC-02)',
      repair_action: 'Replaced T07 insert, cleaned tool seat, torqued to 4.8 Nm',
      completion_confirmed: true,
      timestamp: '2026-10-16T10:45:00Z',
    },
    uiRef: {
      surface: 'Mobile Technician Guided Wrenching Workflow',
      route: 'Mobile: /mobile/repair#step-3',
      component: 'Hands-Free Mobile Technician Copilot',
      ctaLabel: 'Inspect Technician Mobile Flow',
      targetTab: 'walkthroughs',
    },
  },
  {
    id: 'verify-camera',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 25,
    label: 'Conveyor Optical Camera',
    sublabel: 'Post-Repair Optical Inspection',
    tier: 'Tier 1 & 4',
    tierDescription: 'High-speed camera feeding continuous optical proof into Invariant #3 engine',
    icon: 'camera_indoor',
    techStack: ['Basler ace 2 GigE', 'Conveyor Vision Service', 'Deterministic Clean Streak Counter'],
    sla: 'Continuous 60 FPS real-time inspection',
    channel: 'blackboard.verification.camera_stream',
    fallback: 'Manual QC micrometer sampling audit',
    jtbd: 'Resumes continuous optical scanning of newly machined workpieces to verify defect elimination and increment the clean streak counter.',
    payload: {
      camera_id: 'CAM-EOL-01',
      post_repair_frames_analyzed: 42,
      defects_detected: 0,
      current_streak: 42,
      target_streak: 50,
    },
    uiRef: {
      surface: 'Shop-Floor Terminal · Exit Conveyor',
      route: 'Screen 1: /factory/exit-conveyor#streak-meter',
      component: 'Post-Repair Defect-Free Streak Monitor',
      ctaLabel: 'Inspect Conveyor Streak Camera',
      targetTab: 'overview',
    },
  },
  {
    id: 'decision-gate-2',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 26,
    label: 'Verification Gate (Invariant #3): Streak >= 50 Clean Parts?',
    sublabel: 'Shop-Floor Product Evidence Law',
    tier: 'Tier 4 & 5',
    tierDescription: 'Key Invariant #3 verification gate hard-locking release approval',
    icon: 'verified',
    isDecisionGate: true,
    techStack: ['Conveyor Vision', 'Hardware Counter', 'Invariant #3 Gatekeeper', 'Blackboard Lock'],
    sla: '50 consecutive defect-free cycles required',
    channel: 'blackboard.verification.streak_counter',
    fallback: 'Reset to 0/50 upon any defect',
    jtbd: 'Invariant #3 strictly forbids closure sign-off until the conveyor optical camera records 50 consecutive clean workpieces without defect. Any defect drops streak to 0/50.',
    payload: {
      invariant: 'Invariant #3 (Product Evidence)',
      target_streak: 50,
      current_streak: 42,
      streak_progress_pct: '84%',
      shift_leader_approval_unlocked: false,
      reset_penalty_on_defect: 'Drop to 0 and escalate',
    },
    uiRef: {
      surface: 'Desktop Dashboard & Line Conveyor',
      route: 'Screen 1: /overview#invariant-3-gate',
      component: 'Conveyor Streak Monitor & Release Gate',
      ctaLabel: 'Inspect Gate 2 Invariant',
      targetTab: 'overview',
    },
  },
  {
    id: 'streak-reset',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 27,
    label: 'Streak Defect Reset',
    sublabel: 'Invariant #3 Failure Penalty',
    tier: 'Tier 1 & 4',
    tierDescription: 'Immediate shop-floor stop, penalty counter reset, and bay siren trigger',
    icon: 'emergency_home',
    techStack: ['Hardware IO Relay', 'Bay Andon Tower Alarm', 'Blackboard Reset Hook'],
    sla: '< 10ms alarm trigger',
    channel: 'blackboard.verification.streak_reset',
    fallback: 'Shift Leader physical buzzer trip',
    jtbd: 'Triggered when any defect is detected during verification streak: resets count to 0/50, escalates incident, sounds bay Andon alarm, and loops back to Copilot.',
    payload: {
      reset_event: true,
      part_failed_id: 'WP-2026-90455',
      streak_before_reset: 42,
      new_streak: 0,
      andon_status: 'FLASHING_RED',
      escalation: 'DISPATCH_LEAD',
    },
    uiRef: {
      surface: 'Desktop Dashboard & Alarm Annunciator',
      route: 'Screen 3: /incident/INC-2026-B42#escalation',
      component: 'Invariant #3 Streak Reset Alarm',
      ctaLabel: 'Inspect Escalation Protocol',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'human-dash',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 28,
    label: 'Incident Board Dashboard',
    sublabel: 'Plant Ops Line Overview & Command',
    tier: 'Tier 1 & 2',
    tierDescription: 'Unified plant situational awareness and reactive incident command workspace',
    icon: 'dashboard',
    techStack: ['React', 'Vite', 'TypeScript', 'Lumina Slate CSS'],
    sla: '< 50ms reactive state render',
    channel: 'https://kaizen-dashboard.internal/overview',
    fallback: 'Local cached dashboard snapshot',
    jtbd: 'Plant operations command center providing real-time situational awareness, machine health, and multi-agent findings for shift teams.',
    payload: {
      active_line: 'Cell Line 1',
      active_incidents: 1,
      line_oee: '86.4%',
      spc_alarm_status: 'ACTIVE',
      active_tab: 'incident-detail',
    },
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command Workspace',
      route: 'Screen 3: /incident/INC-2026-B42',
      component: 'Plant Operations Incident Workspace',
      ctaLabel: 'Open Incident Command Board',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'human-lead',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 29,
    label: 'Shift Leader Approval',
    sublabel: 'Digital E-Signature · Release Gate',
    tier: 'Tier 2 & 5',
    tierDescription: 'Regulatory closure authorization unlocked strictly when Invariant #3 passes',
    icon: 'verified_user',
    techStack: ['Web Cryptography API', 'SHA-256 Digital Signature', 'Audit Log Service'],
    sla: 'Manual human governance review',
    channel: 'blackboard.approval.signoff',
    fallback: 'Plant Manager manual emergency key override',
    jtbd: 'Shift leader reviews completed 8D dossier, confirms verified 50-part streak, and applies cryptographic digital signature to approve incident closure.',
    payload: {
      shift_leader: 'David Vance',
      e_sign_token: 'SHA256-88F4-4291-KAIZEN',
      signoff_unlocked: true,
      timestamp: '2026-10-16T11:15:00Z',
    },
    uiRef: {
      surface: 'Desktop Dashboard · Authorization Modal',
      route: 'Screen 3: /incident/INC-2026-B42#release-modal',
      component: 'Shift Leader Release Sign-Off Gate',
      ctaLabel: 'Open Shift Leader Release Modal',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'output-docs',
    phase: 'layer-5',
    layer: 'layer-5',
    window: 'window-2',
    order: 30,
    label: 'Operational Output Documents',
    sublabel: '8D Dossier, Work Order & SOP Update',
    tier: 'Tier 3',
    tierDescription: 'Permanent audit archives for ISO 9001 and IATF 16949 compliance',
    icon: 'inventory_2',
    techStack: ['PDF/A Format', 'JSON Schema Validation', 'Cloud Storage Immutable Bucket'],
    sla: 'Permanent immutable compliance archive',
    channel: 'gs://kaizen-records/2026/INC-B42',
    fallback: 'Local redundant document mirror volume',
    jtbd: 'Compiles permanent regulatory compliance artifacts: certified 8D incident dossier, closed maintenance work order, and updated machining SOP.',
    payload: {
      document_id: '8D-2026-B42-FINAL',
      status: 'APPROVED_AND_LOCKED',
      signed_by: 'David Vance',
      compliance: 'IATF 16949 D1-D8 compliant',
      files: ['8d_report.pdf', 'work_order_signed.pdf', 'sop_v5.json'],
    },
    uiRef: {
      surface: 'Desktop Dashboard · Knowledge Base & Compliance',
      route: 'Screen 4: /impact#signed-dossiers',
      component: '8D Report Dossier & SOP Revisions',
      ctaLabel: 'Download Certified 8D Dossier',
      targetTab: 'impact',
    },
  },

];

/** Edge-id key for a {@link TopologyEdge}: `${from}>${to}`. Matches the AC-TOP-31 §5.1c contract. */
export function getEdgeId(edge: { from: TopologyEndpointId; to: TopologyEndpointId }): string {
  return `${edge.from}>${edge.to}`;
}

export const TOPOLOGY_EDGES: TopologyEdge[] = [
  // Phase A: Ingest — Factory Floor ──> Edge Gateway ──> Cloud Platform ──> Orchestrator
  { from: 'floor-cameras', to: 'edge-gemma', label: '60 FPS Defect Feed' },
  { from: 'floor-mics', to: 'edge-gemma', label: 'Acoustic Feed' },
  { from: 'floor-machines', to: 'edge-bridge', label: 'PLC Telemetry' },
  { from: 'floor-sensors', to: 'edge-bridge', label: '100 Hz Sensors' },
  { from: 'floor-tags', to: 'pubsub-cross-bridge', label: 'Traceability Stream' },
  { from: 'edge-bridge', to: 'edge-gemma', label: 'OPC-UA / MQTT Buffer' },
  { from: 'edge-gemma', to: 'pubsub-cross-bridge', label: 'Anomalous Defect Frames' },
  { from: 'edge-bridge', to: 'pubsub-cross-bridge', label: 'Sensor Telemetry Buffer' },
  { from: 'pubsub-cross-bridge', to: 'gcp-pubsub', label: 'Factory Floor Event Stream' },
  { from: 'gcp-pubsub', to: 'gcp-bigquery', label: 'Batch Telemetry Archive' },
  { from: 'gcp-pubsub', to: 'adk-orch', label: 'Defect / SPC Event Stream' },
  { from: 'gcp-firestore', to: 'adk-orch', label: 'Shared Reactive Blackboard', bidirectional: true },
  { from: 'adk-orch', to: 'gcp-rag', label: 'SOP Defect-Cause-Fix Lookup' },

  // Phase B: Trace & Diagnose — Multi-Agent Root-Cause Swarm
  { from: 'adk-orch', to: 'agent-qa', label: '0. Classify Defect / SPC' },
  { from: 'agent-qa', to: 'agent-tra', label: '1. Trace Suspects' },
  { from: 'agent-tra', to: 'agent-pa', label: '2. Analyze Telemetry Window' },
  { from: 'agent-pa', to: 'agent-rca', label: 'Spindle Vibration Drift' },
  { from: 'agent-rca', to: 'decision-gate-1', label: 'Causal Confidence Score' },
  { from: 'decision-gate-1', to: 'gate1-yes', tone: 'yes', label: 'Confidence >= 0.70' },
  { from: 'decision-gate-1', to: 'gate1-no', tone: 'warning', label: 'Confidence < 0.70' },
  { from: 'gate1-no', to: 'technician-photo', tone: 'warning', label: 'Field Photo Request' },
  { from: 'technician-photo', to: 'diagnostic-agent', tone: 'warning', label: 'Evidence Upload' },
  { from: 'diagnostic-agent', to: 'agent-rca', tone: 'warning', label: 'Gemini Vision Re-eval' },
  { from: 'gate1-yes', to: 'copilot-live', tone: 'yes', label: 'Guided Repair Dispatch' },
  { from: 'gate1-yes', to: 'agent-scribe', tone: 'yes', label: 'Draft 8D Dossier' },

  // Phase C: Repair — Technician Copilot & Verification
  { from: 'copilot-live', to: 'human-tech', label: 'Hands-free Live Guidance', bidirectional: true },
  { from: 'human-tech', to: 'verify-camera', label: '[Confirm Repair Done] CTA' },
  { from: 'verify-camera', to: 'decision-gate-2', label: 'Continuous Optical Stream' },
  { from: 'decision-gate-2', to: 'gate2-no', tone: 'danger', label: 'Defect Still Present' },
  { from: 'decision-gate-2', to: 'gate2-yes', tone: 'yes', label: 'Streak >= 50 Clean Parts' },
  { from: 'gate2-no', to: 'streak-reset', tone: 'danger', label: 'Reset Streak Counter & Siren' },
  { from: 'streak-reset', to: 'agent-tra', tone: 'danger', label: 'Re-trace Suspects' },

  // Phase D: Close — Continuous Learning & Shift-Leader Approval
  { from: 'gate2-yes', to: 'agent-learn', tone: 'yes', label: 'Record Scrap & Carbon Ledger' },
  { from: 'agent-learn', to: 'gcp-bigquery', label: 'Continuous Learning Archive' },
  { from: 'gate2-yes', to: 'human-lead', tone: 'yes', label: 'Unlock Approval' },
  { from: 'human-lead', to: 'output-docs', label: 'Certified E-Signature' },
  { from: 'gcp-firestore', to: 'human-dash', label: 'Real-time Streak Progress' },
];

export const TOPOLOGY_GATE_BLOCKS: GateConditionBlock[] = [
  {
    id: 'gate1-yes',
    gateId: 'decision-gate-1',
    kind: 'yes',
    label: 'YES (>= 0.70): Guided Repair',
    tone: 'yes',
    targetIds: ['copilot-live', 'agent-scribe'],
  },
  {
    id: 'gate1-no',
    gateId: 'decision-gate-1',
    kind: 'no',
    label: 'NO (< 0.70): Awaiting Evidence',
    tone: 'warning',
    targetIds: ['technician-photo'],
  },
  {
    id: 'gate2-no',
    gateId: 'decision-gate-2',
    kind: 'no',
    label: 'NO (Defect): Reset 0/50 & Siren',
    tone: 'danger',
    targetIds: ['streak-reset'],
  },
  {
    id: 'gate2-yes',
    gateId: 'decision-gate-2',
    kind: 'yes',
    label: 'YES (Streak >= 50): Unlock Approval',
    tone: 'yes',
    targetIds: ['agent-learn', 'human-lead'],
  },
];

export const TOPOLOGY_PHASE_LANES: PhaseLane[] = [
  {
    id: 'a',
    phase: 'phase-a',
    name: 'Ingest & Classify',
    tone: 'danger',
    nodeIds: ['agent-qa'],
  },
  {
    id: 'b',
    phase: 'phase-b',
    name: 'Trace & Diagnose',
    tone: 'warning',
    nodeIds: [
      'agent-tra',
      'agent-pa',
      'agent-rca',
      'decision-gate-1',
      'gate1-yes',
      'gate1-no',
      'diagnostic-agent',
      'technician-photo',
    ],
  },
  {
    id: 'c',
    phase: 'phase-c',
    name: 'Guided Repair',
    tone: 'info',
    nodeIds: ['copilot-live', 'agent-scribe'],
  },
  {
    id: 'd-learn',
    phase: 'phase-d',
    name: 'Continuous Learning',
    tone: 'success',
    nodeIds: ['agent-learn'],
  },
  {
    id: 'd',
    phase: 'phase-d',
    name: 'Verify & Close',
    tone: 'success',
    nodeIds: [
      'human-tech',
      'verify-camera',
      'decision-gate-2',
      'gate2-no',
      'gate2-yes',
      'streak-reset',
      'human-lead',
      'output-docs',
    ],
  },
];

export const TOPOLOGY_NODE_LAYOUT: Record<string, NodeLayout> = {
  'floor-machines': { container: 'window-1', layer: 'layer-1', row: 1, col: 1 },
  'floor-cameras': { container: 'window-1', layer: 'layer-1', row: 1, col: 2 },
  'floor-sensors': { container: 'window-1', layer: 'layer-1', row: 1, col: 3 },
  'floor-mics': { container: 'window-1', layer: 'layer-1', row: 1, col: 4 },
  'floor-tags': { container: 'window-1', layer: 'layer-1', row: 1, col: 5 },
  'edge-gemma': { container: 'window-1', layer: 'layer-2', row: 1, col: 1 },
  'edge-bridge': { container: 'window-1', layer: 'layer-2', row: 1, col: 2 },
  'pubsub-cross-bridge': { container: 'bridge', layer: 'conduit', row: 1, col: 1 },
  'gcp-pubsub': { container: 'window-2', layer: 'layer-3', row: 1, col: 1 },
  'gcp-bigquery': { container: 'window-2', layer: 'layer-3', row: 1, col: 2 },
  'gcp-firestore': { container: 'window-2', layer: 'layer-3', row: 1, col: 3 },
  'gcp-rag': { container: 'window-2', layer: 'layer-3', row: 1, col: 4 },
  'gcp-gemini': { container: 'window-2', layer: 'layer-3', row: 1, col: 5 },
  'adk-orch': { container: 'window-2', layer: 'layer-4', row: 1, col: 1 },
  'agent-qa': { container: 'window-2', layer: 'layer-4', row: 1, col: 2 },
  'agent-tra': { container: 'window-2', layer: 'layer-4', row: 1, col: 3 },
  'agent-pa': { container: 'window-2', layer: 'layer-4', row: 1, col: 4 },
  'agent-rca': { container: 'window-2', layer: 'layer-4', row: 1, col: 5 },
  'decision-gate-1': { container: 'window-2', layer: 'layer-4', row: 1, col: 6 },
  'gate1-yes': { container: 'window-2', layer: 'layer-4', row: 1, col: 7 },
  'gate1-no': { container: 'window-2', layer: 'layer-4', row: 1, col: 8 },
  'diagnostic-agent': { container: 'window-2', layer: 'layer-4', row: 1, col: 9 },
  'technician-photo': { container: 'window-2', layer: 'layer-4', row: 1, col: 10 },
  'copilot-live': { container: 'window-2', layer: 'layer-4', row: 1, col: 11 },
  'agent-scribe': { container: 'window-2', layer: 'layer-4', row: 1, col: 12 },
  'agent-learn': { container: 'window-2', layer: 'layer-4', row: 1, col: 13 },
  'human-tech': { container: 'window-2', layer: 'layer-5', row: 1, col: 1 },
  'verify-camera': { container: 'window-2', layer: 'layer-5', row: 1, col: 2 },
  'decision-gate-2': { container: 'window-2', layer: 'layer-5', row: 1, col: 3 },
  'gate2-no': { container: 'window-2', layer: 'layer-5', row: 1, col: 4 },
  'gate2-yes': { container: 'window-2', layer: 'layer-5', row: 1, col: 5 },
  'streak-reset': { container: 'window-2', layer: 'layer-5', row: 1, col: 6 },
  'human-dash': { container: 'window-2', layer: 'layer-5', row: 1, col: 7 },
  'human-lead': { container: 'window-2', layer: 'layer-5', row: 1, col: 8 },
  'output-docs': { container: 'window-2', layer: 'layer-5', row: 1, col: 9 },
};

export const TOPOLOGY_ROUTES: Record<string, WaypointRoute> = {
  'floor-cameras>edge-gemma': { fromPort: 'left', toPort: 'top', lane: 'L2' },
  'floor-mics>edge-gemma': { fromPort: 'left', toPort: 'top', lane: 'L1' },
  'floor-machines>edge-bridge': { fromPort: 'bottom', toPort: 'top' },
  'floor-sensors>edge-bridge': { fromPort: 'bottom', toPort: 'top' },
  'floor-tags>pubsub-cross-bridge': { fromPort: 'right', toPort: 'left', lane: 'R1' },
  'edge-bridge>edge-gemma': { fromPort: 'left', toPort: 'right' },
  'edge-gemma>pubsub-cross-bridge': { fromPort: 'bottom', toPort: 'top' },
  'edge-bridge>pubsub-cross-bridge': { fromPort: 'bottom', toPort: 'top' },
  'pubsub-cross-bridge>gcp-pubsub': { fromPort: 'bottom', toPort: 'top' },
  'gcp-pubsub>gcp-bigquery': { fromPort: 'right', toPort: 'left' },
  'gcp-pubsub>adk-orch': { fromPort: 'bottom', toPort: 'top' },
  'gcp-firestore>adk-orch': { fromPort: 'bottom', toPort: 'top' },
  'adk-orch>gcp-rag': { fromPort: 'left', toPort: 'right', lane: 'L1' },
  'adk-orch>agent-qa': { fromPort: 'bottom', toPort: 'top' },
  'agent-qa>agent-tra': { fromPort: 'bottom', toPort: 'top' },
  'agent-tra>agent-pa': { fromPort: 'bottom', toPort: 'top' },
  'agent-pa>agent-rca': { fromPort: 'bottom', toPort: 'top' },
  'agent-rca>decision-gate-1': { fromPort: 'bottom', toPort: 'top' },
  'decision-gate-1>gate1-yes': { fromPort: 'bottom', toPort: 'top' },
  'decision-gate-1>gate1-no': { fromPort: 'bottom', toPort: 'top' },
  'gate1-no>technician-photo': { fromPort: 'bottom', toPort: 'top' },
  'technician-photo>diagnostic-agent': { fromPort: 'bottom', toPort: 'top' },
  'diagnostic-agent>agent-rca': { fromPort: 'right', toPort: 'left', lane: 'R1' },
  'gate1-yes>copilot-live': { fromPort: 'bottom', toPort: 'top' },
  'gate1-yes>agent-scribe': { fromPort: 'bottom', toPort: 'top' },
  'copilot-live>human-tech': { fromPort: 'left', toPort: 'right', lane: 'L1' },
  'human-tech>verify-camera': { fromPort: 'bottom', toPort: 'top' },
  'verify-camera>decision-gate-2': { fromPort: 'bottom', toPort: 'top' },
  'decision-gate-2>gate2-no': { fromPort: 'bottom', toPort: 'top' },
  'decision-gate-2>gate2-yes': { fromPort: 'bottom', toPort: 'top' },
  'gate2-no>streak-reset': { fromPort: 'bottom', toPort: 'top' },
  'streak-reset>agent-tra': { fromPort: 'left', toPort: 'right', lane: 'L2' },
  'gate2-yes>agent-learn': { fromPort: 'right', toPort: 'left', lane: 'R1' },
  'agent-learn>gcp-bigquery': { fromPort: 'right', toPort: 'left', lane: 'R2' },
  'gate2-yes>human-lead': { fromPort: 'bottom', toPort: 'top' },
  'human-lead>output-docs': { fromPort: 'bottom', toPort: 'top' },
  'gcp-firestore>human-dash': { fromPort: 'left', toPort: 'right', lane: 'L3' },
};

const INGEST_EDGES: readonly string[] = [
  'floor-cameras>edge-gemma',
  'floor-mics>edge-gemma',
  'floor-machines>edge-bridge',
  'floor-sensors>edge-bridge',
  'floor-tags>pubsub-cross-bridge',
  'edge-bridge>edge-gemma',
  'edge-gemma>pubsub-cross-bridge',
  'edge-bridge>pubsub-cross-bridge',
  'pubsub-cross-bridge>gcp-pubsub',
  'gcp-pubsub>gcp-bigquery',
  'gcp-pubsub>adk-orch',
  'gcp-firestore>adk-orch',
  'adk-orch>agent-qa',
];

const TRACE_EDGES: readonly string[] = [
  'agent-qa>agent-tra',
  'agent-tra>agent-pa',
  'agent-pa>agent-rca',
  'agent-rca>decision-gate-1',
];

const REPAIR_EDGES: readonly string[] = [
  'decision-gate-1>gate1-yes',
  'gate1-yes>copilot-live',
  'gate1-yes>agent-scribe',
  'copilot-live>human-tech',
  'human-tech>verify-camera',
];

const EVIDENCE_EDGES: readonly string[] = [
  'decision-gate-1>gate1-no',
  'gate1-no>technician-photo',
  'technician-photo>diagnostic-agent',
  'diagnostic-agent>agent-rca',
];

const RESET_EDGES: readonly string[] = [
  'decision-gate-2>gate2-no',
  'gate2-no>streak-reset',
  'streak-reset>agent-tra',
];

const CLOSE_EDGES: readonly string[] = [
  'verify-camera>decision-gate-2',
  'decision-gate-2>gate2-yes',
  'gate2-yes>agent-learn',
  'agent-learn>gcp-bigquery',
  'adk-orch>gcp-rag',
  'gate2-yes>human-lead',
  'human-lead>output-docs',
  'gcp-firestore>human-dash',
];

const STATE_EDGES: readonly string[] = TOPOLOGY_EDGES.map(getEdgeId);

/**
 * Pure function deriving the visual state of every topology edge for a given scenario.
 * Never mutates {@link TOPOLOGY_EDGES}; always returns a fresh record keyed by edge id.
 */
export function deriveEdgeStates(scenario: TopologyScenarioId): Record<string, EdgeVisualState> {
  const states: Record<string, EdgeVisualState> = {};
  for (const id of STATE_EDGES) {
    states[id] = 'idle';
  }

  switch (scenario) {
    case 'nominal':
      break;
    case 'detecting':
      for (const id of INGEST_EDGES) states[id] = 'active';
      break;
    case 'low_confidence':
      for (const id of [...INGEST_EDGES, ...TRACE_EDGES]) states[id] = 'completed';
      states[EVIDENCE_EDGES[0]] = 'warning';
      states[EVIDENCE_EDGES[1]] = 'warning';
      states[EVIDENCE_EDGES[2]] = 'active';
      states[EVIDENCE_EDGES[3]] = 'active';
      break;
    case 'streak_verifying':
      for (const id of [...INGEST_EDGES, ...TRACE_EDGES, ...REPAIR_EDGES]) states[id] = 'completed';
      states['gcp-firestore>human-dash'] = 'active';
      states['verify-camera>decision-gate-2'] = 'active';
      break;
    case 'streak_reset':
      for (const id of [...INGEST_EDGES, ...TRACE_EDGES, ...REPAIR_EDGES]) states[id] = 'completed';
      states['verify-camera>decision-gate-2'] = 'completed';
      states['gcp-firestore>human-dash'] = 'completed';
      for (const id of RESET_EDGES) states[id] = 'danger';
      break;
    case 'approved':
      for (const id of [...INGEST_EDGES, ...TRACE_EDGES, ...REPAIR_EDGES, ...CLOSE_EDGES]) {
        states[id] = 'completed';
      }
      break;
  }

  return states;
}

/**
 * Pure function deriving runtime status, summaries, and extracted details for each of the 28 topology nodes
 * from the live IncidentState on the blackboard.
 */
export function deriveNodeStates(
  incident: IncidentState | null,
  scenarioOverride?: TopologyScenarioId,
): Record<TopologyNodeId, TopologyNodeState> {
  // If a manual scenario override is selected, we map the scenario directly!
  if (scenarioOverride) {
    return deriveScenarioStates(scenarioOverride, incident);
  }

  const status: IncidentStatus = incident?.status ?? 'normal';
  const findings = incident?.findings ?? [];
  const latestByRole = (role: string) => findings.slice().reverse().find((f) => matchesAgentRole(f, role));

  const qiFinding = latestByRole('quality_inspector');
  const traFinding = latestByRole('traceability');
  const paFinding = latestByRole('process_analyst');
  const rcaFinding = latestByRole('root_cause');
  const copilotFinding = latestByRole('technician_copilot');
  const scribeFinding = latestByRole('incident_scribe');
  const learnFinding = latestByRole('continuous_learning');

  const isNominal = !incident || status === 'normal';
  const isDetecting = status === 'detecting';
  const isTracing = status === 'tracing' || status === 'investigating' || status === 'analyzing';
  const isAwaitingEvidence = status === 'awaiting_evidence';
  const isRepairing = status === 'repairing';
  const isVerifying = status === 'verifying';
  const isClosed = status === 'closed';
  const isDismissed = status === 'dismissed';
  const isEscalated = status === 'escalated';
  const isError = status === 'error';

  let stage = 0;
  if (isDetecting) stage = 1;
  else if (isTracing || isAwaitingEvidence) stage = 2;
  else if (isRepairing || isVerifying) stage = 3;
  else if (isClosed || isDismissed) stage = 4;
  else if (isEscalated || isError) stage = 2;

  const currentStreak = incident?.verification_count ?? 0;
  const targetStreak = incident?.verification_target ?? 50;

  // Layer 1 statuses
  const l1MachineStatus = isNominal ? 'nominal' : 'active';
  const l1CameraStatus = isDetecting ? 'danger' : isNominal ? 'nominal' : 'done';
  const l1SensorStatus = isTracing || isDetecting ? 'warning' : 'nominal';
  const l1MicStatus = isTracing || isDetecting ? 'warning' : 'nominal';
  const l1TagStatus = isNominal ? 'nominal' : 'done';

  // Layer 2 statuses
  const l2GemmaStatus = isDetecting ? 'active' : isNominal ? 'idle' : 'done';
  const l2BridgeStatus = isNominal ? 'nominal' : 'active';

  // Layer 3 statuses
  const l3PubsubStatus = isDetecting || isTracing ? 'active' : isNominal ? 'idle' : 'done';
  const l3BigqueryStatus = isTracing ? 'active' : isNominal ? 'idle' : 'done';
  const l3FirestoreStatus = !isNominal ? 'active' : 'idle';
  const l3RagStatus = isTracing ? 'active' : isNominal ? 'idle' : 'done';
  const l3GeminiStatus = isTracing || isAwaitingEvidence || isRepairing ? 'active' : isNominal ? 'idle' : 'done';

  // Layer 4 statuses
  const l4OrchStatus = !isNominal ? 'active' : 'idle';
  let l4QaStatus: TopologyNodeState['status'] = 'idle';
  if (isDetecting) l4QaStatus = 'active';
  else if (stage >= 2) l4QaStatus = 'done';

  let l4TraStatus: TopologyNodeState['status'] = 'idle';
  if (stage >= 2) {
    l4TraStatus = stage === 2 && !incident?.suspect_machine && !traFinding ? 'active' : 'done';
  }

  let l4PaStatus: TopologyNodeState['status'] = 'idle';
  if (stage >= 2) {
    l4PaStatus = stage === 2 && !paFinding ? 'active' : 'done';
  }

  let l4RcaStatus: TopologyNodeState['status'] = 'idle';
  if (stage >= 2) {
    if (isAwaitingEvidence) l4RcaStatus = 'waiting';
    else if (stage === 2 && !incident?.root_cause) l4RcaStatus = 'active';
    else l4RcaStatus = 'done';
  }

  const l4Gate1Status: TopologyNodeState['status'] = isAwaitingEvidence ? 'warning' : stage >= 3 ? 'done' : 'idle';
  const l4DiagStatus: TopologyNodeState['status'] = isAwaitingEvidence ? 'active' : 'idle';
  const l4PhotoStatus: TopologyNodeState['status'] = isAwaitingEvidence ? 'active' : 'idle';

  let l4CopilotStatus: TopologyNodeState['status'] = 'idle';
  if (isRepairing) l4CopilotStatus = 'active';
  else if (stage > 3 || (stage === 3 && incident?.repair_done)) l4CopilotStatus = 'done';

  let l4ScribeStatus: TopologyNodeState['status'] = 'idle';
  if (stage >= 3) {
    l4ScribeStatus = isRepairing ? 'active' : 'done';
  }

  let l4LearnStatus: TopologyNodeState['status'] = 'idle';
  if (stage === 4) l4LearnStatus = 'done';

  // Layer 5 statuses
  let l5TechStatus: TopologyNodeState['status'] = 'idle';
  if (isRepairing) l5TechStatus = 'active';
  else if (incident?.repair_done) l5TechStatus = 'done';

  let l5VerifyCamStatus: TopologyNodeState['status'] = 'idle';
  if (isVerifying) l5VerifyCamStatus = 'active';
  else if (currentStreak >= targetStreak) l5VerifyCamStatus = 'done';

  const l5Gate2Status: TopologyNodeState['status'] =
    currentStreak >= targetStreak ? 'done' : isVerifying ? 'active' : isClosed ? 'done' : 'locked';

  const l5ResetStatus: TopologyNodeState['status'] = isEscalated ? 'danger' : 'idle';
  const l5DashStatus: TopologyNodeState['status'] = !isNominal ? 'active' : 'nominal';
  const l5LeadStatus: TopologyNodeState['status'] =
    isClosed && incident?.approved ? 'done' : isClosed ? 'pending_approval' : currentStreak >= targetStreak ? 'active' : 'locked';
  const l5DocsStatus: TopologyNodeState['status'] = isClosed && incident?.approved ? 'done' : stage >= 3 ? 'active' : 'idle';

  return {
    // Layer 1
    'floor-machines': {
      id: 'floor-machines',
      status: l1MachineStatus,
      badgeText: isNominal ? '3200 RPM' : 'Cycle Alert',
      summary: 'Executes high-precision turning; broadcasts spindle speed and feed rate.',
      isInferred: true,
      details: {
        machine_id: incident?.suspect_machine ?? 'CNC-02',
        spindle_rpm: 3200,
        feed_rate_mm_rev: 0.28,
        status: isNominal ? 'NOMINAL' : 'ANOMALY_LOGGED',
      },
    },
    'floor-cameras': {
      id: 'floor-cameras',
      status: l1CameraStatus,
      badgeText: isDetecting ? 'Defect Spike' : '60 FPS',
      summary: '60 FPS high-resolution surface images of finished workpieces.',
      isInferred: true,
      details: {
        camera_id: 'CAM-EOL-01',
        resolution: '1920x1080',
        framerate: '60 FPS',
        status: isDetecting ? 'DEFECT_DETECTED' : 'STREAMING',
      },
    },
    'floor-sensors': {
      id: 'floor-sensors',
      status: l1SensorStatus,
      badgeText: isTracing ? 'RMS 2.84 mm/s' : '100 Hz',
      summary: 'Tri-axial vibration RMS, bearing temp, and motor current telemetry.',
      isInferred: true,
      details: {
        vibration_rms: '2.84 mm/s',
        temperature_c: 48.2,
        sampling_rate: '100 Hz',
      },
    },
    'floor-mics': {
      id: 'floor-mics',
      status: l1MicStatus,
      badgeText: isTracing ? 'Chatter Alert' : '20 kHz',
      summary: 'Acoustic emissions sampling for cutting tool friction and chatter.',
      isInferred: true,
      details: {
        frequency_band: '20 kHz',
        snr_db: 68.2,
        chatter_detected: isTracing,
      },
    },
    'floor-tags': {
      id: 'floor-tags',
      status: l1TagStatus,
      badgeText: 'Lot Logged',
      summary: '2D DataMatrix laser-etched code for discrete part tracking.',
      isInferred: true,
      details: {
        part_id: 'WP-2026-90412',
        heat_lot: 'B42-0941',
        station: 'Laser-01',
      },
    },

    // Layer 2
    'edge-gemma': {
      id: 'edge-gemma',
      status: l2GemmaStatus,
      badgeText: isDetecting ? '50ms Divert' : '96.2% Dropped',
      summary: 'Gemma 3 2B local SLM pre-filters >95% nominal video frames on-prem.',
      isInferred: true,
      details: {
        runtime: 'On-Premise IPC / Raspberry Pi 5',
        model: 'Gemma 3 2B (int4 quantized)',
        inference_latency: '42ms',
        filter_rate: '96.2% nominal frames discarded',
        diverter_actuation: 'Pneumatic 24V solenoid',
      },
    },
    'edge-bridge': {
      id: 'edge-bridge',
      status: l2BridgeStatus,
      badgeText: '100 msg/s',
      summary: 'Translates PLC protocols to MQTT and buffers high-frequency telemetry.',
      isInferred: true,
      details: {
        broker: 'EMQX v5.2',
        rate: '100 msgs/sec',
        buffer_loss: 0,
        uplink: 'Cloud Pub/Sub',
      },
    },

    // Layer 3
    'gcp-pubsub': {
      id: 'gcp-pubsub',
      status: l3PubsubStatus,
      badgeText: 'Streaming',
      summary: 'High-throughput asynchronous message broker for defect frames and SPC alarms.',
      isInferred: true,
      details: {
        topic: 'projects/kaizen/topics/factory-anomalies',
        latency: '12ms',
        backlog: 0,
      },
    },
    'gcp-bigquery': {
      id: 'gcp-bigquery',
      status: l3BigqueryStatus,
      badgeText: isTracing ? 'Querying Lot' : 'Nominal',
      summary: 'Stores lot genealogy, time-series telemetry, and historical 8D baselines.',
      isInferred: true,
      details: {
        dataset: 'kaizen_mfg',
        query_sla: '< 850ms',
        storage_engine: 'BI Engine',
      },
    },
    'gcp-firestore': {
      id: 'gcp-firestore',
      status: l3FirestoreStatus,
      badgeText: incident ? 'INC-B42 Open' : 'Synced',
      summary: 'Reactive shared incident blackboard with SSE push streaming.',
      isInferred: true,
      details: {
        document: incident?.incident_id ?? 'None',
        sync_latency: '24ms',
        sole_writer: 'adk_orchestrator',
      },
    },
    'gcp-rag': {
      id: 'gcp-rag',
      status: l3RagStatus,
      badgeText: 'Indexed',
      summary: 'Hybrid semantic search over OEM manuals and 8D defect archives.',
      isInferred: true,
      details: {
        index_size: '4,200 SOPs',
        search_latency: '420ms',
        citations: 'Enforced',
      },
    },
    'gcp-gemini': {
      id: 'gcp-gemini',
      status: l3GeminiStatus,
      badgeText: 'Active',
      summary: 'Multimodal defect analysis, Live API audio/video, and 5-Whys reasoning.',
      isInferred: true,
      details: {
        model: 'Gemini 2.5 Flash / Pro',
        context_window: '1M tokens',
        modalities: 'Vision + Audio + Text',
      },
    },

    // Layer 4
    'adk-orch': {
      id: 'adk-orch',
      status: l4OrchStatus,
      badgeText: 'Coordinating',
      summary: 'Single entry & exit point; sole writer to Firestore incident blackboard.',
      isInferred: false,
      details: {
        framework: 'Google ADK 2.x',
        graph_status: 'COORDINATING',
        swarm_size: 5,
      },
    },
    'agent-qa': {
      id: 'agent-qa',
      status: l4QaStatus,
      badgeText: isDetecting ? 'SPC Breach' : 'SPC 3.0%',
      summary: qiFinding?.finding ?? 'Defect classification and SPC Upper Control Limit monitoring.',
      isInferred: false,
      details: {
        agent_id: 'quality_inspector',
        defect_type: incident?.defect_type ?? 'surface_scratch',
        defect_rate_pct: incident ? Number((incident.defect_rate * 100).toFixed(2)) : 4.42,
        spc_ucl_pct: incident ? Number((incident.spc_ucl * 100).toFixed(2)) : 3.0,
      },
    },
    'agent-tra': {
      id: 'agent-tra',
      status: l4TraStatus,
      badgeText: incident?.suspect_machine ? 'CNC-02 / T07' : 'Genealogy',
      summary: traFinding?.finding ?? 'BigQuery lot genealogy traversal to isolate suspect tool insert.',
      isInferred: false,
      details: {
        agent_id: 'traceability',
        suspect_machine: incident?.suspect_machine ?? 'CNC-02',
        suspect_tool: incident?.suspect_tool ?? 'T07',
      },
    },
    'agent-pa': {
      id: 'agent-pa',
      status: l4PaStatus,
      badgeText: 'Vib 2.84 mm/s',
      summary: paFinding?.finding ?? 'High-frequency spindle vibration RMS and FFT drift correlation.',
      isInferred: false,
      details: {
        agent_id: 'process_analyst',
        vibration_anomaly: '+89% above baseline',
        sensor_correlated: 'Spindle Bearing RMS',
      },
    },
    'agent-rca': {
      id: 'agent-rca',
      status: l4RcaStatus,
      badgeText: 'Conf 0.89',
      summary: incident?.root_cause ?? rcaFinding?.finding ?? '5-Whys causal synthesis with OEM manual RAG citations.',
      isInferred: false,
      details: {
        agent_id: 'root_cause',
        confidence: rcaFinding?.confidence ?? 0.89,
        oem_citation: rcaFinding?.citation ?? 'Fanuc RoboDrill Manual §4.2',
      },
    },
    'decision-gate-1': {
      id: 'decision-gate-1',
      status: l4Gate1Status,
      badgeText: isAwaitingEvidence ? '< 0.70 Diag Loop' : '>= 0.70 Proceed',
      summary: 'Confidence gate routing to Copilot (>= 0.70) or Diagnostic Evidence Loop (< 0.70).',
      isInferred: true,
      details: {
        threshold: 0.70,
        evaluated: isAwaitingEvidence ? 0.58 : 0.89,
        route: isAwaitingEvidence ? 'DIAGNOSTIC_AGENT' : 'COPILOT_LIVE',
      },
    },
    'diagnostic-agent': {
      id: 'diagnostic-agent',
      status: l4DiagStatus,
      badgeText: isAwaitingEvidence ? 'Photo Req Sent' : 'Standby',
      summary: 'Dispatches targeted macro photo request to technician when confidence is low.',
      isInferred: false,
      details: {
        agent_id: 'diagnostic_loop',
        request_sent: isAwaitingEvidence,
      },
    },
    'technician-photo': {
      id: 'technician-photo',
      status: l4PhotoStatus,
      badgeText: isAwaitingEvidence ? 'Awaiting Upload' : 'Standby',
      summary: 'Technician captures photo of worn tool; Gemini Vision re-evaluates evidence.',
      isInferred: false,
      details: {
        channel: 'Mobile Camera Upload',
        gemini_vision: 'Wear Measurement',
      },
    },
    'copilot-live': {
      id: 'copilot-live',
      status: l4CopilotStatus,
      badgeText: isRepairing ? 'Live Stream' : 'Ready',
      summary: copilotFinding?.finding ?? 'Gemini Live WebSocket for hands-free step-by-step repair guidance.',
      isInferred: false,
      details: {
        agent_id: 'technician_copilot',
        mode: 'Bidirectional Audio/Video',
        repair_done: incident?.repair_done ?? false,
      },
    },
    'agent-scribe': {
      id: 'agent-scribe',
      status: l4ScribeStatus,
      badgeText: '8D Drafting',
      summary: scribeFinding?.finding ?? 'Drafts formal 8D report, maintenance work order, and SOP updates.',
      isInferred: false,
      details: {
        agent_id: 'incident_scribe',
        documents: Object.keys(incident?.documents ?? {}).length,
      },
    },
    'agent-learn': {
      id: 'agent-learn',
      status: l4LearnStatus,
      badgeText: isClosed ? 'Indexed' : 'Standby',
      summary: learnFinding?.finding ?? 'Indexes verified procedure into RAG and calculates ESG impact.',
      isInferred: false,
      details: {
        agent_id: 'continuous_learning',
        scrap_avoided_kg: incident?.impact?.scrap_avoided ?? 48.5,
      },
    },

    // Layer 5
    'human-tech': {
      id: 'human-tech',
      status: l5TechStatus,
      badgeText: isRepairing ? 'Wrenching' : 'Standby',
      summary: 'Field technician executes tool replacement and clicks [Confirm Repair Done].',
      isInferred: true,
      details: {
        role: 'Alex Morgan (Bay 4)',
        repair_confirmed: incident?.repair_done ?? false,
      },
    },
    'verify-camera': {
      id: 'verify-camera',
      status: l5VerifyCamStatus,
      badgeText: `${currentStreak} / ${targetStreak}`,
      summary: 'Optical camera verifies defect clearance and counts consecutive clean parts.',
      isInferred: true,
      details: {
        current_streak: currentStreak,
        target_streak: targetStreak,
      },
    },
    'decision-gate-2': {
      id: 'decision-gate-2',
      status: l5Gate2Status,
      badgeText: currentStreak >= targetStreak ? '50/50 Unlocked' : `${currentStreak}/50 Locked`,
      summary: 'Invariant #3 Gate: Shift Leader sign-off strictly hard-locked until 50 clean parts.',
      isInferred: true,
      details: {
        target: targetStreak,
        current: currentStreak,
        unlocked: currentStreak >= targetStreak,
      },
    },
    'streak-reset': {
      id: 'streak-reset',
      status: l5ResetStatus,
      badgeText: isEscalated ? 'Siren Alarm' : 'Standby',
      summary: 'Defect detected during verification resets streak to 0/50 and sounds bay siren.',
      isInferred: true,
      details: {
        penalty: 'Streak reset to 0/50',
        andon_light: isEscalated ? 'FLASHING_RED' : 'OFF',
      },
    },
    'human-dash': {
      id: 'human-dash',
      status: l5DashStatus,
      badgeText: isNominal ? 'Nominal' : 'Active View',
      summary: 'Plant operations command center for line health and multi-agent monitoring.',
      isInferred: true,
      details: {
        view: 'Line Overview & Incident Detail',
        line: 'Cell Line 1',
      },
    },
    'human-lead': {
      id: 'human-lead',
      status: l5LeadStatus,
      badgeText: incident?.approved ? 'Signed' : currentStreak >= targetStreak ? 'Unlocked' : 'Locked',
      summary: 'Shift Leader reviews 8D dossier and executes cryptographic digital sign-off.',
      isInferred: true,
      details: {
        shift_leader: 'David Vance',
        signature_ready: currentStreak >= targetStreak,
      },
    },
    'output-docs': {
      id: 'output-docs',
      status: l5DocsStatus,
      badgeText: incident?.approved ? 'Certified' : 'Draft',
      summary: 'Permanent compliance artifacts: signed 8D dossier, work order, and updated SOP.',
      isInferred: true,
      details: {
        dossier: '8D-2026-B42',
        compliance: 'IATF 16949 / ISO 9001',
      },
    },
  };
}

/**
 * Generates rich mock states for all 28 nodes matching the 6 interactive scenarios.
 */
function deriveScenarioStates(
  scenario: TopologyScenarioId,
  incident: IncidentState | null,
): Record<TopologyNodeId, TopologyNodeState> {
  const base = deriveNodeStates(incident);

  if (scenario === 'nominal') {
    // Everything nominal/idle
    return base;
  }

  if (scenario === 'detecting') {
    base['floor-machines'].status = 'active';
    base['floor-machines'].badgeText = 'Running 3200';
    base['floor-cameras'].status = 'danger';
    base['floor-cameras'].badgeText = 'Defect Spike';
    base['floor-sensors'].status = 'danger';
    base['floor-sensors'].badgeText = 'RMS 2.84 mm/s';
    base['floor-mics'].status = 'danger';
    base['floor-mics'].badgeText = 'Chatter Alert';
    base['edge-gemma'].status = 'warning';
    base['edge-gemma'].badgeText = '50ms Divert';
    base['edge-bridge'].status = 'warning';
    base['edge-bridge'].badgeText = 'Buffer Telemetry';
    base['gcp-pubsub'].status = 'active';
    base['gcp-pubsub'].badgeText = 'Burst Ingest';
    base['gcp-bigquery'].status = 'active';
    base['gcp-bigquery'].badgeText = 'Querying Lot';
    base['gcp-firestore'].status = 'danger';
    base['gcp-firestore'].badgeText = 'INC-B42 Open';
    base['adk-orch'].status = 'active';
    base['adk-orch'].badgeText = 'Coordinating';
    base['agent-qa'].status = 'active';
    base['agent-qa'].badgeText = 'SPC Breach';
    return base;
  }

  if (scenario === 'low_confidence') {
    base['agent-rca'].status = 'warning';
    base['agent-rca'].badgeText = 'Conf 0.58 < 0.70';
    base['decision-gate-1'].status = 'warning';
    base['decision-gate-1'].badgeText = 'NO (< 0.70)';
    base['diagnostic-agent'].status = 'active';
    base['diagnostic-agent'].badgeText = 'Photo Req Sent';
    base['technician-photo'].status = 'active';
    base['technician-photo'].badgeText = 'Capturing Edge';
    return base;
  }

  if (scenario === 'streak_verifying') {
    base['copilot-live'].status = 'done';
    base['human-tech'].status = 'done';
    base['human-tech'].badgeText = 'Repair Done';
    base['verify-camera'].status = 'active';
    base['verify-camera'].badgeText = '42 / 50 Clean';
    base['decision-gate-2'].status = 'active';
    base['decision-gate-2'].badgeText = '42/50 In Progress';
    base['human-lead'].status = 'locked';
    base['human-lead'].badgeText = 'Locked (< 50)';
    return base;
  }

  if (scenario === 'streak_reset') {
    base['verify-camera'].status = 'danger';
    base['verify-camera'].badgeText = 'Defect @ Part 43';
    base['decision-gate-2'].status = 'danger';
    base['decision-gate-2'].badgeText = 'Defect Detected!';
    base['streak-reset'].status = 'danger';
    base['streak-reset'].badgeText = 'Reset to 0/50';
    base['human-lead'].status = 'locked';
    base['human-lead'].badgeText = 'Locked';
    return base;
  }

  if (scenario === 'approved') {
    base['verify-camera'].status = 'done';
    base['verify-camera'].badgeText = '50 / 50 Clean';
    base['decision-gate-2'].status = 'done';
    base['decision-gate-2'].badgeText = '50/50 Certified';
    base['human-lead'].status = 'done';
    base['human-lead'].badgeText = 'E-Signed';
    base['output-docs'].status = 'done';
    base['output-docs'].badgeText = 'Certified 8D';
    base['agent-learn'].status = 'done';
    base['agent-learn'].badgeText = 'RAG Upserted';
    return base;
  }

  return base;
}

/**
 * Derives overall state per phase swimlane (A, B, C, D) and layers (1-5) from node states.
 */
export function derivePhaseStates(
  _incident: IncidentState | null,
  nodeStates: Record<TopologyNodeId, TopologyNodeState>,
): Record<TopologyPhaseId, TopologyPhaseState> {
  const result: Record<TopologyPhaseId, TopologyPhaseState> = {
    'phase-a': { id: 'phase-a', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 3 },
    'phase-b': { id: 'phase-b', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 3 },
    'phase-c': { id: 'phase-c', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 3 },
    'phase-d': { id: 'phase-d', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 2 },
    'layer-1': { id: 'layer-1', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 5 },
    'layer-2': { id: 'layer-2', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 2 },
    'layer-3': { id: 'layer-3', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 5 },
    'layer-4': { id: 'layer-4', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 11 },
    'layer-5': { id: 'layer-5', status: 'idle', activeNodeCount: 0, completedNodeCount: 0, totalNodeCount: 7 },
  };

  for (const node of TOPOLOGY_NODES) {
    const p = node.phase;
    const l = node.layer;
    const st = nodeStates[node.id];
    if (!st) continue;

    const isNodeActive = st.status === 'active' || st.status === 'waiting' || st.status === 'warning' || st.status === 'danger';
    const isNodeDone = st.status === 'done' || st.status === 'completed';

    if (result[p]) {
      if (isNodeActive) result[p].activeNodeCount += 1;
      if (isNodeDone) result[p].completedNodeCount += 1;
    }
    if (l && result[l]) {
      if (isNodeActive) result[l].activeNodeCount += 1;
      if (isNodeDone) result[l].completedNodeCount += 1;
    }
  }

  for (const key of Object.keys(result) as TopologyPhaseId[]) {
    const p = result[key];
    if (p.activeNodeCount > 0) p.status = 'active';
    else if (p.completedNodeCount === p.totalNodeCount && p.totalNodeCount > 0) p.status = 'completed';
    else p.status = 'idle';
  }

  return result;
}

/**
 * Helper accessor to retrieve all nodes partitioned to Window 1 (Factory Floor & On-Prem Edge Gateway).
 */
export function getWindow1Nodes(): TopologyNodeDefinition[] {
  return TOPOLOGY_NODES.filter((node) => node.window === 'window-1');
}

/**
 * Helper accessor to retrieve all nodes partitioned to Window 2 (Cloud Platform, ADK Agent Swarm, Governance & Outputs).
 */
export function getWindow2Nodes(): TopologyNodeDefinition[] {
  return TOPOLOGY_NODES.filter((node) => node.window === 'window-2');
}

/**
 * Derives the active architectural Phase ('phase-a' | 'phase-b' | 'phase-c' | 'phase-d')
 * based on the current scenario or live incident state.
 */
export function deriveActivePhase(
  incident: IncidentState | null,
  scenario?: TopologyScenarioId,
): TopologyPhaseId {
  if (scenario) {
    switch (scenario) {
      case 'nominal':
      case 'detecting':
        return 'phase-a';
      case 'low_confidence':
        return 'phase-b';
      case 'streak_verifying':
      case 'streak_reset':
        return 'phase-c';
      case 'approved':
        return 'phase-d';
      default:
        return 'phase-a';
    }
  }

  if (!incident || incident.status === 'normal' || incident.status === 'detecting') {
    return 'phase-a';
  }

  const { status } = incident;

  if (
    status === 'tracing' ||
    status === 'investigating' ||
    status === 'analyzing' ||
    status === 'awaiting_evidence'
  ) {
    return 'phase-b';
  }

  if (status === 'repairing' || status === 'verifying') {
    return 'phase-c';
  }

  if (status === 'closed' || status === 'dismissed') {
    return 'phase-d';
  }

  if (status === 'escalated') {
    if (incident.repair_done || (incident.verification_count ?? 0) > 0) {
      return 'phase-c';
    }
    return 'phase-b';
  }

  if (status === 'error') {
    return 'phase-b';
  }

  return 'phase-a';
}


export type PhaseStepperStatus = 'idle' | 'active' | 'completed' | 'warning' | 'danger';

export interface PhaseStepInfo {
  id: string;
  phaseId: TopologyPhaseId;
  title: string;
  shortTitle: string;
  description: string;
  status: PhaseStepperStatus;
  statusText: string;
  icon: string;
  targetLayerId: string;
}

/**
 * Derives dynamic step states and labels for the Tier 1 Glance Phase Stepper Bar
 * across scenarios and incident lifecycle progression (AC-TOP-23, Issue #227).
 */
export function derivePhaseStepperInfo(
  incident: IncidentState | null,
  scenario?: TopologyScenarioId | 'live',
): PhaseStepInfo[] {
  const activeScenario = scenario === 'live' ? undefined : scenario;

  let stepA: { status: PhaseStepperStatus; text: string; icon: string };
  let stepB: { status: PhaseStepperStatus; text: string; icon: string };
  let stepC: { status: PhaseStepperStatus; text: string; icon: string };
  let stepD: { status: PhaseStepperStatus; text: string; icon: string };

  if (activeScenario) {
    switch (activeScenario) {
      case 'nominal':
        stepA = { status: 'idle', text: 'Idle', icon: 'sensors' };
        stepB = { status: 'idle', text: 'Idle', icon: 'psychology' };
        stepC = { status: 'idle', text: 'Idle', icon: 'support_agent' };
        stepD = { status: 'idle', text: 'Idle', icon: 'verified' };
        break;
      case 'detecting':
        stepA = { status: 'completed', text: 'Detected', icon: 'check_circle' };
        stepB = { status: 'active', text: 'RCA Active', icon: 'psychology' };
        stepC = { status: 'idle', text: 'Queued', icon: 'support_agent' };
        stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
        break;
      case 'low_confidence':
        stepA = { status: 'completed', text: 'Detected', icon: 'check_circle' };
        stepB = { status: 'warning', text: 'Evidence Req', icon: 'warning' };
        stepC = { status: 'idle', text: 'Queued', icon: 'support_agent' };
        stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
        break;
      case 'streak_verifying':
        stepA = { status: 'completed', text: 'Resolved', icon: 'check_circle' };
        stepB = { status: 'completed', text: 'RCA OK', icon: 'check_circle' };
        stepC = { status: 'completed', text: 'Repaired', icon: 'check_circle' };
        stepD = { status: 'active', text: '42 / 50', icon: 'sync' };
        break;
      case 'streak_reset':
        stepA = { status: 'completed', text: 'Resolved', icon: 'check_circle' };
        stepB = { status: 'completed', text: 'RCA OK', icon: 'check_circle' };
        stepC = { status: 'completed', text: 'Repaired', icon: 'check_circle' };
        stepD = { status: 'danger', text: '0 / 50 Reset', icon: 'error' };
        break;
      case 'approved':
        stepA = { status: 'completed', text: 'Verified', icon: 'check_circle' };
        stepB = { status: 'completed', text: 'Verified', icon: 'check_circle' };
        stepC = { status: 'completed', text: 'Verified', icon: 'check_circle' };
        stepD = { status: 'completed', text: '50/50 Certified', icon: 'verified' };
        break;
      default:
        stepA = { status: 'idle', text: 'Idle', icon: 'sensors' };
        stepB = { status: 'idle', text: 'Idle', icon: 'psychology' };
        stepC = { status: 'idle', text: 'Idle', icon: 'support_agent' };
        stepD = { status: 'idle', text: 'Idle', icon: 'verified' };
        break;
    }
  } else {
    // Live Incident state progression
    const status = incident?.status ?? 'normal';
    const streak = incident?.verification_count ?? 0;
    const target = incident?.verification_target ?? 50;

    if (!incident || status === 'normal') {
      stepA = { status: 'idle', text: 'Idle', icon: 'sensors' };
      stepB = { status: 'idle', text: 'Idle', icon: 'psychology' };
      stepC = { status: 'idle', text: 'Idle', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Idle', icon: 'verified' };
    } else if (status === 'detecting') {
      stepA = { status: 'active', text: 'Detecting', icon: 'sensors' };
      stepB = { status: 'idle', text: 'Queued', icon: 'psychology' };
      stepC = { status: 'idle', text: 'Queued', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
    } else if (status === 'tracing' || status === 'investigating' || status === 'analyzing') {
      stepA = { status: 'completed', text: 'Detected', icon: 'check_circle' };
      stepB = { status: 'active', text: 'RCA Active', icon: 'psychology' };
      stepC = { status: 'idle', text: 'Queued', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
    } else if (status === 'awaiting_evidence') {
      stepA = { status: 'completed', text: 'Detected', icon: 'check_circle' };
      stepB = { status: 'warning', text: 'Evidence Req', icon: 'warning' };
      stepC = { status: 'idle', text: 'Queued', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
    } else if (status === 'repairing') {
      stepA = { status: 'completed', text: 'Resolved', icon: 'check_circle' };
      stepB = { status: 'completed', text: 'RCA OK', icon: 'check_circle' };
      stepC = { status: 'active', text: 'Repairing', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Locked', icon: 'lock' };
    } else if (status === 'verifying') {
      stepA = { status: 'completed', text: 'Resolved', icon: 'check_circle' };
      stepB = { status: 'completed', text: 'RCA OK', icon: 'check_circle' };
      stepC = { status: 'completed', text: 'Repaired', icon: 'check_circle' };
      stepD = { status: 'active', text: `${streak} / ${target}`, icon: 'sync' };
    } else if (status === 'closed') {
      stepA = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepB = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepC = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepD = { status: 'completed', text: '50/50 Certified', icon: 'verified' };
    } else if (status === 'dismissed') {
      stepA = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepB = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepC = { status: 'completed', text: 'Verified', icon: 'check_circle' };
      stepD = { status: 'completed', text: 'Dismissed', icon: 'verified' };
    } else if (status === 'escalated' || status === 'error') {
      stepA = { status: 'completed', text: 'Resolved', icon: 'check_circle' };
      stepB = { status: 'completed', text: 'RCA OK', icon: 'check_circle' };
      stepC = { status: 'completed', text: 'Repaired', icon: 'check_circle' };
      stepD = { status: 'danger', text: `${streak} / ${target} Reset`, icon: 'error' };
    } else {
      stepA = { status: 'idle', text: 'Idle', icon: 'sensors' };
      stepB = { status: 'idle', text: 'Idle', icon: 'psychology' };
      stepC = { status: 'idle', text: 'Idle', icon: 'support_agent' };
      stepD = { status: 'idle', text: 'Idle', icon: 'verified' };
    }
  }

  return [
    {
      id: 'step-phase-a',
      phaseId: 'phase-a',
      title: 'Phase A: Detection & Ingest',
      shortTitle: 'Detection & Ingest',
      description: 'Edge Gemma 3 · MQTT 100Hz · UCL 3.0%',
      status: stepA.status,
      statusText: stepA.text,
      icon: stepA.icon,
      targetLayerId: 'phase-1',
    },
    {
      id: 'step-phase-b',
      phaseId: 'phase-b',
      title: 'Phase B: Tracing & RCA',
      shortTitle: 'Tracing & RCA',
      description: 'BigQuery Lots · FFT Drift · 5-Whys Swarm',
      status: stepB.status,
      statusText: stepB.text,
      icon: stepB.icon,
      targetLayerId: 'phase-3',
    },
    {
      id: 'step-phase-c',
      phaseId: 'phase-c',
      title: 'Phase C: Resolution & Fix',
      shortTitle: 'Resolution & Fix',
      description: 'Gemini Live Copilot · Field Repair · WO-8812',
      status: stepC.status,
      statusText: stepC.text,
      icon: stepC.icon,
      targetLayerId: 'phase-4',
    },
    {
      id: 'step-phase-d',
      phaseId: 'phase-d',
      title: 'Phase D: Closure & Continuous Learning',
      shortTitle: 'Closure & Learning',
      description: 'Invariant #3 (50/50) · E-Sign · ESG Ledger',
      status: stepD.status,
      statusText: stepD.text,
      icon: stepD.icon,
      targetLayerId: 'phase-5',
    },
  ];
}

/**
 * Derives dynamic pulse styling and status pill text for Window 2 container (AC-TOP-21, AC-TOP-22).
 */
export function deriveWindow2State(
  incident: IncidentState | null,
  scenario?: TopologyScenarioId | 'live',
): { pulseClass: string; statusText: string } {
  if (scenario && scenario !== 'live') {
    switch (scenario) {
      case 'nominal':
        return { pulseClass: '', statusText: 'Standby Nominal' };
      case 'detecting':
        return { pulseClass: 'calm-pulse-active', statusText: 'RCA In-Flight' };
      case 'low_confidence':
        return { pulseClass: 'calm-pulse-warning', statusText: 'Diagnostic Loop (<0.70)' };
      case 'streak_verifying':
        return { pulseClass: 'calm-pulse-active', statusText: 'Verifying Streak (42/50)' };
      case 'streak_reset':
        return { pulseClass: 'calm-pulse-danger', statusText: 'Defect Alarm (0/50)' };
      case 'approved':
        return { pulseClass: '', statusText: 'Closed & Certified' };
      default:
        return { pulseClass: '', statusText: 'Swarm Active' };
    }
  }

  const status = incident?.status ?? 'normal';
  if (!incident || status === 'normal') {
    return { pulseClass: '', statusText: 'Standby Nominal' };
  }
  if (status === 'detecting') {
    return { pulseClass: 'calm-pulse-active', statusText: 'Anomaly Ingest' };
  }
  if (status === 'tracing' || status === 'investigating' || status === 'analyzing') {
    return { pulseClass: 'calm-pulse-active', statusText: 'RCA In-Flight' };
  }
  if (status === 'awaiting_evidence') {
    return { pulseClass: 'calm-pulse-warning', statusText: 'Diagnostic Loop (<0.70)' };
  }
  if (status === 'repairing') {
    return { pulseClass: 'calm-pulse-active', statusText: 'Technician Repair Active' };
  }
  if (status === 'verifying') {
    return {
      pulseClass: 'calm-pulse-active',
      statusText: `Verifying Streak (${incident.verification_count ?? 0}/50)`,
    };
  }
  if (status === 'escalated' || status === 'error') {
    return { pulseClass: 'calm-pulse-danger', statusText: 'Defect Alarm (Reset)' };
  }
  if (status === 'closed' || status === 'dismissed') {
    return { pulseClass: '', statusText: 'Closed & Certified' };
  }

  return { pulseClass: '', statusText: 'Swarm Active' };
}
