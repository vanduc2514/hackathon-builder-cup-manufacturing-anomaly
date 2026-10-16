// Shared Topology models, catalogs and pure state derivation helpers (Issue #205).
import type {
  IncidentState,
  IncidentStatus,
  TopologyEdgeDefinition,
  TopologyNodeDefinition,
  TopologyNodeId,
  TopologyNodeState,
  TopologyPhaseDefinition,
  TopologyPhaseId,
  TopologyPhaseState,
} from '../types';
import { matchesAgentRole } from './incident';

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

export const TOPOLOGY_NODES: TopologyNodeDefinition[] = [
  {
    id: 'edge-gemma',
    phase: 'phase-a',
    order: 1,
    label: 'Edge Gateway',
    sublabel: 'Gemma 3 2B On-Prem',
    tier: 'Tier 1 & 2',
    tierDescription: 'Sub-50ms inference, pneumatic diverter actuation, >95% frame reduction',
    icon: 'memory',
    techStack: ['Gemma 3 2B', 'Raspberry Pi / IPC', 'MQTT', 'Local Buffer'],
    jtbd: 'Filter >95% normal camera frames locally on-premise; actuate physical scrap diverter within 50ms upon defect detection.',
  },
  {
    id: 'cloud-ingest',
    phase: 'phase-a',
    order: 2,
    label: 'Pub/Sub & Orchestrator',
    sublabel: 'Data Plane Ingestion',
    tier: 'Tier 3 & 4',
    tierDescription: 'Cloud message streaming and incident workflow dispatch',
    icon: 'cloud_sync',
    techStack: ['Cloud Pub/Sub', 'ADK Orchestrator', 'Firestore Blackboard'],
    jtbd: 'Ingest anomaly events from edge gateway and dispatch multi-agent workflow via reactive shared blackboard.',
  },
  {
    id: 'agent-qa',
    phase: 'phase-a',
    order: 3,
    label: 'Quality Inspector',
    sublabel: 'ADK Agent · Vision & SPC',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with SPC Upper Control Limit (3.0%) Gate',
    icon: 'photo_camera',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash', 'SPC Calculator', 'Nelson Rules'],
    jtbd: 'Analyze defect rate against Upper Control Limit (UCL 3.0%) and evaluate Nelson rules to trigger incident.',
  },
  {
    id: 'agent-tra',
    phase: 'phase-b',
    order: 4,
    label: 'Traceability Agent',
    sublabel: 'ADK Agent · Lot Genealogy',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with BigQuery Tool',
    icon: 'account_tree',
    techStack: ['ADK Agent', 'BigQuery', 'Graph Traversal', 'SQL Tool'],
    jtbd: 'Traverse workpiece genealogy from barcode to identify suspect machine, cutting tool, and raw billet lot.',
  },
  {
    id: 'agent-pa',
    phase: 'phase-b',
    order: 5,
    label: 'Process Analyst',
    sublabel: 'ADK Agent · Telemetry Correlation',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Telemetry History Tool',
    icon: 'ssid_chart',
    techStack: ['ADK Agent', 'BigQuery Emulator', 'Vibration Analysis', 'Statistical Drift'],
    jtbd: 'Correlate high-frequency machine sensor telemetry (spindle vibration, current load, bearing temp) with defect onset.',
  },
  {
    id: 'agent-rca',
    phase: 'phase-b',
    order: 6,
    label: 'Root Cause Agent',
    sublabel: 'ADK Agent · 5-Whys & Search',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Vertex AI Search Tool',
    icon: 'psychology',
    techStack: ['ADK Agent', 'Gemini 2.5 Pro', 'Vertex AI Search', 'Ishikawa / 5-Whys'],
    jtbd: 'Formulate grounded 5-Whys causal tree and Ishikawa diagram citing OEM maintenance manuals and 8D archive.',
  },
  {
    id: 'copilot-live',
    phase: 'phase-c',
    order: 7,
    label: 'Technician Copilot',
    sublabel: 'Gemini Live Multimodal',
    tier: 'Tier 4 & 5',
    tierDescription: 'Gemini Live WebSocket + Bay-side technician interaction',
    icon: 'engineering',
    techStack: ['Gemini Live API', 'WebSocket', 'Voice/Camera', 'ADK Checkpoints'],
    jtbd: 'Provide interactive hands-free audio and visual repair guidance to bay technician; verify physical checkpoints.',
  },
  {
    id: 'agent-scribe',
    phase: 'phase-c',
    order: 8,
    label: 'Incident Scribe',
    sublabel: 'ADK Agent · 8D Documentation',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent for Automated Technical Reporting',
    icon: 'edit_document',
    techStack: ['ADK Agent', 'Gemini 2.5 Flash', 'Markdown / JSON', 'SOP Versioning'],
    jtbd: 'Draft formal 8D report, maintenance work order, and corrective SOP updates based on incident blackboard.',
  },
  {
    id: 'gatekeeper-qa',
    phase: 'phase-c',
    order: 9,
    label: 'Quality Gatekeeper',
    sublabel: 'Conveyor Streak Verification',
    tier: 'Tier 4',
    tierDescription: 'Key Invariant #3 verification engine',
    icon: 'verified',
    techStack: ['Conveyor Vision', 'Streak Gatekeeper', 'Invariant #3', 'Deterministic Counter'],
    jtbd: 'Enforce Invariant #3: certify 50 consecutive clean workpieces on the conveyor before unlocking closure approval.',
  },
  {
    id: 'agent-learn',
    phase: 'phase-d',
    order: 10,
    label: 'Continuous Learning',
    sublabel: 'ADK Agent · RAG & ESG',
    tier: 'Tier 4',
    tierDescription: 'ADK Agent with Impact Calculator & RAG Store',
    icon: 'school',
    techStack: ['ADK Agent', 'Vertex AI Vector Store', 'Impact Calculator', 'GHG Protocol'],
    jtbd: 'Calculate scrap avoided, energy saved, and CO2e reduction; commit verified fix to permanent organizational RAG index.',
  },
  {
    id: 'human-approval',
    phase: 'phase-d',
    order: 11,
    label: 'Shift Leader Approval',
    sublabel: 'Human-in-the-Loop Governance',
    tier: 'Tier 5',
    tierDescription: 'Final human governance gate with cryptographic sign-off',
    icon: 'gavel',
    techStack: ['Human Operator', 'Digital Signature', 'Audit Trail', 'Blackboard Gate'],
    jtbd: 'Review validated 8D dossier, verify post-repair conveyor certification, and apply formal shift-leader sign-off.',
  },
];

export const TOPOLOGY_EDGES: TopologyEdgeDefinition[] = [
  { from: 'edge-gemma', to: 'cloud-ingest', label: 'MQTT Telemetry' },
  { from: 'cloud-ingest', to: 'agent-qa', label: 'Event Stream' },
  { from: 'agent-qa', to: 'agent-tra', label: 'SPC Trigger' },
  { from: 'agent-qa', to: 'agent-pa', label: 'Timestamp Window' },
  { from: 'agent-tra', to: 'agent-rca', label: 'Suspect Asset' },
  { from: 'agent-pa', to: 'agent-rca', label: 'Sensor Drift' },
  { from: 'agent-rca', to: 'copilot-live', label: 'Diagnostic Request' },
  { from: 'copilot-live', to: 'agent-scribe', label: 'Repair Log' },
  { from: 'copilot-live', to: 'gatekeeper-qa', label: 'Repair Complete' },
  { from: 'agent-scribe', to: 'gatekeeper-qa', label: '8D Draft' },
  { from: 'gatekeeper-qa', to: 'agent-learn', label: '50 Clean Parts Verified' },
  { from: 'agent-learn', to: 'human-approval', label: 'Dossier Ready' },
];

/**
 * Pure function deriving runtime status, summaries, and extracted details for each of the 11 topology nodes
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

  // Helper to determine base stage progression
  // Stage 0: nominal
  // Stage 1: Phase A active (detecting)
  // Stage 2: Phase B active (tracing/investigating/analyzing/awaiting_evidence)
  // Stage 3: Phase C active (repairing/verifying)
  // Stage 4: Phase D active (closed)
  let stage = 0;
  if (isDetecting) stage = 1;
  else if (isTracing || isAwaitingEvidence) stage = 2;
  else if (isRepairing || isVerifying) stage = 3;
  else if (isClosed || isDismissed) stage = 4;
  else if (isEscalated || isError) stage = 2; // Keep at triage

  // 1. Edge Gemma
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

  // 2. Cloud Ingest & Orchestrator
  let ingestStatus: TopologyNodeState['status'] = 'idle';
  let ingestSummary = 'Pub/Sub listener connected · Blackboard dispatcher ready';
  if (!isNominal) {
    if (stage === 1) {
      ingestStatus = 'active';
      ingestSummary = `Ingested anomaly packet for ${incident?.incident_id ?? 'incident'}; dispatching ADK graph`;
    } else {
      ingestStatus = 'done';
      ingestSummary = `Dispatched incident ${incident?.incident_id ?? ''} to multi-agent workflow`;
    }
  }

  // 3. Quality Inspector
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

  // 4. Traceability Agent
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

  // 5. Process Analyst
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

  // 6. Root Cause Agent
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

  // 7. Technician Copilot
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

  // 8. Incident Scribe
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

  // 9. Quality Gatekeeper
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

  // 10. Continuous Learning
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

  // 11. Shift Leader Approval
  let approvalStatus: TopologyNodeState['status'] = 'idle';
  let approvalSummary = 'Shift-leader digital sign-off pending incident closure';
  if (isClosed) {
    if (incident?.approved) {
      approvalStatus = 'done';
      approvalSummary = 'Approved by Shift Leader';
    } else {
      approvalStatus = 'pending_approval';
      approvalSummary = 'Conveyor verified — awaiting shift-leader sign-off';
    }
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
    'edge-gemma': {
      id: 'edge-gemma',
      status: edgeStatus,
      summary: edgeSummary,
      isInferred: true,
      details: {
        runtime: 'On-Premise IPC / Raspberry Pi 5',
        model: 'Gemma 3 2B (int4 quantized)',
        inference_latency: '< 45ms',
        filter_rate: '> 95% nominal frames discarded',
        protocol: 'MQTT (EMQX broker)',
        diverter_actuation: 'Pneumatic 24V solenoid',
        active_incident: incident?.incident_id ?? null,
      },
    },
    'cloud-ingest': {
      id: 'cloud-ingest',
      status: ingestStatus,
      summary: ingestSummary,
      isInferred: true,
      details: {
        service: 'Google Cloud Pub/Sub + Cloud Run',
        topic: 'projects/kaizen/topics/telemetry-events',
        blackboard_backend: 'Asyncio + Firestore Live Stream',
        active_incident: incident?.incident_id ?? null,
        incident_phase: incident?.status ?? 'normal',
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
    'copilot-live': {
      id: 'copilot-live',
      status: copilotStatus,
      summary: copilotSummary,
      isInferred: false,
      details: {
        agent_id: 'technician_copilot',
        session_mode: 'Bidirectional WebSocket (Audio/Video)',
        repair_done: incident?.repair_done ?? false,
        assigned_technician: 'Technician Bay 2',
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
  };

  for (const node of TOPOLOGY_NODES) {
    const st = nodeStates[node.id];
    const phase = result[node.phase];
    if (st.status === 'active' || st.status === 'waiting' || st.status === 'pending_approval') {
      phase.activeNodeCount++;
    } else if (st.status === 'done') {
      phase.completedNodeCount++;
    } else if (st.status === 'error') {
      phase.status = 'error';
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
