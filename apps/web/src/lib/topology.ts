// Shared Topology models, catalogs and pure state derivation helpers (Issue #205 & #211).
import type {
  IncidentState,
  IncidentStatus,
  TopologyEdgeDefinition,
  TopologyLayerDefinition,
  TopologyLayerId,
  TopologyNodeDefinition,
  TopologyNodeId,
  TopologyNodeState,
  TopologyPhaseDefinition,
  TopologyPhaseId,
  TopologyPhaseState,
} from '../types';
import { matchesAgentRole } from './incident';

// 5 Industrial Architecture Layers matching docs/kaizen-agent-architecture.mmd & Issue #211
export const TOPOLOGY_LAYERS: TopologyLayerDefinition[] = [
  {
    id: 'layer-1',
    number: 1,
    name: 'Layer 1: Factory Floor · Edge Data Sources',
    subtitle: 'CNC Machines, Exit Conveyor Cameras, Vibration/Temp Sensors, Microphones & QR Codes',
    badgeClass: 'l1',
    badgeColor: '#10b981',
    chipText: '5 Edge Sources Active',
    chipClass: 'chip-green',
  },
  {
    id: 'layer-2',
    number: 2,
    name: 'Layer 2: On-Premises Gateway · Gemma Edge & Bridge',
    subtitle: 'Gemma 3 2B Local Inference (>95% Pre-Filter) & Industrial OPC-UA / MQTT Protocol Gateway',
    badgeClass: 'l2',
    badgeColor: '#f59e0b',
    chipText: 'On-Premises Low Bandwidth',
    chipClass: 'chip-amber',
  },
  {
    id: 'layer-3',
    number: 3,
    name: 'Layer 3: Google Cloud · Data & AI Platform',
    subtitle: 'Cloud Pub/Sub, BigQuery Warehouse, Firestore Shared Blackboard, Vertex RAG & Gemini 2.5',
    badgeClass: 'l3',
    badgeColor: '#3b82f6',
    chipText: 'GCP us-central1',
    chipClass: 'chip-blue',
  },
  {
    id: 'layer-4',
    number: 4,
    name: 'Layer 4: Agent Team · Google ADK Multi-Agent System',
    subtitle: 'ADK Orchestrator, Quality Inspector, RCA Swarm (Traceability + Telemetry), Copilot & Continuous Learning',
    badgeClass: 'l4',
    badgeColor: '#6366f1',
    chipText: 'ADK Swarm Active',
    chipClass: 'chip-purple',
  },
  {
    id: 'layer-5',
    number: 5,
    name: 'Layer 5: Human-in-the-Loop & Operational Outputs',
    subtitle: 'Technician Mobile Copilot, Conveyor Optical Proof (Invariant #3), Shift Leader Sign-Off & 8D Dossiers',
    badgeClass: 'l5',
    badgeColor: '#8b5cf6',
    chipText: 'Shop-Floor Ergonomics',
    chipClass: 'chip-pink',
  },
];

// Preserved 4-Phase Lifecycle mapping for backwards compatibility and test verification
export const TOPOLOGY_PHASES: TopologyPhaseDefinition[] = [
  {
    id: 'phase-a',
    letter: 'A',
    name: 'Detection & Ingestion',
    vietnameseName: 'Phát hiện & Thu nhận',
    description: 'On-premise vision classification, MQTT streaming, and SPC upper control limit monitoring.',
    lampColor: 'red',
    lampHex: '#e5484d',
  },
  {
    id: 'phase-b',
    letter: 'B',
    name: 'Tracing & Root Cause',
    vietnameseName: 'Truy vết & Nguyên nhân',
    description: 'BigQuery lot graph traceability, sensor anomaly analysis, and grounded 5-Whys causal reasoning.',
    lampColor: 'yellow',
    lampHex: '#f5a524',
  },
  {
    id: 'phase-c',
    letter: 'C',
    name: 'Resolution & Verification',
    vietnameseName: 'Khắc phục & Kiểm chứng',
    description: 'Gemini Live multimodal technician guidance, 8D documentation, and 50-part clean conveyor verification.',
    lampColor: 'blue',
    lampHex: '#3b82f6',
  },
  {
    id: 'phase-d',
    letter: 'D',
    name: 'Learning & Governance',
    vietnameseName: 'Học hỏi & Phê duyệt',
    description: 'RAG institutional memory indexing, ESG sustainability ledger, and shift-leader sign-off.',
    lampColor: 'green',
    lampHex: '#12a150',
  },
];

// Comprehensive 28-node catalog with rich metadata, SLAs, channels, fallbacks, and UI references
export const TOPOLOGY_NODES: TopologyNodeDefinition[] = [
  // ==========================================
  // LAYER 1: FACTORY FLOOR · EDGE DATA SOURCES
  // ==========================================
  {
    id: 'floor-machines',
    layer: 'layer-1',
    phase: 'phase-a',
    order: 1,
    label: 'CNC / Injection Machines',
    sublabel: 'Cell Line 1 · Turning & Milling Station',
    tier: 'Tier 1 & 2',
    tierDescription: 'Machine Execution & Process Telemetry',
    icon: 'precision_manufacturing',
    techStack: ['Siemens S7-1500 PLC', 'FANUC 31i-B CNC', 'OPC-UA Server'],
    jtbd: 'Executes high-precision machining cycles (spindle 3200 RPM, feed rate 0.28 mm/rev); broadcasts machine cycle status.',
    sla: '50 ms process cycle update',
    channel: 'opcua://line1.cell1.turning/spindle',
    fallback: 'Local PLC ring buffer (24h retention)',
    metrics: [
      { label: 'Spindle', value: '3200 RPM' },
      { label: 'Feed', value: '0.28 mm' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Line Overview',
      route: 'Screen 1: /overview#machine-fleet-telemetry',
      component: '<MachineFleetTable />',
      ctaLabel: 'Inspect CNC-02 Machine Fleet',
      previewDescription: 'Real-time spindle metrics, feed rate, and vibration status across CNC-01, CNC-02, CNC-03 fleet.',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-cameras',
    layer: 'layer-1',
    phase: 'phase-a',
    order: 2,
    label: 'EOL Optical Cameras (CAM-EOL)',
    sublabel: 'High-Speed Defect Imaging Station · Bay 4 Exit',
    tier: 'Tier 1 & 2',
    tierDescription: 'Real-Time Defect Vision Glance (<1s)',
    icon: 'videocam',
    techStack: ['Basler ace 2 GigE Vision', '1080p @ 60 FPS', 'GenICam'],
    jtbd: 'Captures 60 FPS high-resolution surface images of finished workpieces exiting the machining line for defect detection.',
    sla: '< 16 ms frame acquisition',
    channel: 'rtsp://cam-eol.bay4.internal/stream1',
    fallback: 'Circular edge RAM buffer (500 frames)',
    metrics: [
      { label: 'Rate', value: '60 FPS' },
      { label: 'Res', value: '1080p' },
    ],
    uiRef: {
      surface: 'Shop-Floor Terminal · Bay 4 Exit Conveyor',
      route: 'Screen 1: /overview#conveyor-optical-feed',
      component: '<OpticalEdgeTerminal />',
      ctaLabel: 'Open CAM-EOL Live Feed',
      previewDescription: 'High-speed optical inspection frame feed streaming workpiece surface video for classification.',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-sensors',
    layer: 'layer-1',
    phase: 'phase-a',
    order: 3,
    label: 'Sensors (Vib/Temp)',
    sublabel: 'Spindle Tri-axial Accelerometer & RTD',
    tier: 'Tier 1 & 2',
    tierDescription: 'High-Frequency Telemetry & FFT Diagnostics',
    icon: 'sensors',
    techStack: ['IFM VVB001 Tri-axial', 'PT100 RTD', 'IO-Link Master'],
    jtbd: 'Monitors spindle vibration RMS, bearing temperatures, motor phase current, and hydraulic pressure at 100 Hz sampling.',
    sla: '100 Hz continuous sampling',
    channel: 'opcua://line1.cell1.sensors/triaxial_vibration',
    fallback: 'IO-Link master local flash buffer',
    metrics: [
      { label: 'Rate', value: '100 Hz' },
      { label: 'RMS', value: '1.48 mm/s' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Diagnostics Modal',
      route: 'Screen 1: /overview#diagnostics-modal',
      component: '<DiagnosticsModal /> & <SpindleVibrationChart />',
      ctaLabel: 'Inspect Sensor Telemetry FFT',
      previewDescription: 'Spindle vibration RMS trend, 100Hz harmonics, and temperature tracking modal.',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-mics',
    layer: 'layer-1',
    phase: 'phase-a',
    order: 4,
    label: 'Microphones (Sound)',
    sublabel: 'Chamber Acoustic Emissions Spectrum',
    tier: 'Tier 3 & 4',
    tierDescription: 'Acoustic Spectrum Anomaly Detection',
    icon: 'mic',
    techStack: ['Knowles MEMS Acoustic Sensor', '24-bit ADC', 'FFT Pre-filter'],
    jtbd: 'Samples continuous acoustic emissions in CNC machining chamber to isolate high-frequency tool chatter and bearing friction.',
    sla: '20 kHz audio sampling',
    channel: 'mqtt://edge/audio/acoustic_spectrum',
    fallback: 'Local FFT spectrogram buffer',
    metrics: [
      { label: 'Band', value: '20 kHz' },
      { label: 'SNR', value: '68 dB' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Diagnostics Modal',
      route: 'Screen 1: /overview#acoustic-telemetry',
      component: '<AcousticSpectrumChart />',
      ctaLabel: 'Inspect Acoustic Spectrum',
      previewDescription: 'Chamber acoustic frequency spectrum showing micro-chatter and resonance peaks.',
      targetTab: 'overview',
    },
  },
  {
    id: 'floor-tags',
    layer: 'layer-1',
    phase: 'phase-b',
    order: 5,
    label: 'Traceability Code',
    sublabel: 'QR / Laser Marking & RFID',
    tier: 'Tier 1 & 2',
    tierDescription: 'Discrete Workpiece Barcode & Conveyor Position',
    icon: 'qr_code_2',
    techStack: ['Keyence SR-2000 2D Reader', 'DPM Laser Marking', 'Profinet'],
    jtbd: 'Encodes unique workpiece serial, raw billet heat lot, and conveyor tracking timestamps for full genealogy tracing.',
    sla: '< 25 ms decode time',
    channel: 'mqtt://edge/conveyor/workpiece_tag',
    fallback: 'Conveyor optical indexing encoder',
    metrics: [
      { label: 'Lot', value: 'B42-0941' },
      { label: 'Sync', value: 'Active' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#lot-genealogy',
      component: '<LotGenealogyTree />',
      ctaLabel: 'Inspect Workpiece Lot Genealogy',
      previewDescription: 'Unbroken lot genealogy linking workpiece barcode to CNC-02, spindle 1, and billet heat 8842.',
      targetTab: 'incident-detail',
    },
  },

  // ========================================================
  // LAYER 2: ON-PREMISES GATEWAY · GEMMA EDGE & BRIDGE
  // ========================================================
  {
    id: 'edge-gemma',
    layer: 'layer-2',
    phase: 'phase-a',
    order: 6,
    label: 'Gemma Local Inference',
    sublabel: 'Gemma 3 2B Edge On-Prem (>95% Filter)',
    tier: 'Tier 1 & 2',
    tierDescription: 'Sub-50ms inference, pneumatic diverter actuation, >95% frame reduction',
    icon: 'memory',
    techStack: ['Gemma 3 2B INT4', 'ONNX Runtime', 'Advantech IPC', '24V Solenoid'],
    jtbd: 'Runs local SLM vision inference to pre-filter >95% nominal video frames, detects defect spikes, and triggers 50ms pneumatic rejector.',
    sla: '< 50 ms inference cycle',
    channel: 'mqtt://edge/conveyor/optical_frames',
    fallback: 'Circular edge RAM buffer (500 frames)',
    metrics: [
      { label: 'Inference', value: '42 ms' },
      { label: 'Filter Drop', value: '96.2%' },
    ],
    uiRef: {
      surface: 'Shop-Floor Terminal · Bay 4 Edge Gateway',
      route: 'Screen 1: /overview#edge-gateway',
      component: '<EdgeInferenceMonitor />',
      ctaLabel: 'Open Edge Gateway Console',
      previewDescription: 'On-premise IPC telemetry monitor displaying frame filter efficiency, inference latency, and pneumatic scrap diverter status.',
      targetTab: 'overview',
    },
  },
  {
    id: 'edge-bridge',
    layer: 'layer-2',
    phase: 'phase-a',
    order: 7,
    label: 'OPC-UA / MQTT Bridge',
    sublabel: 'High-Freq Telemetry Buffer & Protocol Adapter',
    tier: 'Tier 1 & 2',
    tierDescription: 'Industrial Telemetry Normalization & Edge Buffering',
    icon: 'hub',
    techStack: ['Eclipse Milo OPC-UA', 'EMQX Broker', 'SQLite Spool', 'JSON Schema'],
    jtbd: 'Translates proprietary PLC protocols into standardized MQTT / Pub/Sub payloads; buffers 100 Hz sensor and acoustic telemetry streams.',
    sla: '< 10 ms bridge latency',
    channel: 'mqtt://edge/broker/telemetry_100hz',
    fallback: 'Local SQLite store-and-forward spool (2GB)',
    metrics: [
      { label: 'Rate', value: '100 msg/s' },
      { label: 'Buffer', value: '0 Loss' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Line Overview',
      route: 'Screen 1: /overview#gateway-telemetry',
      component: '<EdgeBridgeMonitor />',
      ctaLabel: 'Inspect Telemetry Bridge Buffer',
      previewDescription: 'Protocol bridge status dashboard monitoring OPC-UA ingestion rate and store-and-forward queue health.',
      targetTab: 'overview',
    },
  },

  // ========================================================
  // LAYER 3: GOOGLE CLOUD · DATA & AI PLATFORM
  // ========================================================
  {
    id: 'cloud-ingest',
    layer: 'layer-3',
    phase: 'phase-a',
    order: 8,
    label: 'Pub/Sub & Orchestrator Ingest',
    sublabel: 'Cloud Ingestion Stream Bus (Legacy Alias)',
    tier: 'Tier 3 & 4',
    tierDescription: 'Cloud message streaming and incident workflow dispatch',
    icon: 'cloud_sync',
    techStack: ['Cloud Pub/Sub', 'ADK Orchestrator', 'Firestore Blackboard'],
    jtbd: 'Ingest anomaly events from edge gateway and dispatch multi-agent workflow via reactive shared blackboard.',
    sla: '< 20 ms delivery SLA',
    channel: 'projects/kaizen-anomaly/topics/factory-events',
    fallback: 'Dead letter queue with 7-day retention',
    metrics: [
      { label: 'Latency', value: '12 ms' },
      { label: 'Queue', value: '0 Backlog' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Cloud Data Plane',
      route: 'Screen 1: /overview#cloud-ingest',
      component: '<PubSubStreamMonitor />',
      ctaLabel: 'Inspect Cloud Ingestion',
      previewDescription: 'Real-time Pub/Sub message broker ingesting anomaly events and dispatching to ADK orchestrator.',
      targetTab: 'overview',
    },
  },
  {
    id: 'gcp-pubsub',
    layer: 'layer-3',
    phase: 'phase-a',
    order: 9,
    label: 'Cloud Pub/Sub',
    sublabel: 'Real-Time Ingestion Bus',
    tier: 'Tier 3 & 4',
    tierDescription: 'Cloud Data Pipeline & Event Broker',
    icon: 'alt_route',
    techStack: ['Cloud Pub/Sub', 'Topic: factory-events', 'Sub: adk-sub'],
    jtbd: 'High-throughput asynchronous message broker ingesting anomalous defect frames, sensor events, and SPC trigger messages.',
    sla: '< 20 ms delivery SLA',
    channel: 'projects/kaizen-anomaly/topics/factory-events',
    fallback: 'Dead letter queue with 7-day retention',
    metrics: [
      { label: 'Latency', value: '12 ms' },
      { label: 'Queue', value: '0 Backlog' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Cloud Data Plane',
      route: 'Screen 1: /overview#pubsub-metrics',
      component: '<PubSubStreamMonitor />',
      ctaLabel: 'Inspect Pub/Sub Event Stream',
      previewDescription: 'Conveyor event bus feeding raw telemetry to BigQuery and anomaly packets to ADK multi-agent swarm.',
      targetTab: 'overview',
    },
  },
  {
    id: 'gcp-bigquery',
    layer: 'layer-3',
    phase: 'phase-b',
    order: 10,
    label: 'BigQuery Warehouse',
    sublabel: 'Traceability & Telemetry Warehouse',
    tier: 'Tier 3 & 4',
    tierDescription: 'Deep Analytical Storage & SPC Baselines',
    icon: 'database',
    techStack: ['BigQuery', 'Partitioned Tables', 'BigQuery Emulator', 'SQL Tool'],
    jtbd: 'Stores petabyte-scale discrete lot genealogy, raw sensor time-series, Nelson Rules SPC baselines, and historical incident records.',
    sla: '< 850 ms query response',
    channel: 'bigquery://kaizen-anomaly.telemetry',
    fallback: 'Local goccy/bigquery-emulator fallback',
    metrics: [
      { label: 'Query SLA', value: '< 850ms' },
      { label: 'Dataset', value: 'kaizen_mfg' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#bigquery-logs',
      component: '<BigQueryTraceViewer />',
      ctaLabel: 'Run Traceability Query',
      previewDescription: 'Scans discrete lot genealogy and 100Hz vibration telemetry to isolate machine and tool anomalies.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'gcp-firestore',
    layer: 'layer-3',
    phase: 'phase-b',
    order: 11,
    label: 'Cloud Firestore',
    sublabel: 'Shared Incident Blackboard (SSE Live)',
    tier: 'Tier 3 & 4',
    tierDescription: 'Reactive Swarm State Synchronization',
    icon: 'view_kanban',
    techStack: ['Firestore Native', 'SSE Stream', 'Asyncio Blackboard', 'JSON Schema'],
    jtbd: 'Provides multi-agent reactive incident blackboard with Server-Sent Events (SSE) streaming; only ADK Orchestrator holds write permissions.',
    sla: '< 30 ms SSE push latency',
    channel: 'firestore://projects/kaizen/databases/(default)',
    fallback: 'Firestore local emulator on port 8080',
    metrics: [
      { label: 'Sync', value: '24 ms' },
      { label: 'Doc', value: 'INC-B42' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#blackboard',
      component: '<OrchestratorBlackboardFeed />',
      ctaLabel: 'Inspect Live Blackboard Snapshot',
      previewDescription: 'Real-time reactive shared state feed streaming incident status and multi-agent findings via SSE.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'gcp-rag',
    layer: 'layer-3',
    phase: 'phase-b',
    order: 12,
    label: 'Vertex AI Search & RAG',
    sublabel: '8D Archives, OEM Manuals & Video Index',
    tier: 'Tier 3 & 4',
    tierDescription: 'Semantic Knowledge Retrieval',
    icon: 'menu_book',
    techStack: ['Vertex AI Search', 'Text Embeddings', 'RAG Engine', 'Vector Store'],
    jtbd: 'Performs hybrid semantic search over OEM machine manuals, 8D defect-cause-fix archives, maintenance logs, and expert video transcripts.',
    sla: '< 450 ms semantic retrieval',
    channel: 'projects/kaizen/locations/global/collections/default_collection',
    fallback: 'Local SQLite BM25 text fallback index',
    metrics: [
      { label: 'Index', value: '4,200 SOPs' },
      { label: 'Latency', value: '420 ms' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Knowledge Base',
      route: 'Screen 4: /impact#rag-search',
      component: '<KnowledgeSearch />',
      ctaLabel: 'Search Industrial RAG Knowledge',
      previewDescription: 'Hybrid semantic search retrieving verified citations from 4,200 machine manuals and historical 8D reports.',
      targetTab: 'impact',
    },
  },
  {
    id: 'gcp-gemini',
    layer: 'layer-3',
    phase: 'phase-c',
    order: 13,
    label: 'Gemini on Vertex AI',
    sublabel: 'Multimodal Foundation Models (2.5 Flash / Pro & Live)',
    tier: 'Tier 3 & 4',
    tierDescription: 'Multimodal Defect Reasoning & Audio/Video Stream',
    icon: 'smart_toy',
    techStack: ['Gemini 2.5 Flash', 'Gemini 2.5 Pro', 'Gemini Live WebSocket API'],
    jtbd: 'Powers multimodal defect image inspection, causal 5-Whys hypothesis generation, bidirectional Live audio/video streaming, and video reasoning.',
    sla: '< 1.2s multimodal inference / < 200ms Live stream',
    channel: 'wss://generativelanguage.googleapis.com/ws/live',
    fallback: 'Cached local decision tree rules',
    metrics: [
      { label: 'Context', value: '1M Tokens' },
      { label: 'Modalities', value: 'Live + Audio' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Tech Walkthroughs',
      route: 'Screen 1: /walkthroughs#gemini-status',
      component: '<GeminiModelConsole />',
      ctaLabel: 'Inspect Gemini Model Console',
      previewDescription: 'Powers vision inspection, causal reasoning, video-to-procedure RAG, and bidirectional technician audio.',
      targetTab: 'walkthroughs',
    },
  },

  // ========================================================
  // LAYER 4: AGENT TEAM · GOOGLE ADK MULTI-AGENT SYSTEM
  // ========================================================
  {
    id: 'adk-orch',
    layer: 'layer-4',
    phase: 'phase-a',
    order: 14,
    label: 'Orchestrator Agent (ADK)',
    sublabel: 'Single Entry/Exit · Sole Blackboard Writer',
    tier: 'Tier 3 & 4',
    tierDescription: 'Swarm Lifecycle Coordination & Guardrails',
    icon: 'account_tree',
    techStack: ['Google ADK 2.x Python', 'FastAPI', 'Cloud Run', 'Tool Guards'],
    jtbd: 'Central entry and exit point: receives every input event, opens incident blackboard sessions, coordinates swarm tasks, and writes to Firestore.',
    sla: '< 200 ms task dispatch',
    channel: 'adk://workflow/incident_lifecycle',
    fallback: 'Deterministic fallback execution graph',
    metrics: [
      { label: 'SLA', value: '< 200 ms' },
      { label: 'Swarm', value: '5 Agents' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#orchestrator',
      component: '<OrchestratorBlackboardFeed />',
      ctaLabel: 'Inspect Orchestrator State',
      previewDescription: 'ADK Orchestrator coordinating quality inspection, traceability, process analysis, and copilot repair.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-qa',
    layer: 'layer-4',
    phase: 'phase-a',
    order: 15,
    label: 'Quality Inspector Agent',
    sublabel: 'Phase A: Defect Classification & SPC Alarm',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with SPC Upper Control Limit (3.0%) Gate',
    icon: 'rule',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash', 'SPC Calculator', 'Nelson Rules'],
    jtbd: 'Classifies defect types from optical feeds, monitors SPC Upper Control Limit (UCL 3.0%), and acts as post-repair verification gatekeeper.',
    sla: '< 250 ms evaluation',
    channel: 'blackboard.quality_inspector.spc_status',
    fallback: 'Rule-based UCL threshold check (UCL=3.0%)',
    metrics: [
      { label: 'SPC UCL', value: '3.0%' },
      { label: 'Breach', value: '4.42%' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Line Overview',
      route: 'Screen 1: /overview#spc-chart',
      component: '<StatisticalProcessControlChart />',
      ctaLabel: 'Inspect SPC Control Chart',
      previewDescription: 'Real-time p-chart monitoring defect rate trends and Nelson Rule 1 UCL breach triggers.',
      targetTab: 'overview',
    },
  },
  {
    id: 'agent-tra',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 16,
    label: 'Traceability Agent',
    sublabel: 'Phase B: BigQuery Lot Genealogy',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with BigQuery Tool',
    icon: 'fork_right',
    techStack: ['ADK Agent', 'BigQuery SQL', 'Graph Traversal', 'NetworkX'],
    jtbd: 'Traces discrete manufacturing topology; queries BigQuery lot genealogy to correlate workpiece barcode with suspect CNC tool insert.',
    sla: '< 600 ms query execution',
    channel: 'blackboard.traceability.suspect_ranks',
    fallback: 'Last known machine assignment cache',
    metrics: [
      { label: 'Query SLA', value: '< 600 ms' },
      { label: 'Suspect', value: 'CNC-02 / T07' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#lot-genealogy',
      component: '<LotGenealogyTree />',
      ctaLabel: 'Inspect Traceability Tree',
      previewDescription: 'Lot genealogy tree correlating defective workpiece serials to suspect machine CNC-02 and tool insert T07.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-pa',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 17,
    label: 'Process Analyst Agent',
    sublabel: 'Phase B: High-Freq Telemetry FFT',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Telemetry History Tool',
    icon: 'analytics',
    techStack: ['ADK Agent', 'Numpy FFT', 'Scipy Signal', 'Drift Detection'],
    jtbd: 'Fetches high-frequency spindle vibration RMS, temperature, and motor load; runs FFT analysis to detect statistical drift prior to defect onset.',
    sla: '< 800 ms spectral analysis',
    channel: 'blackboard.process_analyst.telemetry_anomaly',
    fallback: 'Threshold-based standard deviation check',
    metrics: [
      { label: 'Vibration', value: '2.84 mm/s' },
      { label: 'Baseline', value: '1.50 mm/s' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Diagnostics Modal',
      route: 'Screen 1: /overview#diagnostics-modal',
      component: '<DiagnosticsModal />',
      ctaLabel: 'Inspect Spindle Telemetry',
      previewDescription: 'FFT spectral peak analysis isolating harmonic vibration chatter at 1420 Hz on spindle bearing.',
      targetTab: 'overview',
    },
  },
  {
    id: 'agent-rca',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 18,
    label: 'Root Cause Agent',
    sublabel: 'Phase B: 5-Whys Synthesis + RAG',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Vertex AI Search Tool',
    icon: 'psychology',
    techStack: ['ADK Agent', 'Gemini 2.5 Pro', 'Vertex AI Search', 'Ishikawa / 5-Whys'],
    jtbd: 'Synthesizes discrete lot genealogy, continuous telemetry drift, and Vertex AI Search (RAG) archives to construct 5-Whys causal tree.',
    sla: '< 3.2s synthesis',
    channel: 'blackboard.root_cause.synthesis',
    fallback: 'Top historical 8D matching heuristic',
    metrics: [
      { label: 'Reasoning', value: '< 3.2s' },
      { label: 'Confidence', value: '0.89' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#causal-tree',
      component: '<CausalChainTree /> & <IshikawaDiagram />',
      ctaLabel: 'Inspect 5-Whys Causal Tree',
      previewDescription: 'Explainable 5-Whys causal tree and Ishikawa diagram with citations from OEM manuals and 8D reports.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'decision-gate-1',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 19,
    label: 'Decision Gate 1',
    sublabel: 'Confidence Threshold Evaluation (>= 0.70?)',
    tier: 'Tier 3 & 4',
    tierDescription: 'Causal Confidence Evaluation Gate',
    icon: 'diamond',
    techStack: ['ADK Gate', 'Threshold: 0.70', 'Blackboard Gate'],
    jtbd: 'Evaluates causal hypothesis certainty before dispatching field wrenching. If < 0.70, requests technician photo; if >= 0.70, proceeds to repair.',
    sla: '< 10 ms deterministic branch',
    channel: 'blackboard.gates.confidence_check',
    fallback: 'Default to conservative evidence request',
    isGate: true,
    metrics: [
      { label: 'Threshold', value: '0.70' },
      { label: 'Status', value: 'Branching' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Triage Gate',
      route: 'Screen 3: /incident-detail#confidence-gate',
      component: '<DiagnosticEvidenceRequestModal />',
      ctaLabel: 'Inspect Confidence Gate',
      previewDescription: 'Deterministic routing diamond evaluating whether RCA confidence meets 0.70 threshold for repair execution.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'diagnostic-agent',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 20,
    label: 'Diagnostic Agent',
    sublabel: 'Loop: Awaiting Field Evidence (< 0.70)',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent for Low-Confidence Evidence Dispatch',
    icon: 'search_check',
    techStack: ['ADK Agent', 'Cloud Tasks', 'Push Notification'],
    jtbd: 'Activated when RCA confidence < 0.70. Sets incident status to awaiting_evidence and dispatches targeted photo request to technician.',
    sla: '< 500 ms task dispatch',
    channel: 'blackboard.diagnostic.evidence_request',
    fallback: 'Senior Technician manual override escalation',
    metrics: [
      { label: 'Threshold', value: '< 0.70' },
      { label: 'Trigger', value: 'Photo Request' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Triage Gate',
      route: 'Screen 3: /incident-detail#diagnostic-request',
      component: '<DiagnosticEvidenceRequestModal />',
      ctaLabel: 'Inspect Diagnostic Request',
      previewDescription: 'Dispatches targeted photo inspection request to technician when causal confidence is below 0.70 threshold.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'technician-photo',
    layer: 'layer-4',
    phase: 'phase-b',
    order: 21,
    label: 'Technician Photo Inspection',
    sublabel: 'Loop: Gemini Vision Tool Inspection',
    tier: 'Tier 4 & 5',
    tierDescription: 'Shop-Floor Macro Visual Evidence Capture',
    icon: 'photo_camera',
    techStack: ['Mobile Camera', 'Gemini 2.5 Flash Vision', 'ISO 3685 Standard'],
    jtbd: 'Technician captures macro photo of cutting tool wear insert at Bay 4. Gemini Vision re-evaluates evidence and feeds result back to RCA.',
    sla: '< 1.2s vision analysis',
    channel: 'blackboard.diagnostic.photo_evidence',
    fallback: 'Manual technician symptom checkoff',
    metrics: [
      { label: 'Modal', value: 'Mobile Camera' },
      { label: 'Loop', value: 'Re-eval RCA' },
    ],
    uiRef: {
      surface: 'Mobile App · Technician Copilot',
      route: 'Screen 2: /mobile#macro-capture',
      component: '<EvidenceCaptureCamera />',
      ctaLabel: 'Inspect Captured Macro Photo',
      previewDescription: 'High-resolution macro photo tool inspection re-evaluating tool flank wear to boost causal confidence.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'copilot-live',
    layer: 'layer-4',
    phase: 'phase-c',
    order: 22,
    label: 'Technician Copilot Live',
    sublabel: 'Phase C: Gemini Live WebSocket Stream',
    tier: 'Tier 4 & 5',
    tierDescription: 'Gemini Live WebSocket + Bay-side technician interaction',
    icon: 'support_agent',
    techStack: ['Gemini Live API', 'WebSocket', 'Voice/Camera', 'ADK Checkpoints'],
    jtbd: 'Bidirectional Gemini Live WebSocket audio/video stream providing hands-free step-by-step tool replacement and torque calibration guidance.',
    sla: '< 180 ms voice interaction latency',
    channel: 'wss://kaizen-api.internal/live/copilot-stream',
    fallback: 'Step-by-step static text checklist',
    metrics: [
      { label: 'Latency', value: '180 ms' },
      { label: 'Channel', value: 'Live Audio/Video' },
    ],
    uiRef: {
      surface: 'Mobile App · Technician Live Copilot',
      route: 'Screen 2: /mobile#copilot-live',
      component: '<GeminiLiveActionSheet />',
      ctaLabel: 'Open Mobile Live Copilot',
      previewDescription: 'Hands-free bidirectional audio/video stream guiding technician through tool insert swap with torque verification.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-scribe',
    layer: 'layer-4',
    phase: 'phase-c',
    order: 23,
    label: 'Incident Scribe Agent',
    sublabel: 'Phase C: 8D Report & Work Order',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent for Automated Technical Reporting',
    icon: 'description',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash', 'Markdown / JSON', 'Jinja2 PDF'],
    jtbd: 'Drafts structured 8D incident report, generates maintenance work order with torque specs, and prepares revised SOP documentation.',
    sla: '< 1.8s generation',
    channel: 'blackboard.scribe.documents_draft',
    fallback: 'Pre-formatted standard 8D markdown template',
    metrics: [
      { label: 'Generation', value: '< 1.8s' },
      { label: 'Artifacts', value: '8D + WorkOrder' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#8d-report',
      component: '<EightDReportCard /> & <WorkOrderDraft />',
      ctaLabel: 'Open 8D Report Draft',
      previewDescription: 'Auto-compiled 8D incident dossier, containment actions, root-cause validation, and preventive SOP revision draft.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'agent-learn',
    layer: 'layer-4',
    phase: 'phase-d',
    order: 24,
    label: 'Continuous Learning Agent',
    sublabel: 'Phase D: Video-to-Procedure RAG & ESG',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Impact Calculator & RAG Store',
    icon: 'auto_stories',
    techStack: ['ADK Agent', 'Vertex AI Vector Store', 'Impact Calculator', 'GHG Protocol'],
    jtbd: 'Calculates ESG impact (scrap avoided, energy saved), converts verified repair recording to vector SOP, and updates institutional knowledge base.',
    sla: '< 4.5s video-to-SOP generation',
    channel: 'blackboard.learning.sop_update',
    fallback: 'Manual reviewer approval queue',
    metrics: [
      { label: 'Scrap Avoided', value: '48.5 kg' },
      { label: 'Index Commit', value: '+1 SOP' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Knowledge Base',
      route: 'Screen 4: /sops#change-log',
      component: '<SOPChangeLogCard /> & <ImpactCard />',
      ctaLabel: 'Inspect ESG Impact & SOP Diff',
      previewDescription: 'Tracks scrap units avoided, energy conserved, carbon reduction, and auto-indexed SOP procedural updates.',
      targetTab: 'impact',
    },
  },

  // ========================================================
  // LAYER 5: HUMAN-IN-THE-LOOP & OPERATIONAL OUTPUTS
  // ========================================================
  {
    id: 'human-tech',
    layer: 'layer-5',
    phase: 'phase-c',
    order: 25,
    label: 'Bay 4 Field Technician',
    sublabel: 'Mobile Operator App · Guided Wrenching',
    tier: 'Tier 4 & 5',
    tierDescription: 'Hands-On Machine Repair Execution',
    icon: 'handyman',
    techStack: ['React Native / PWA', 'Bluetooth Torque Wrench', '48px Touch Target'],
    jtbd: 'Receives hands-free step-by-step wrenching instructions, replaces worn T07 tool insert, and taps the primary 48px [Confirm Repair Done] CTA.',
    sla: '< 15 min physical repair turnaround',
    channel: 'https://kaizen-mobile.internal/task/WO-8842',
    fallback: 'Shop-floor printed emergency run-sheet',
    metrics: [
      { label: 'Role', value: 'Alex Morgan' },
      { label: 'CTA', value: '48px [Confirm]' },
    ],
    uiRef: {
      surface: 'Mobile App · Station HMI · Bay 4',
      route: 'Screen 2: /mobile#work-order-signoff',
      component: '<WorkOrderConfirmationBar />',
      ctaLabel: 'Open Technician Mobile App',
      previewDescription: 'Glove-friendly mobile interface with 48px action button for wrenching confirmation and torque logging.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'verify-camera',
    layer: 'layer-5',
    phase: 'phase-c',
    order: 26,
    label: 'Conveyor Optical Camera',
    sublabel: 'Post-Repair Optical Inspection & Invariant #3',
    tier: 'Tier 1 & 2',
    tierDescription: 'Continuous Optical Stream & Physical Proof',
    icon: 'camera_indoor',
    techStack: ['Basler GigE Vision', 'FPGA Edge Frame Counter', 'Conveyor Vision'],
    jtbd: 'Resumes continuous optical scanning of newly machined workpieces to verify defect elimination and increment the clean streak counter.',
    sla: 'Continuous 60 FPS real-time inspection',
    channel: 'blackboard.verification.camera_stream',
    fallback: 'Manual QC micrometer sampling audit',
    metrics: [
      { label: 'Frame Rate', value: '60 FPS' },
      { label: 'Target', value: '>= 50 Clean' },
    ],
    uiRef: {
      surface: 'Shop-Floor Terminal · Exit Conveyor',
      route: 'Screen 1: /overview#streak-meter',
      component: '<ConveyorStreakMonitor />',
      ctaLabel: 'Inspect Conveyor Streak Camera',
      previewDescription: 'Real-time FPGA optical counter measuring consecutive defect-free parts exiting the repair station.',
      targetTab: 'overview',
    },
  },
  {
    id: 'decision-gate-2',
    layer: 'layer-5',
    phase: 'phase-c',
    order: 27,
    label: 'Verification Gate (Invariant #3)',
    sublabel: 'Conveyor Streak Verification (>= 50 Clean Parts?)',
    tier: 'Tier 3 & 4',
    tierDescription: 'Hard Physical Lock for Shift Leader Sign-Off',
    icon: 'verified',
    techStack: ['Conveyor Vision', 'Streak Gatekeeper', 'Invariant #3', 'Deterministic Counter'],
    jtbd: 'Hard lock: Shift Leader sign-off disabled until continuous optical proof reaches 50/50 consecutive clean workpieces.',
    sla: '< 10 ms gate state update',
    channel: 'blackboard.gates.streak_verification',
    fallback: 'Mandatory QC Lead dual-key override',
    isGate: true,
    metrics: [
      { label: 'Target', value: '50 Clean' },
      { label: 'Current', value: '0 / 50' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#streak-gate',
      component: '<StreakVerificationGate />',
      ctaLabel: 'Inspect Verification Gate',
      previewDescription: 'Enforces Key Invariant #3: product evidence required before closure approval can be unlocked.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'gatekeeper-qa',
    layer: 'layer-5',
    phase: 'phase-c',
    order: 28,
    label: 'Quality Gatekeeper',
    sublabel: 'Conveyor Streak Verification (Legacy Alias)',
    tier: 'Tier 4',
    tierDescription: 'Key Invariant #3 verification engine',
    icon: 'verified',
    techStack: ['Conveyor Vision', 'Streak Gatekeeper', 'Invariant #3', 'Deterministic Counter'],
    jtbd: 'Enforce Invariant #3: certify 50 consecutive clean workpieces on the conveyor before unlocking closure approval.',
    sla: '< 10 ms gate state update',
    channel: 'blackboard.gates.streak_verification',
    fallback: 'Mandatory QC Lead dual-key override',
    metrics: [
      { label: 'Target', value: '50 Clean' },
      { label: 'Invariant', value: '#3 Product Proof' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command',
      route: 'Screen 3: /incident-detail#streak-gate',
      component: '<StreakVerificationGate />',
      ctaLabel: 'Inspect Verification Gate',
      previewDescription: 'Enforces Key Invariant #3: product evidence required before closure approval can be unlocked.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'streak-reset',
    layer: 'layer-5',
    phase: 'phase-c',
    order: 29,
    label: 'Streak Defect Reset & Bay Siren',
    sublabel: 'Invariant #3 Failure Penalty & Escalation',
    tier: 'Tier 1 & 2',
    tierDescription: 'Immediate Shop-Floor Stop & Escalation',
    icon: 'emergency_home',
    techStack: ['Hardware IO Relay', 'Bay Andon Tower Alarm', 'Blackboard Escalate'],
    jtbd: 'Triggered when any defect is detected during verification streak: resets count to 0/50, escalates incident, sounds bay Andon alarm, and loops back to Copilot.',
    sla: '< 10 ms alarm trigger',
    channel: 'blackboard.verification.streak_reset',
    fallback: 'Shift Leader physical buzzer trip',
    metrics: [
      { label: 'Penalty', value: 'Reset 0/50' },
      { label: 'Action', value: 'Escalate & Re-inspect' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard & Alarm Annunciator',
      route: 'Screen 3: /incident-detail#escalation',
      component: '<StreakResetAlarmBanner />',
      ctaLabel: 'Inspect Escalation Protocol',
      previewDescription: 'Penalty banner triggered on defect recurrence, resetting verification counter to 0 and sounding bay alarm.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'human-dash',
    layer: 'layer-5',
    phase: 'phase-d',
    order: 30,
    label: 'Incident Board Dashboard',
    sublabel: 'Plant Ops Line Overview & Command Center',
    tier: 'Tier 1 & 2',
    tierDescription: 'Real-Time Plant Situational Awareness',
    icon: 'dashboard',
    techStack: ['React', 'Vite', 'TypeScript', 'Lumina Slate CSS'],
    jtbd: 'Plant operations command center providing real-time situational awareness, machine health, and multi-agent findings for shift teams.',
    sla: '< 50 ms reactive state render',
    channel: 'https://kaizen-dashboard.internal/overview',
    fallback: 'Local cached dashboard snapshot',
    metrics: [
      { label: 'Latency', value: '24 ms' },
      { label: 'View', value: 'Line Overview' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Incident Command Workspace',
      route: 'Screen 3: /incident-detail',
      component: '<IncidentWorkspace />',
      ctaLabel: 'Open Incident Command Board',
      previewDescription: 'Command center displaying active incident triage, multi-agent findings, and live streak verification.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'human-lead',
    layer: 'layer-5',
    phase: 'phase-d',
    order: 31,
    label: 'Shift Leader Approval Gate',
    sublabel: 'Digital E-Signature · Release Gate',
    tier: 'Tier 5',
    tierDescription: 'Governance & Cryptographic Sign-Off Gate',
    icon: 'verified_user',
    techStack: ['Web Cryptography API', 'SHA-256 Signature', 'Audit Trail', 'Blackboard Gate'],
    jtbd: 'Shift leader reviews completed 8D dossier, confirms verified 50-part streak, and applies cryptographic digital signature to approve incident closure.',
    sla: 'Manual human gatekeeper review',
    channel: 'blackboard.approval.signoff',
    fallback: 'Plant Manager manual emergency key override',
    metrics: [
      { label: 'Sign-off', value: 'David Vance' },
      { label: 'Gate', value: 'Locked (< 50)' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Authorization Modal',
      route: 'Screen 3: /incident-detail#release-modal',
      component: '<ReleaseApprovalModal />',
      ctaLabel: 'Open Shift Leader Release Modal',
      previewDescription: 'Cryptographic SHA-256 e-signature dialog unlocked only upon successful completion of the 50-part clean streak.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'human-approval',
    layer: 'layer-5',
    phase: 'phase-d',
    order: 32,
    label: 'Shift Leader Approval',
    sublabel: 'Human-in-the-Loop Governance (Legacy Alias)',
    tier: 'Tier 5',
    tierDescription: 'Final human governance gate with cryptographic sign-off',
    icon: 'gavel',
    techStack: ['Human Operator', 'Digital Signature', 'Audit Trail', 'Blackboard Gate'],
    jtbd: 'Review validated 8D dossier, verify post-repair conveyor certification, and apply formal shift-leader sign-off.',
    sla: 'Manual human gatekeeper review',
    channel: 'blackboard.approval.signoff',
    fallback: 'Plant Manager manual emergency key override',
    metrics: [
      { label: 'Role', value: 'Shift Leader' },
      { label: 'Gate', value: 'Digital E-Sign' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Authorization Modal',
      route: 'Screen 3: /incident-detail#release-modal',
      component: '<ReleaseApprovalModal />',
      ctaLabel: 'Open Shift Leader Release Modal',
      previewDescription: 'Cryptographic SHA-256 e-signature dialog unlocked only upon successful completion of the 50-part clean streak.',
      targetTab: 'incident-detail',
    },
  },
  {
    id: 'output-docs',
    layer: 'layer-5',
    phase: 'phase-d',
    order: 33,
    label: 'Operational Output Documents',
    sublabel: '8D Dossier, Work Order & SOP Update',
    tier: 'Tier 3 & 4',
    tierDescription: 'Permanent Audit & Regulatory Records',
    icon: 'inventory_2',
    techStack: ['PDF/A', 'JSON Schema', 'Cloud Storage Archive', 'ISO 9001'],
    jtbd: 'Compiles permanent regulatory compliance artifacts: certified 8D incident dossier, closed maintenance work order, and updated machining SOP.',
    sla: 'Immutable permanent archive',
    channel: 'gs://kaizen-records/2026/INC-B42',
    fallback: 'Local redundant document volume',
    metrics: [
      { label: 'Format', value: 'PDF + JSON' },
      { label: 'Compliance', value: 'ISO 9001 / IATF' },
    ],
    uiRef: {
      surface: 'Desktop Dashboard · Knowledge Base & Compliance',
      route: 'Screen 4: /impact#signed-dossiers',
      component: '<EightDSheet /> & <SOPChangeLogCard />',
      ctaLabel: 'Download Certified 8D Dossier',
      previewDescription: 'Permanent compliance dossier including signed 8D report, maintenance work order, and updated machining SOP cards.',
      targetTab: 'impact',
    },
  },
];

// Complete directional pipeline edges across all 5 layers, decision gates, and recovery loops
export const TOPOLOGY_EDGES: TopologyEdgeDefinition[] = [
  // Layer 1 -> Layer 2
  { from: 'floor-machines', to: 'edge-bridge', label: 'OPC-UA' },
  { from: 'floor-cameras', to: 'edge-gemma', label: 'GigE Stream' },
  { from: 'floor-sensors', to: 'edge-bridge', label: '100 Hz IO-Link' },
  { from: 'floor-mics', to: 'edge-bridge', label: '20 kHz Audio' },
  { from: 'floor-tags', to: 'edge-bridge', label: 'Barcode Event' },

  // Layer 2 -> Layer 3
  { from: 'edge-gemma', to: 'cloud-ingest', label: 'MQTT Telemetry' },
  { from: 'edge-gemma', to: 'gcp-pubsub', label: 'Defect Frame Event' },
  { from: 'edge-bridge', to: 'gcp-pubsub', label: 'OPC-UA to Pub/Sub' },

  // Layer 3 Internal & to Layer 4
  { from: 'cloud-ingest', to: 'agent-qa', label: 'Event Stream' },
  { from: 'gcp-pubsub', to: 'adk-orch', label: 'Anomaly Ingest' },
  { from: 'gcp-pubsub', to: 'gcp-bigquery', label: 'Raw Telemetry' },
  { from: 'adk-orch', to: 'gcp-firestore', label: 'Sole Blackboard Writer' },
  { from: 'gcp-rag', to: 'agent-rca', label: 'SOP Citations' },
  { from: 'gcp-gemini', to: 'copilot-live', label: 'Live WebSocket' },

  // Layer 4 Multi-Agent Reasoning Swarm
  { from: 'adk-orch', to: 'agent-qa', label: 'SPC Evaluation' },
  { from: 'agent-qa', to: 'agent-tra', label: 'SPC Trigger' },
  { from: 'agent-qa', to: 'agent-pa', label: 'Timestamp Window' },
  { from: 'agent-tra', to: 'agent-rca', label: 'Suspect Asset' },
  { from: 'agent-pa', to: 'agent-rca', label: 'Sensor Drift' },
  { from: 'agent-rca', to: 'decision-gate-1', label: 'Confidence Score' },

  // Decision Gate 1 Branches
  { from: 'decision-gate-1', to: 'diagnostic-agent', label: 'NO (< 0.70): Photo Loop' },
  { from: 'diagnostic-agent', to: 'technician-photo', label: 'Photo Request' },
  { from: 'technician-photo', to: 'agent-rca', label: 'Evidence Return (+0.31)' },
  { from: 'decision-gate-1', to: 'copilot-live', label: 'YES (>= 0.70): Proceed to Repair' },

  // Resolution & Verification Flow
  { from: 'copilot-live', to: 'agent-scribe', label: 'Repair Log' },
  { from: 'copilot-live', to: 'human-tech', label: 'Guided Wrenching' },
  { from: 'human-tech', to: 'verify-camera', label: 'Confirm Repair Done' },
  { from: 'verify-camera', to: 'decision-gate-2', label: 'Post-Repair Optical Stream' },
  { from: 'copilot-live', to: 'gatekeeper-qa', label: 'Repair Complete' },
  { from: 'agent-scribe', to: 'gatekeeper-qa', label: '8D Draft' },

  // Decision Gate 2 (Invariant #3) Branches
  { from: 'decision-gate-2', to: 'streak-reset', label: 'NO (Defect Detected): Reset 0/50' },
  { from: 'streak-reset', to: 'copilot-live', label: 'Re-inspect & Torque Check' },
  { from: 'decision-gate-2', to: 'agent-learn', label: 'YES (Streak >= 50): Certified Clean' },
  { from: 'gatekeeper-qa', to: 'agent-learn', label: '50 Clean Parts Verified' },

  // Governance & Operational Outputs
  { from: 'agent-scribe', to: 'output-docs', label: '8D Dossier' },
  { from: 'agent-learn', to: 'human-lead', label: 'ESG Metrics & Dossier Ready' },
  { from: 'agent-learn', to: 'human-approval', label: 'Dossier Ready' },
  { from: 'human-lead', to: 'output-docs', label: 'Digital Sign-off' },
  { from: 'human-approval', to: 'output-docs', label: 'Sign-off Certified' },
  { from: 'adk-orch', to: 'human-dash', label: 'Blackboard State' },
];

// Default telemetry and blackboard payloads for drawer deep inspection
export const NODE_PAYLOADS: Record<TopologyNodeId, Record<string, unknown>> = {
  'floor-machines': {
    machine_id: 'CNC-02',
    line_id: 'LINE-01-CELL-1',
    spindle_rpm: 3200,
    feed_rate_mm_rev: 0.28,
    cycle_status: 'RUNNING',
    coolant_pressure_bar: 18.2,
  },
  'floor-cameras': {
    camera_id: 'CAM-EOL-01',
    resolution: '1920x1080',
    fps: 60,
    lens_mm: 25,
    exposure_us: 850,
    conveyor_speed_m_s: 0.45,
  },
  'floor-sensors': {
    sensor_id: 'VIB-CNC02-SPINDLE',
    sampling_hz: 100,
    vibration_rms_mm_s: 2.84,
    baseline_rms_mm_s: 1.50,
    bearing_temp_c: 58.4,
    phase_current_a: 14.2,
  },
  'floor-mics': {
    mic_id: 'MIC-BAY4-CHAMBER',
    freq_range: '20Hz-20kHz',
    snr_db: 68,
    peak_resonance_khz: 7.4,
    chatter_probability: 0.84,
  },
  'floor-tags': {
    workpiece_serial: 'WP-2026-90412',
    lot_id: 'LOT-B42-0941',
    billet_heat: 'HEAT-8842',
    conveyor_station: 'BAY-4-ENTRY',
    timestamp: '2026-10-16T10:40:00Z',
  },
  'edge-gemma': {
    device_id: 'IPC-BAY4-01',
    model: 'gemma-3-2b-it-int4',
    frame_filter_ratio: '96.2%',
    pneumatic_diverter_ms: 38,
    inference_latency_ms: 42,
  },
  'edge-bridge': {
    bridge_id: 'GW-BAY4-BRIDGE',
    protocol_in: 'OPC-UA binary',
    protocol_out: 'MQTT / PubSub',
    throughput_msg_sec: 100,
    buffer_dropped: 0,
  },
  'cloud-ingest': {
    service: 'Google Cloud Pub/Sub + Cloud Run',
    topic: 'projects/kaizen/topics/telemetry-events',
    blackboard_backend: 'Asyncio + Firestore Live Stream',
    publish_rate_msg_s: 140,
    latency_ms: 12,
  },
  'gcp-pubsub': {
    topic: 'factory-events',
    subscription: 'adk-orchestrator-sub',
    publish_rate_msg_s: 140,
    unacked_messages: 0,
    latency_ms: 12,
  },
  'gcp-bigquery': {
    dataset: 'kaizen_mfg',
    table: 'sensor_telemetry_100hz',
    rows_scanned: 124000,
    query_duration_ms: 780,
    identified_lot: 'LOT-B42-0941',
  },
  'gcp-firestore': {
    document_path: 'incidents/INC-2026-B42',
    state: 'investigating',
    active_agents: ['QualityInspector', 'Traceability', 'ProcessAnalyst', 'RCA'],
    version: 4,
    sync_latency_ms: 24,
  },
  'gcp-rag': {
    data_store: 'kaizen-sop-knowledge-base',
    top_k: 3,
    top_citation: 'SOP-CNC-TOOL-CALIB-v4',
    similarity_score: 0.94,
    category: 'tool_wear_vibration',
  },
  'gcp-gemini': {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    tokens_used: 1420,
    capabilities: ['vision_macro_inspection', 'live_websocket_voice', 'structured_json'],
  },
  'adk-orch': {
    incident_id: 'INC-2026-B42',
    orchestrator_state: 'TRIAGING',
    dispatched_agents: ['QualityInspector', 'Traceability', 'ProcessAnalyst'],
    blackboard_writes: 12,
  },
  'agent-qa': {
    defect_rate: '4.42%',
    ucl_threshold: '3.00%',
    spc_alarm: true,
    defect_type: 'surface_tear_bevel',
    confidence: 0.96,
  },
  'agent-tra': {
    primary_suspect: 'CNC-02 / Spindle 1',
    tool_id: 'T07-FACE-MILL',
    lot_id: 'LOT-B42-0941',
    confidence: 0.94,
  },
  'agent-pa': {
    vibration_rms: '2.84 mm/s',
    baseline_rms: '1.50 mm/s',
    spectral_peak_hz: 1420,
    chatter_detected: true,
  },
  'agent-rca': {
    root_cause: 'T07 Flank Wear & Insert Micro-fracture',
    confidence: 0.89,
    sop_reference: 'SOP-CNC-TOOL-CALIB-v4',
    recommendation: 'Replace tool insert & recalibrate torque to 4.5 Nm',
  },
  'decision-gate-1': {
    gate_name: 'Causal Confidence Gate',
    threshold: 0.70,
    confidence_evaluated: 0.89,
    branch_selected: 'YES (>= 0.70)',
    next_node: 'copilot-live',
  },
  'diagnostic-agent': {
    status: 'awaiting_evidence',
    confidence_evaluated: 0.58,
    target_inspection: 'CNC-02 Spindle Tool T07 Flank Surface',
    assigned_tech: 'Alex Morgan',
  },
  'technician-photo': {
    photo_id: 'IMG-CNC02-T07-WEAR',
    flank_wear_width_mm: 0.38,
    iso_standard: 'ISO 3685: VB_max > 0.3mm',
    confidence_boost: '+0.31 -> 0.89',
  },
  'copilot-live': {
    session_id: 'LIVE-VOICE-8842',
    active_language: 'vi-VN',
    guided_steps_completed: '3/3',
    current_step: 'Tighten Torx T15 screw to 4.5 Nm',
  },
  'agent-scribe': {
    document_type: '8D_INCIDENT_REPORT',
    disciplines_complete: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'],
    d7_preventive_action: 'Tighten inspection interval to 200 cycles',
  },
  'agent-learn': {
    video_analysis: 'COMPLETED',
    scrap_avoided_kg: 48.5,
    energy_saved_kwh: 312.4,
    co2e_avoided_kg: 84.2,
    vector_commit_id: 'VEC-SOP-CNC-T07-v5',
  },
  'human-tech': {
    technician_id: 'TECH-ALEX-M',
    bay_id: 'BAY-4',
    tool_replaced: 'T07-FACE-MILL-INSERT',
    torque_applied_nm: 4.5,
    status: 'REPAIR_COMPLETED',
  },
  'verify-camera': {
    camera_id: 'CAM-EOL-01',
    post_repair_frames_analyzed: 42,
    defects_detected: 0,
    current_streak: 42,
    target_streak: 50,
  },
  'decision-gate-2': {
    invariant: 'Key Invariant #3: Product evidence streak verification',
    verification_count: 42,
    verification_target: 50,
    target_met: false,
    gate_status: 'LOCKED (42/50)',
  },
  'gatekeeper-qa': {
    invariant: 'Key Invariant #3: Product-evidence streak verification',
    verification_count: 42,
    verification_target: 50,
    target_met: false,
  },
  'streak-reset': {
    reset_event: false,
    penalty_rule: 'Any defect resets counter to 0/50',
    andon_siren: 'ARMED',
  },
  'human-dash': {
    active_line: 'Cell Line 1',
    active_incidents: 1,
    line_oee: '86.4%',
    spc_alarm_status: 'ACTIVE',
  },
  'human-lead': {
    shift_leader: 'David Vance',
    e_sign_token: 'SHA256-88F4-4291-KAIZEN',
    signoff_unlocked: true,
    timestamp: '2026-10-16T11:15:00Z',
  },
  'human-approval': {
    role: 'Shift Leader',
    approved: false,
    closure_unlocked: false,
  },
  'output-docs': {
    document_id: '8D-2026-B42-FINAL',
    status: 'APPROVED_AND_LOCKED',
    signed_by: 'David Vance',
    compliance: 'IATF 16949 D1-D8 compliant',
    files: ['8d_report.pdf', 'work_order_signed.pdf', 'sop_v5.json'],
  },
};

/**
 * Pure function deriving runtime status, summaries, and extracted details for all 28 topology nodes
 * from the live IncidentState on the blackboard.
 */
export function deriveNodeStates(incident: IncidentState | null): Record<TopologyNodeId, TopologyNodeState> {
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

  // Layer 1 Nodes State
  let machinesStatus: TopologyNodeState['status'] = 'idle';
  let machinesSummary = 'All fleet CNC-01, CNC-02, CNC-03 running nominal machining cycles.';
  if (stage >= 1) {
    machinesStatus = 'active';
    machinesSummary = incident?.suspect_machine
      ? `${incident.suspect_machine} showing tool wear chatter and vibration drift.`
      : 'CNC-02 running workpiece turning with tool chatter telemetry.';
  }

  let camerasStatus: TopologyNodeState['status'] = 'idle';
  let camerasSummary = 'Streaming 60 FPS surface frames to on-premise Gemma edge classifier.';
  if (stage === 1) {
    camerasStatus = 'active';
    camerasSummary = 'Captured optical defect frame on workpiece bevel; sent to Gemma inference.';
  } else if (stage > 1) {
    camerasStatus = 'done';
    camerasSummary = 'Continuous 60 FPS optical scanning active; anomaly frames logged.';
  }

  let sensorsStatus: TopologyNodeState['status'] = 'idle';
  let sensorsSummary = 'Spindle tri-axial accelerometer & RTD streaming 100 Hz nominal.';
  if (stage >= 2) {
    sensorsStatus = 'active';
    sensorsSummary = 'Spindle vibration RMS elevated to 2.84 mm/s (baseline: 1.50 mm/s).';
  }

  let micsStatus: TopologyNodeState['status'] = 'idle';
  let micsSummary = 'Acoustic chamber microphone monitoring 20 kHz cutting frequency.';
  if (stage >= 2) {
    micsStatus = 'active';
    micsSummary = 'Resonance peak detected at 7.4 kHz; tool micro-chatter correlated.';
  }

  let tagsStatus: TopologyNodeState['status'] = 'idle';
  let tagsSummary = 'Workpiece 2D DataMatrix code synced with conveyor tracking.';
  if (stage >= 2) {
    tagsStatus = 'done';
    tagsSummary = 'Workpiece WP-2026-90412 indexed to billet heat 8842 and lot B42-0941.';
  }

  // Layer 2 Nodes State
  let edgeStatus: TopologyNodeState['status'] = 'idle';
  let edgeSummary = 'Standby · continuous optical inspection (95% normal frame reduction)';
  if (!isNominal) {
    if (stage === 1) {
      edgeStatus = 'active';
      edgeSummary = 'Detected defect signature on conveyor; actuated pneumatic rejector';
    } else {
      edgeStatus = 'done';
      edgeSummary = 'Trigger frame sent to cloud; conveyor operating in monitored loop';
    }
  }

  let bridgeStatus: TopologyNodeState['status'] = 'idle';
  let bridgeSummary = 'OPC-UA and MQTT broker healthy; zero buffer loss across 100 msg/s stream.';
  if (!isNominal) {
    bridgeStatus = 'active';
    bridgeSummary = 'Bridging high-frequency 100Hz vibration spike to Cloud Pub/Sub.';
  }

  // Layer 3 Nodes State
  let pubsubStatus: TopologyNodeState['status'] = 'idle';
  let pubsubSummary = 'Pub/Sub listener connected · Blackboard dispatcher ready';
  if (!isNominal) {
    if (stage === 1) {
      pubsubStatus = 'active';
      pubsubSummary = `Ingested anomaly packet for ${incident?.incident_id ?? 'incident'}; dispatching ADK graph`;
    } else {
      pubsubStatus = 'done';
      pubsubSummary = `Dispatched incident ${incident?.incident_id ?? ''} to multi-agent workflow`;
    }
  }

  let bigqueryStatus: TopologyNodeState['status'] = 'idle';
  let bigquerySummary = 'Partitioned dataset ready for discrete lot genealogy queries.';
  if (stage >= 2) {
    bigqueryStatus = 'done';
    bigquerySummary = 'Scanned 124,000 rows in 780ms; isolated suspect lot LOT-B42-0941.';
  }

  let firestoreStatus: TopologyNodeState['status'] = 'idle';
  let firestoreSummary = 'Incident blackboard state synchronized with SSE push stream.';
  if (!isNominal) {
    firestoreStatus = 'active';
    firestoreSummary = `Reactive state active: ${incident?.incident_id ?? ''} (${incident?.status ?? 'normal'}).`;
  }

  let ragStatus: TopologyNodeState['status'] = 'idle';
  let ragSummary = 'Indexed 4,200 SOPs and OEM machine manuals ready for semantic retrieval.';
  if (stage >= 2) {
    ragStatus = 'done';
    ragSummary = 'Retrieved top citation SOP-CNC-TOOL-CALIB-v4 with 0.94 similarity score.';
  }

  let geminiStatus: TopologyNodeState['status'] = 'idle';
  let geminiSummary = 'Gemini 2.5 foundation models standby for vision reasoning & Live audio.';
  if (!isNominal) {
    geminiStatus = 'active';
    geminiSummary = 'Processing multimodal inspection and bidirectional Live audio stream.';
  }

  // Layer 4 Nodes State
  let orchStatus: TopologyNodeState['status'] = 'idle';
  let orchSummary = 'ADK orchestrator workflow ready for incident lifecycle dispatch.';
  if (!isNominal) {
    orchStatus = isClosed ? 'done' : 'active';
    orchSummary = isClosed
      ? 'Incident lifecycle complete; blackboard locked and archived.'
      : `Orchestrating agent swarm across phase ${incident?.status ?? 'active'}.`;
  }

  let qaStatus: TopologyNodeState['status'] = 'idle';
  let qaSummary = 'SPC defect rate nominal (< 0.5% baseline)';
  if (!isNominal) {
    if (stage === 1) {
      qaStatus = 'active';
      qaSummary = `Defect rate ${((incident?.defect_rate ?? 0) * 100).toFixed(1)}% exceeded UCL ${((incident?.spc_ucl ?? 0.03) * 100).toFixed(1)}%`;
    } else {
      qaStatus = 'done';
      qaSummary = qiFinding?.finding ?? `Confirmed defect ${incident?.defect_type ?? 'anomaly'} breach`;
    }
  }

  let traStatus: TopologyNodeState['status'] = 'idle';
  let traSummary = 'Lot genealogy graph ready for workpiece traversal';
  if (stage >= 2) {
    if (stage === 2 && !incident?.suspect_machine && !traFinding) {
      traStatus = 'active';
      traSummary = 'Querying BigQuery lot genealogy to isolate suspect machine & tool';
    } else {
      traStatus = 'done';
      traSummary = incident?.suspect_machine
        ? `Isolated suspect machine ${incident.suspect_machine} (Tool ${incident.suspect_tool ?? 'T07'})`
        : traFinding?.finding ?? 'Asset genealogy traced';
    }
  }

  let paStatus: TopologyNodeState['status'] = 'idle';
  let paSummary = 'Telemetry baseline monitor ready';
  if (stage >= 2) {
    if (stage === 2 && !paFinding) {
      paStatus = 'active';
      paSummary = 'Analyzing spindle vibration, current load and temperature telemetry';
    } else {
      paStatus = 'done';
      paSummary = paFinding?.finding ?? 'Correlated sensor drift with defect onset timestamp';
    }
  }

  let rcaStatus: TopologyNodeState['status'] = 'idle';
  let rcaSummary = '5-Whys causal tree & OEM RAG search ready';
  if (stage >= 2) {
    if (isAwaitingEvidence) {
      rcaStatus = 'waiting';
      rcaSummary = incident?.diagnostic_request
        ? `Waiting for technician field confirmation: "${incident.diagnostic_request}"`
        : 'Formulated hypothesis; awaiting technician field evidence capture';
    } else if (stage === 2 && !incident?.root_cause) {
      rcaStatus = 'active';
      rcaSummary = 'Synthesizing 5-Whys causal chain with Vertex AI Search citations';
    } else {
      rcaStatus = 'done';
      rcaSummary = incident?.root_cause ?? rcaFinding?.finding ?? 'Root cause identified with OEM manual citation';
    }
  }

  // Decision Gate 1 (Confidence Gate)
  let gate1Status: TopologyNodeState['status'] = 'idle';
  let gate1Summary = 'Evaluates causal confidence threshold (0.70) before repair dispatch.';
  if (stage >= 2) {
    if (isAwaitingEvidence) {
      gate1Status = 'waiting';
      gate1Summary = 'Confidence < 0.70: Branching to technician field evidence capture loop.';
    } else {
      gate1Status = 'done';
      gate1Summary = 'Confidence >= 0.70 certified: Proceeding to Copilot Live guidance.';
    }
  }

  let diagStatus: TopologyNodeState['status'] = 'idle';
  let diagSummary = 'Under-confident loop standby (< 0.70 trigger).';
  if (isAwaitingEvidence) {
    diagStatus = 'active';
    diagSummary = 'Dispatched photo request to Bay 4 technician for tool wear macro inspection.';
  } else if (stage > 2) {
    diagStatus = 'done';
    diagSummary = 'Evidence received and verified; confidence threshold met.';
  }

  let photoStatus: TopologyNodeState['status'] = 'idle';
  let photoSummary = 'Mobile camera inspection feed standby.';
  if (isAwaitingEvidence) {
    photoStatus = 'waiting';
    photoSummary = 'Awaiting technician macro photo of cutting tool insert.';
  } else if (stage > 2) {
    photoStatus = 'done';
    photoSummary = 'Macro photo analyzed by Gemini Vision: +0.31 confidence boost.';
  }

  let copilotStatus: TopologyNodeState['status'] = 'idle';
  let copilotSummary = 'Gemini Live bay-side assistant ready on WebSocket';
  if (isAwaitingEvidence) {
    copilotStatus = 'active';
    copilotSummary = 'Prompting technician for tool wear visual evidence & photo capture';
  } else if (stage >= 3) {
    if (isRepairing && !incident?.repair_done) {
      copilotStatus = 'active';
      copilotSummary = 'Guiding bay technician through replacement checklist via voice/camera';
    } else {
      copilotStatus = 'done';
      copilotSummary = incident?.repair_done
        ? 'Technician confirmed repair completion and calibration'
        : copilotFinding?.finding ?? 'Repair procedure executed';
    }
  }

  let scribeStatus: TopologyNodeState['status'] = 'idle';
  let scribeSummary = 'Dossier generator ready';
  const docCount = Object.keys(incident?.documents ?? {}).length;
  if (stage >= 3) {
    if (isRepairing && docCount === 0) {
      scribeStatus = 'active';
      scribeSummary = 'Drafting formal 8D report, work order, and corrective SOP changes';
    } else {
      scribeStatus = 'done';
      scribeSummary = docCount > 0 ? `Logged ${docCount} incident document(s) & 8D report` : scribeFinding?.finding ?? '8D dossier compiled';
    }
  }

  let learnStatus: TopologyNodeState['status'] = 'idle';
  let learnSummary = 'RAG institutional memory & ESG ledger ready';
  if (stage === 4) {
    learnStatus = 'done';
    const scrap = incident?.impact?.scrap_avoided;
    const co2 = incident?.impact?.co2_kg;
    learnSummary = scrap
      ? `Indexed fix to Vertex RAG; avoided ${scrap} scrap parts (${co2?.toFixed(1) ?? '—'} kg CO2e)`
      : learnFinding?.finding ?? 'Fix indexed into institutional memory';
  }

  // Layer 5 Nodes State
  let humanTechStatus: TopologyNodeState['status'] = 'idle';
  let humanTechSummary = 'Field technician Alex Morgan standby for bay assignment.';
  if (stage === 3) {
    humanTechStatus = 'active';
    humanTechSummary = incident?.repair_done
      ? 'Technician replaced tool insert and verified torque to 4.5 Nm.'
      : 'Technician executing hands-on wrenching at CNC-02 Bay 4.';
  } else if (stage > 3) {
    humanTechStatus = 'done';
    humanTechSummary = 'Repair complete: T07 insert replaced; torque click confirmed.';
  }

  let verifyCameraStatus: TopologyNodeState['status'] = 'idle';
  let verifyCameraSummary = 'Conveyor optical camera ready for post-repair continuous scanning.';
  if (isVerifying) {
    verifyCameraStatus = 'active';
    verifyCameraSummary = `Scanning workpieces exiting CNC-02: ${incident?.verification_count ?? 0} clean passed.`;
  } else if (stage === 4) {
    verifyCameraStatus = 'done';
    verifyCameraSummary = 'Conveyor verification complete: 50 consecutive clean workpieces certified.';
  }

  let gatekeeperStatus: TopologyNodeState['status'] = 'idle';
  let gatekeeperSummary = 'Streak verification ready (Invariant #3 target: 50 clean parts)';
  if (stage >= 3) {
    if (isVerifying) {
      gatekeeperStatus = 'active';
      const count = incident?.verification_count ?? 0;
      const target = incident?.verification_target ?? 50;
      gatekeeperSummary = `Verifying clean parts on conveyor: ${count} / ${target} consecutive passed`;
    } else if (stage === 4) {
      gatekeeperStatus = 'done';
      gatekeeperSummary = `Invariant #3 verified: ${incident?.verification_count ?? 50} / ${incident?.verification_target ?? 50} clean parts certified`;
    }
  }

  let streakResetStatus: TopologyNodeState['status'] = 'idle';
  let streakResetSummary = 'Invariant #3 penalty monitor standby (Zero defect tolerance during streak).';
  if (incident?.status === 'escalated') {
    streakResetStatus = 'error';
    streakResetSummary = 'Defect detected during verification! Streak reset to 0/50; bay siren active.';
  }

  let humanDashStatus: TopologyNodeState['status'] = 'idle';
  let humanDashSummary = 'Line overview dashboard nominal; real-time OEE and health tracked.';
  if (!isNominal) {
    humanDashStatus = 'active';
    humanDashSummary = `Incident #${incident?.incident_id ?? ''} active on command board; triage live.`;
  }

  let approvalStatus: TopologyNodeState['status'] = 'idle';
  let approvalSummary = 'Shift-leader digital sign-off pending incident closure';
  if (isClosed) {
    if (incident?.approved) {
      approvalStatus = 'done';
      approvalSummary = 'Approved by Shift Leader David Vance (SHA-256 digital signature)';
    } else {
      approvalStatus = 'pending_approval';
      approvalSummary = 'Conveyor verified — awaiting shift-leader sign-off';
    }
  }

  let outputDocsStatus: TopologyNodeState['status'] = 'idle';
  let outputDocsSummary = 'Compliance documentation engine ready (PDF/A + JSON).';
  if (stage === 4) {
    outputDocsStatus = 'done';
    outputDocsSummary = 'Certified 8D dossier, work order, and updated SOP archived to Cloud Storage.';
  }

  // Error / Escalated overrides
  if (isEscalated) {
    rcaStatus = 'error';
    rcaSummary = incident?.status_reason ?? 'Escalated to senior manufacturing engineering';
  } else if (isError) {
    qaStatus = 'error';
    qaSummary = incident?.status_reason ?? 'Anomaly processing error encountered';
  }

  return {
    // Layer 1
    'floor-machines': {
      id: 'floor-machines',
      status: machinesStatus,
      summary: machinesSummary,
      isInferred: true,
      details: {
        machine_fleet: 'CNC-01, CNC-02, CNC-03',
        monitored_station: incident?.suspect_machine ?? 'CNC-02',
        spindle_rpm: 3200,
        feed_rate: '0.28 mm/rev',
      },
    },
    'floor-cameras': {
      id: 'floor-cameras',
      status: camerasStatus,
      summary: camerasSummary,
      isInferred: true,
      details: {
        camera_id: 'CAM-EOL-01',
        fps: 60,
        resolution: '1080p',
        inspection_mode: 'Continuous surface tracking',
      },
    },
    'floor-sensors': {
      id: 'floor-sensors',
      status: sensorsStatus,
      summary: sensorsSummary,
      isInferred: true,
      details: {
        sampling_rate: '100 Hz continuous',
        vibration_rms: '2.84 mm/s',
        baseline: '1.50 mm/s',
      },
    },
    'floor-mics': {
      id: 'floor-mics',
      status: micsStatus,
      summary: micsSummary,
      isInferred: true,
      details: {
        band: '20 kHz acoustic emissions',
        peak_resonance: '7.4 kHz tool chatter',
      },
    },
    'floor-tags': {
      id: 'floor-tags',
      status: tagsStatus,
      summary: tagsSummary,
      isInferred: true,
      details: {
        tag_type: '2D DataMatrix / QR',
        lot_id: 'LOT-B42-0941',
        billet_heat: 'HEAT-8842',
      },
    },

    // Layer 2
    'edge-gemma': {
      id: 'edge-gemma',
      status: edgeStatus,
      summary: edgeSummary,
      isInferred: true,
      details: {
        runtime: 'On-Premise IPC / Advantech MIC-770',
        model: 'Gemma 3 2B (int4 quantized)',
        inference_latency: '< 45ms',
        filter_rate: '> 95% nominal frames discarded',
        protocol: 'MQTT (EMQX broker)',
        diverter_actuation: 'Pneumatic 24V solenoid',
        active_incident: incident?.incident_id ?? null,
      },
    },
    'edge-bridge': {
      id: 'edge-bridge',
      status: bridgeStatus,
      summary: bridgeSummary,
      isInferred: true,
      details: {
        protocol_in: 'OPC-UA binary',
        protocol_out: 'MQTT / PubSub',
        throughput: '100 msg/sec',
        buffer_dropped: 0,
      },
    },

    // Layer 3
    'cloud-ingest': {
      id: 'cloud-ingest',
      status: pubsubStatus,
      summary: pubsubSummary,
      isInferred: true,
      details: {
        service: 'Google Cloud Pub/Sub + Cloud Run',
        topic: 'projects/kaizen/topics/telemetry-events',
        blackboard_backend: 'Asyncio + Firestore Live Stream',
        active_incident: incident?.incident_id ?? null,
        incident_phase: incident?.status ?? 'normal',
      },
    },
    'gcp-pubsub': {
      id: 'gcp-pubsub',
      status: pubsubStatus,
      summary: pubsubSummary,
      isInferred: true,
      details: {
        topic: 'factory-events',
        subscription: 'adk-sub',
        throughput: '140 msg/s',
        latency_ms: 12,
      },
    },
    'gcp-bigquery': {
      id: 'gcp-bigquery',
      status: bigqueryStatus,
      summary: bigquerySummary,
      isInferred: true,
      details: {
        dataset: 'kaizen_mfg',
        table: 'sensor_telemetry_100hz',
        query_engine: 'BigQuery / Emulator',
      },
    },
    'gcp-firestore': {
      id: 'gcp-firestore',
      status: firestoreStatus,
      summary: firestoreSummary,
      isInferred: true,
      details: {
        document_path: `incidents/${incident?.incident_id ?? 'INC-ACTIVE'}`,
        state: incident?.status ?? 'normal',
        sole_writer: 'ADK Orchestrator',
      },
    },
    'gcp-rag': {
      id: 'gcp-rag',
      status: ragStatus,
      summary: ragSummary,
      isInferred: true,
      details: {
        index_size: '4,200 OEM SOPs',
        query_latency: '420 ms',
      },
    },
    'gcp-gemini': {
      id: 'gcp-gemini',
      status: geminiStatus,
      summary: geminiSummary,
      isInferred: true,
      details: {
        models: 'Gemini 2.5 Flash / Pro & Live API',
        latency: '180 ms Live WebSocket',
      },
    },

    // Layer 4
    'adk-orch': {
      id: 'adk-orch',
      status: orchStatus,
      summary: orchSummary,
      isInferred: false,
      details: {
        framework: 'Google ADK 2.x Python',
        entry_exit: 'Single Entry/Exit Architecture',
        blackboard_permissions: 'Sole Writer to Firestore',
      },
    },
    'agent-qa': {
      id: 'agent-qa',
      status: qaStatus,
      summary: qaSummary,
      isInferred: false,
      details: {
        agent_id: 'quality_inspector',
        defect_type: incident?.defect_type ?? 'None',
        defect_rate_pct: incident ? Number((incident.defect_rate * 100).toFixed(2)) : 0.45,
        spc_ucl_pct: incident ? Number((incident.spc_ucl * 100).toFixed(2)) : 3.0,
        alarm_rule: 'Nelson Rule 1 (Single point beyond 3-sigma UCL)',
        confidence: qiFinding?.confidence ?? (isNominal ? null : 0.98),
        finding: qiFinding?.finding ?? null,
      },
    },
    'agent-tra': {
      id: 'agent-tra',
      status: traStatus,
      summary: traSummary,
      isInferred: false,
      details: {
        agent_id: 'traceability',
        suspect_machine: incident?.suspect_machine ?? null,
        suspect_tool: incident?.suspect_tool ?? null,
        query_engine: 'BigQuery Lot Genealogy Emulator',
        barcode_scanned: incident?.findings?.[0]?.evidence?.slice(0, 32) ?? null,
        finding: traFinding?.finding ?? null,
      },
    },
    'agent-pa': {
      id: 'agent-pa',
      status: paStatus,
      summary: paSummary,
      isInferred: false,
      details: {
        agent_id: 'process_analyst',
        spindle_vibration_anomaly: incident?.suspect_machine ? '+35% above RMS baseline' : 'Nominal',
        current_load_anomaly: incident?.suspect_machine ? '+12% cutting torque spike' : 'Nominal',
        monitored_machine: incident?.suspect_machine ?? 'All Fleet (CNC-01, CNC-02, CNC-03)',
        finding: paFinding?.finding ?? null,
      },
    },
    'agent-rca': {
      id: 'agent-rca',
      status: rcaStatus,
      summary: rcaSummary,
      isInferred: false,
      details: {
        agent_id: 'root_cause',
        root_cause: incident?.root_cause ?? null,
        confidence: rcaFinding?.confidence ?? null,
        citation: rcaFinding?.citation ?? 'OEM Maintenance Manual §4.2',
        diagnostic_request: incident?.diagnostic_request ?? null,
        five_whys_levels: rcaFinding?.five_whys?.length ?? 5,
        ishikawa_categories: rcaFinding?.ishikawa ? Object.keys(rcaFinding.ishikawa).length : 6,
      },
    },
    'decision-gate-1': {
      id: 'decision-gate-1',
      status: gate1Status,
      summary: gate1Summary,
      isInferred: false,
      details: {
        gate_condition: 'Confidence >= 0.70',
        current_confidence: rcaFinding?.confidence ?? (isAwaitingEvidence ? 0.58 : 0.89),
        action_if_true: 'Dispatch Copilot Live & Incident Scribe',
        action_if_false: 'Dispatch Diagnostic Photo Loop to Mobile App',
      },
    },
    'diagnostic-agent': {
      id: 'diagnostic-agent',
      status: diagStatus,
      summary: diagSummary,
      isInferred: false,
      details: {
        dispatch_condition: 'Triggered when confidence < 0.70',
        target_operator: 'Bay 4 Field Technician',
      },
    },
    'technician-photo': {
      id: 'technician-photo',
      status: photoStatus,
      summary: photoSummary,
      isInferred: false,
      details: {
        tool_target: 'CNC-02 Spindle Tool T07 Flank Surface',
        vision_model: 'Gemini 2.5 Flash Vision',
      },
    },
    'copilot-live': {
      id: 'copilot-live',
      status: copilotStatus,
      summary: copilotSummary,
      isInferred: false,
      details: {
        agent_id: 'technician_copilot',
        session_mode: 'Bidirectional WebSocket (Audio/Video)',
        repair_done: incident?.repair_done ?? false,
        assigned_technician: 'Technician Bay 4 (Alex Morgan)',
        checkpoint_verified: incident?.repair_done ? 'Insert Flank Torque & Runout' : 'In Progress',
        finding: copilotFinding?.finding ?? null,
      },
    },
    'agent-scribe': {
      id: 'agent-scribe',
      status: scribeStatus,
      summary: scribeSummary,
      isInferred: false,
      details: {
        agent_id: 'incident_scribe',
        documents_generated: Object.keys(incident?.documents ?? {}).length,
        report_format: 'Ford 8D Standard + Kaizen Countermeasure',
        sop_change_draft: 'SOP-CNC-02 Rev 4.1',
        finding: scribeFinding?.finding ?? null,
      },
    },
    'agent-learn': {
      id: 'agent-learn',
      status: learnStatus,
      summary: learnSummary,
      isInferred: false,
      details: {
        agent_id: 'continuous_learning',
        scrap_avoided_units: incident?.impact?.scrap_avoided ?? null,
        downtime_saved_min: incident?.impact?.downtime_minutes ?? null,
        co2_avoided_kg: incident?.impact?.co2_kg ?? null,
        cost_savings_usd: incident?.impact?.cost_savings_usd ?? null,
        rag_vector_upserted: isClosed,
        finding: learnFinding?.finding ?? null,
      },
    },

    // Layer 5
    'human-tech': {
      id: 'human-tech',
      status: humanTechStatus,
      summary: humanTechSummary,
      isInferred: false,
      details: {
        assigned_technician: 'Alex Morgan',
        bay: 'Bay 4 CNC-02',
        cta_height: '48px touch target',
        torque_calibrated: '4.5 Nm Torx T15',
      },
    },
    'verify-camera': {
      id: 'verify-camera',
      status: verifyCameraStatus,
      summary: verifyCameraSummary,
      isInferred: true,
      details: {
        frame_rate: '60 FPS',
        optical_target: 'Surface defect clearance verification',
      },
    },
    'decision-gate-2': {
      id: 'decision-gate-2',
      status: gatekeeperStatus,
      summary: gatekeeperSummary,
      isInferred: false,
      details: {
        invariant: 'Key Invariant #3: Product-evidence streak verification',
        verification_count: incident?.verification_count ?? 0,
        verification_target: incident?.verification_target ?? 50,
        target_met: (incident?.verification_count ?? 0) >= (incident?.verification_target ?? 50),
        recurrence_detected: incident?.status === 'escalated',
      },
    },
    'gatekeeper-qa': {
      id: 'gatekeeper-qa',
      status: gatekeeperStatus,
      summary: gatekeeperSummary,
      isInferred: false,
      details: {
        invariant: 'Key Invariant #3: Product-evidence streak verification',
        verification_count: incident?.verification_count ?? 0,
        verification_target: incident?.verification_target ?? 50,
        target_met: (incident?.verification_count ?? 0) >= (incident?.verification_target ?? 50),
        recurrence_detected: false,
      },
    },
    'streak-reset': {
      id: 'streak-reset',
      status: streakResetStatus,
      summary: streakResetSummary,
      isInferred: false,
      details: {
        penalty: 'Counter immediately reset to 0/50',
        alarm_channel: 'Bay Andon Siren & Flashing Red Light',
      },
    },
    'human-dash': {
      id: 'human-dash',
      status: humanDashStatus,
      summary: humanDashSummary,
      isInferred: false,
      details: {
        dashboard_view: 'Plant Operations Line Overview',
        refresh_mode: 'Real-time SSE push',
      },
    },
    'human-lead': {
      id: 'human-lead',
      status: approvalStatus,
      summary: approvalSummary,
      isInferred: false,
      details: {
        role: 'Shift Leader',
        authority: 'David Vance',
        e_sign_token: incident?.approved ? 'SHA256-88F4-4291-KAIZEN' : null,
        closure_unlocked: (incident?.verification_count ?? 0) >= (incident?.verification_target ?? 50),
      },
    },
    'human-approval': {
      id: 'human-approval',
      status: approvalStatus,
      summary: approvalSummary,
      isInferred: false,
      details: {
        role: 'Shift Leader',
        approved: incident?.approved ?? false,
        approved_by: incident?.approved ? 'Shift Leader' : null,
        approved_at: incident?.closed_at ?? null,
        closure_unlocked: (incident?.verification_count ?? 0) >= (incident?.verification_target ?? 50),
      },
    },
    'output-docs': {
      id: 'output-docs',
      status: outputDocsStatus,
      summary: outputDocsSummary,
      isInferred: false,
      details: {
        documents: ['8D Incident Dossier (PDF/A)', 'Maintenance Work Order', 'Revised SOP Card'],
        compliance: 'ISO 9001 / IATF 16949',
      },
    },
  };
}

/**
 * Derives overall state per phase swimlane (A, B, C, D) from the active incident and node states.
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
    const st = nodeStates[node.id];
    if (!st) continue;
    const phase = result[node.phase];
    if (phase) {
      if (st.status === 'active' || st.status === 'waiting' || st.status === 'pending_approval') {
        phase.activeNodeCount++;
      } else if (st.status === 'done') {
        phase.completedNodeCount++;
      } else if (st.status === 'error') {
        phase.status = 'error';
      }
    }

    const layer = result[node.layer];
    if (layer) {
      if (st.status === 'active' || st.status === 'waiting' || st.status === 'pending_approval') {
        layer.activeNodeCount++;
      } else if (st.status === 'done') {
        layer.completedNodeCount++;
      } else if (st.status === 'error') {
        layer.status = 'error';
      }
    }
  }

  for (const phaseId of Object.keys(result) as TopologyPhaseId[]) {
    const phase = result[phaseId];
    if (phase.status === 'error') continue;
    if (phase.completedNodeCount === phase.totalNodeCount) {
      phase.status = 'completed';
    } else if (phase.activeNodeCount > 0 || phase.completedNodeCount > 0) {
      phase.status = 'active';
    } else {
      phase.status = 'idle';
    }
  }

  return result;
}

/**
 * Derives overall state per layer (Layer 1 to Layer 5)
 */
export function deriveLayerStates(
  nodeStates: Record<TopologyNodeId, TopologyNodeState>,
): Record<TopologyLayerId, { id: TopologyLayerId; status: 'idle' | 'active' | 'completed' | 'error'; activeCount: number; doneCount: number; totalCount: number }> {
  const result: Record<TopologyLayerId, { id: TopologyLayerId; status: 'idle' | 'active' | 'completed' | 'error'; activeCount: number; doneCount: number; totalCount: number }> = {
    'layer-1': { id: 'layer-1', status: 'idle', activeCount: 0, doneCount: 0, totalCount: 5 },
    'layer-2': { id: 'layer-2', status: 'idle', activeCount: 0, doneCount: 0, totalCount: 2 },
    'layer-3': { id: 'layer-3', status: 'idle', activeCount: 0, doneCount: 0, totalCount: 5 },
    'layer-4': { id: 'layer-4', status: 'idle', activeCount: 0, doneCount: 0, totalCount: 11 },
    'layer-5': { id: 'layer-5', status: 'idle', activeCount: 0, doneCount: 0, totalCount: 7 },
  };

  for (const node of TOPOLOGY_NODES) {
    if (node.id === 'cloud-ingest' || node.id === 'gatekeeper-qa' || node.id === 'human-approval') continue; // skip duplicates in layer counts
    const st = nodeStates[node.id];
    if (!st) continue;
    const l = result[node.layer];
    if (st.status === 'active' || st.status === 'waiting' || st.status === 'pending_approval') {
      l.activeCount++;
    } else if (st.status === 'done') {
      l.doneCount++;
    } else if (st.status === 'error') {
      l.status = 'error';
    }
  }

  for (const lId of Object.keys(result) as TopologyLayerId[]) {
    const l = result[lId];
    if (l.status === 'error') continue;
    if (l.doneCount === l.totalCount) {
      l.status = 'completed';
    } else if (l.activeCount > 0 || l.doneCount > 0) {
      l.status = 'active';
    } else {
      l.status = 'idle';
    }
  }

  return result;
}

// 5 Interactive demonstration scenarios
export interface TopologyScenario {
  id: string;
  name: string;
  description: string;
  badge: string;
  mockIncident: IncidentState | null;
}

export const TOPOLOGY_SCENARIOS: TopologyScenario[] = [
  {
    id: 'baseline_idle',
    name: 'Nominal Run (Baseline)',
    description: 'Steady-state production. All 5 layers standby, 96.2% normal frame filtering at edge, zero SPC alarms.',
    badge: 'Nominal',
    mockIncident: null,
  },
  {
    id: 'phase_a_breach',
    name: 'Anomaly Injected (SPC Breach)',
    description: 'Defect rate spikes to 4.42% (UCL 3.0%). Gemma actuates pneumatic diverter; Quality Inspector triggers incident.',
    badge: 'Phase A: Detect',
    mockIncident: {
      incident_id: 'INC-2026-B42',
      status: 'detecting',
      status_reason: 'Defect rate breached SPC UCL',
      defect_type: 'surface_tear_bevel',
      defect_rate: 0.0442,
      spc_ucl: 0.03,
      suspect_machine: null,
      suspect_tool: null,
      root_cause: null,
      diagnostic_request: null,
      repair_done: false,
      verification_count: 0,
      verification_target: 50,
      approved: false,
      findings: [
        {
          agent_id: 'quality_inspector',
          agent_name: 'Quality Inspector',
          phase: 'phase-a',
          finding: 'Defect rate 4.42% breached SPC Upper Control Limit (3.0%). Optical classifier flagged surface tear.',
          evidence: 'Optical frame CAM-EOL-01 #90412',
          confidence: 0.96,
          citation: 'SPC Rule 1: Point > 3-sigma UCL',
          timestamp: new Date().toISOString(),
        },
      ],
      impact: null,
      documents: {},
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
  {
    id: 'phase_b_rca',
    name: 'Awaiting Evidence (< 0.70)',
    description: 'RCA confidence is 0.58. Decision Gate 1 activates under-confident loop, requesting technician macro photo.',
    badge: 'Phase B: Evidence',
    mockIncident: {
      incident_id: 'INC-2026-B42',
      status: 'awaiting_evidence',
      status_reason: 'RCA causal confidence below 0.70 threshold',
      defect_type: 'surface_tear_bevel',
      defect_rate: 0.0442,
      spc_ucl: 0.03,
      suspect_machine: 'CNC-02',
      suspect_tool: 'T07-FACE-MILL',
      root_cause: null,
      diagnostic_request: 'Capture high-resolution macro photo of CNC-02 Spindle Tool T07 flank insert.',
      repair_done: false,
      verification_count: 0,
      verification_target: 50,
      approved: false,
      findings: [
        {
          agent_id: 'quality_inspector',
          agent_name: 'Quality Inspector',
          phase: 'phase-a',
          finding: 'Defect rate 4.42% breached SPC Upper Control Limit (3.0%).',
          evidence: 'Optical frame CAM-EOL-01 #90412',
          confidence: 0.96,
          citation: 'SPC Rule 1',
          timestamp: new Date().toISOString(),
        },
        {
          agent_id: 'traceability',
          agent_name: 'Traceability Agent',
          phase: 'phase-b',
          finding: 'Traced defective workpiece lot B42-0941 to CNC-02 Spindle 1.',
          evidence: 'BigQuery lot genealogy query',
          confidence: 0.94,
          citation: 'BigQuery DDL kaizen_mfg.lots',
          timestamp: new Date().toISOString(),
        },
        {
          agent_id: 'process_analyst',
          agent_name: 'Process Analyst',
          phase: 'phase-b',
          finding: 'Spindle vibration RMS elevated to 2.84 mm/s (+35% above baseline).',
          evidence: 'Spindle accelerometer 100Hz FFT',
          confidence: 0.91,
          citation: 'Vibration ISO 10816-3',
          timestamp: new Date().toISOString(),
        },
        {
          agent_id: 'root_cause',
          agent_name: 'Root Cause Agent',
          phase: 'phase-b',
          finding: 'Suspected T07 flank wear, but confidence is 0.58 (< 0.70 threshold). Evidence capture requested.',
          evidence: '5-Whys causal draft',
          confidence: 0.58,
          citation: 'SOP-CNC-TOOL-CALIB-v4',
          timestamp: new Date().toISOString(),
        },
      ],
      impact: null,
      documents: {},
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
  {
    id: 'phase_c_repair',
    name: 'Repair & Verification (Streak Active)',
    description: 'Technician confirmed T07 insert replacement. Conveyor optical camera scanning clean streak (42/50).',
    badge: 'Phase C: Verifying',
    mockIncident: {
      incident_id: 'INC-2026-B42',
      status: 'verifying',
      status_reason: 'Continuous streak verification active on conveyor',
      defect_type: 'surface_tear_bevel',
      defect_rate: 0.002,
      spc_ucl: 0.03,
      suspect_machine: 'CNC-02',
      suspect_tool: 'T07-FACE-MILL',
      root_cause: 'T07 Flank Wear & Insert Micro-fracture (recalibrated torque to 4.5 Nm).',
      diagnostic_request: null,
      repair_done: true,
      verification_count: 42,
      verification_target: 50,
      approved: false,
      documents: {
        '8d_report': 'Drafted',
        'work_order': 'Completed',
      },
      findings: [
        {
          agent_id: 'technician_copilot',
          agent_name: 'Technician Copilot',
          phase: 'phase-c',
          finding: 'Guided technician Alex Morgan through T07 tool insert swap; verified 4.5 Nm Torx click.',
          evidence: 'Gemini Live WebSocket session LIVE-VOICE-8842',
          confidence: 0.99,
          citation: 'Torque SOP §3.1',
          timestamp: new Date().toISOString(),
        },
        {
          agent_id: 'incident_scribe',
          agent_name: 'Incident Scribe',
          phase: 'phase-c',
          finding: 'Drafted Ford 8D standard report and logged maintenance work order WO-8842.',
          evidence: 'Blackboard documents draft',
          confidence: 0.95,
          citation: 'Ford 8D Standard',
          timestamp: new Date().toISOString(),
        },
      ],
      impact: null,
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
  {
    id: 'phase_d_closed',
    name: 'Incident Closed & Approved',
    description: 'Streak 50/50 clean certified. Shift Leader signed e-signature. RAG indexed fix; ESG scrap saved logged.',
    badge: 'Phase D: Closed',
    mockIncident: {
      incident_id: 'INC-2026-B42',
      status: 'closed',
      status_reason: '50/50 streak verified and shift leader sign-off certified',
      defect_type: 'surface_tear_bevel',
      defect_rate: 0.001,
      spc_ucl: 0.03,
      suspect_machine: 'CNC-02',
      suspect_tool: 'T07-FACE-MILL',
      root_cause: 'T07 Flank Wear & Insert Micro-fracture.',
      diagnostic_request: null,
      repair_done: true,
      verification_count: 50,
      verification_target: 50,
      approved: true,
      impact: {
        scrap_avoided: 120,
        downtime_minutes: 45,
        energy_kwh: 312.4,
        co2_kg: 84.2,
        cost_savings_usd: 1420.0,
      },
      documents: {
        '8d_report': 'Approved & Certified',
        'work_order': 'Signed',
        'sop_v5': 'Indexed',
      },
      findings: [
        {
          agent_id: 'continuous_learning',
          agent_name: 'Continuous Learning',
          phase: 'phase-d',
          finding: 'Indexed procedure into Vertex AI Search RAG. Avoided 48.5 kg scrap and 84.2 kg CO2e emissions.',
          evidence: 'Vertex AI Search vector store commit VEC-SOP-CNC-T07-v5',
          confidence: 0.99,
          citation: 'GHG Protocol Scope 2',
          timestamp: new Date().toISOString(),
        },
      ],
      opened_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
];
