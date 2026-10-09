// AndonPhaseTracker: 4-Phase industrial incident lifecycle tracker with pulsating Andon indicators.
import React, { useState, useEffect } from 'react';
import type { IncidentState, IncidentStatus, AndonPhaseKey, AndonPhaseStatus, AndonPhaseDetails } from '../types';

interface AndonPhaseTrackerProps {
  incident?: IncidentState | null;
  onPhaseSelect?: (phase: AndonPhaseKey) => void;
}

const PHASES_CONFIG: AndonPhaseDetails[] = [
  {
    key: 'A',
    letter: 'A',
    name: 'Detection',
    vietnameseName: 'Phát hiện',
    lampColor: 'red',
    lampHex: '#EF4444',
    description: 'Optical inspection frame classification & SPC upper control limit monitoring.',
    activities: [
      'Gemma 3 Edge Gateway (pre-filters 95% normal frames)',
      'Gemini Vision classification (scratch, burr, short fill)',
      'SPC Calculator & Gatekeeper (UCL 3.0% breach alarm)',
    ],
    inputs: [
      'Conveyor inspection camera frames (120 fps)',
      'Acoustic emission & machine vibration signals',
      'SPC baseline defect rate (0.50% normal)',
    ],
    outputs: [
      'Defect classification & severity',
      'Defect spike rate vs UCL threshold',
      'Formal incident opened (e.g. INC-0412)',
    ],
    statuses: ['detecting'],
  },
  {
    key: 'B',
    letter: 'B',
    name: 'Tracing & RCA',
    vietnameseName: 'Truy ngược & RCA',
    lampColor: 'yellow',
    lampHex: '#F59E0B',
    description: 'Backward genealogy tracing, multi-sensor correlation, and 5-Whys root cause analysis.',
    activities: [
      'Traceability Agent (BigQuery parts genealogy & batch matching)',
      'Process Analyst (CNC spindle vibration & current spike correlation)',
      'Vertex AI Search RAG (OEM maintenance manuals & historical 8D reports)',
      'Root Cause Agent (5-Whys deduction & Ishikawa fishbone correlation)',
    ],
    inputs: [
      'Defective part serial numbers / timestamps',
      'BigQuery batch & tooling genealogy logs',
      'CNC-02 multi-axis high frequency sensor telemetry',
      'OEM technical documentation & past 8D archive',
    ],
    outputs: [
      'Suspect machine & tool identification (e.g. CNC-02 / T07)',
      'Root cause hypothesis (e.g. Tool insert flank wear)',
      'Confidence score (>0.70) with grounded OEM citations',
    ],
    statuses: ['tracing', 'investigating', 'analyzing', 'awaiting_evidence'],
  },
  {
    key: 'C',
    letter: 'C',
    name: 'Resolution & Verification',
    vietnameseName: 'Xử lý & Xác nhận',
    lampColor: 'blue',
    lampHex: '#3B82F6',
    description: 'Multimodal technician repair guidance and physical 50-streak conveyor verification.',
    activities: [
      'Technician Copilot (Gemini Live bilingual Vietnamese voice & mobile camera guidance)',
      'Incident Scribe (Auto-drafts Work Order, 8D Report, and SOP revision)',
      'Quality Inspector Gatekeeper (Strict physical check: 50 consecutive defect-free parts)',
    ],
    inputs: [
      'Grounded root cause diagnosis & OEM repair procedure',
      'Frontline technician mobile camera & microphone stream',
      'Post-repair conveyor optical inspection frames',
    ],
    outputs: [
      'Physical tool replacement & torque calibration confirmed',
      '50 consecutive defect-free parts certified (0 failures)',
      'Incident status transitioned to Closed',
    ],
    statuses: ['repairing', 'verifying'],
  },
  {
    key: 'D',
    letter: 'D',
    name: 'Learning & Impact',
    vietnameseName: 'Học hỏi & Tác động',
    lampColor: 'green',
    lampHex: '#10B981',
    description: 'Institutional knowledge base ingestion and carbon / financial savings calculations.',
    activities: [
      'Continuous Learning (Ingests defect-cause-fix into institutional knowledge base)',
      'Expert Video Procedural Analysis (Gemini Multimodal video walkthrough indexing)',
      'Impact Calculator (Avoided scrap, downtime minutes, energy kWh, CO2 emissions)',
      'Shift-Leader Official Approval Sign-off',
    ],
    inputs: [
      'Resolved incident blackboard state & verified resolution',
      'Senior technician repair video recording',
      'Manufacturing energy & GHG emission benchmark factors',
    ],
    outputs: [
      'Avoided scrap pieces & downtime savings computed',
      'Scope 2 energy & material CO2 emissions avoided card',
      'Official Shift Leader sign-off recorded',
    ],
    statuses: ['closed'],
  },
];

function getPhaseStatus(phaseKey: AndonPhaseKey, status: IncidentStatus): AndonPhaseStatus {
  if (status === 'escalated') {
    if (phaseKey === 'B' || phaseKey === 'C') return 'escalated';
    return phaseKey === 'A' ? 'completed' : 'pending';
  }

  switch (status) {
    case 'normal':
      return 'pending';
    case 'detecting':
      return phaseKey === 'A' ? 'active' : 'pending';
    case 'tracing':
    case 'investigating':
    case 'analyzing':
    case 'awaiting_evidence':
      if (phaseKey === 'A') return 'completed';
      if (phaseKey === 'B') return 'active';
      return 'pending';
    case 'repairing':
    case 'verifying':
      if (phaseKey === 'A' || phaseKey === 'B') return 'completed';
      if (phaseKey === 'C') return 'active';
      return 'pending';
    case 'closed':
      return 'completed';
    case 'error':
      return phaseKey === 'A' ? 'active' : 'pending';
    default:
      return 'pending';
  }
}

function getActiveAgentDetails(incident: IncidentState | null): {
  agentName: string;
  role: string;
  statusText: string;
  timestamp: string;
  confidence?: number;
  snippet?: string;
} {
  if (!incident || incident.status === 'normal') {
    return {
      agentName: 'Edge Gateway & SPC Monitor',
      role: 'Baseline Line Supervision',
      statusText: 'STANDBY / MONITORING',
      timestamp: incident?.updated_at || new Date().toLocaleTimeString(),
      snippet: 'Monitoring conveyor line at 120 fps. Defect rate within normal control limits.',
    };
  }

  const latestFinding = incident.findings && incident.findings.length > 0
    ? incident.findings[incident.findings.length - 1]
    : null;

  switch (incident.status) {
    case 'detecting':
      return {
        agentName: 'Quality Inspector Agent',
        role: 'Phase A: Optical Inspection & SPC',
        statusText: 'DEFECT SPIKE DETECTED',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.96,
        snippet: latestFinding?.finding || `Defect rate ${(incident.defect_rate * 100).toFixed(2)}% breached UCL ${(incident.spc_ucl * 100).toFixed(2)}%`,
      };
    case 'tracing':
      return {
        agentName: 'Traceability Agent',
        role: 'Phase B: Genealogy & Batch Query',
        statusText: 'QUERYING BIGQUERY',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.92,
        snippet: latestFinding?.finding || `Tracing batch genealogy to identify suspect machine...`,
      };
    case 'analyzing':
      return {
        agentName: 'Process Analyst Agent',
        role: 'Phase B: Telemetry & Vibration Analysis',
        statusText: 'CORRELATING SENSORS',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.94,
        snippet: latestFinding?.finding || `Analyzing spindle vibration spikes and motor load on ${incident.suspect_machine || 'CNC-02'}`,
      };
    case 'investigating':
      return {
        agentName: 'Root Cause Agent (RCA)',
        role: 'Phase B: 5-Whys & Knowledge RAG',
        statusText: 'EVALUATING HYPOTHESIS',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.88,
        snippet: latestFinding?.finding || incident.root_cause || 'Synthesizing telemetry evidence with OEM maintenance manuals',
      };
    case 'awaiting_evidence':
      return {
        agentName: 'Technician Copilot (Step 7b Probe)',
        role: 'Phase B: Low-Confidence Visual Probe',
        statusText: 'FIELD EVIDENCE REQUESTED',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.65,
        snippet: 'Awaiting close-up tool photo from technician before finalizing RCA hypothesis',
      };
    case 'repairing':
      return {
        agentName: 'Technician Copilot Agent',
        role: 'Phase C: Gemini Live Voice & Vision',
        statusText: 'PHYSICAL REPAIR IN PROGRESS',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: latestFinding?.confidence ?? 0.95,
        snippet: 'Guiding frontline technician in Vietnamese through tool insert replacement & torque calibration',
      };
    case 'verifying':
      return {
        agentName: 'Quality Inspector Gatekeeper',
        role: 'Phase C: Physical Verification',
        statusText: `VERIFYING STREAK (${incident.verification_count}/${incident.verification_target})`,
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: 1.0,
        snippet: `Counting consecutive defect-free parts: ${incident.verification_count} of ${incident.verification_target} required`,
      };
    case 'closed':
      return {
        agentName: 'Incident Scribe & Continuous Learning',
        role: 'Phase D: Institutional Memory & Impact',
        statusText: incident.approved ? 'APPROVED BY SHIFT LEADER' : 'CLOSED & VERIFIED',
        timestamp: latestFinding?.timestamp || incident.updated_at,
        confidence: 1.0,
        snippet: incident.approved
          ? 'Official shift-leader sign-off completed. Knowledge library updated.'
          : '8D report drafted and sustainability impact calculated. Awaiting shift-leader approval.',
      };
    case 'escalated':
      return {
        agentName: 'Incident Orchestrator',
        role: 'Exception Escalation',
        statusText: 'ESCALATED TO SUPERVISOR',
        timestamp: incident.updated_at,
        snippet: incident.status_reason || 'Incident escalated due to low confidence or repeated verification failure.',
      };
    case 'error':
      return {
        agentName: 'System Monitor',
        role: 'Operational Error',
        statusText: 'SYSTEM ALERT',
        timestamp: incident.updated_at,
        snippet: incident.status_reason || 'System encountered an execution error.',
      };
    default:
      return {
        agentName: 'Kaizen Orchestrator',
        role: 'ADK Multi-Agent Team',
        statusText: 'ACTIVE',
        timestamp: incident.updated_at,
        snippet: 'Processing multi-agent pipeline...',
      };
  }
}

export default function AndonPhaseTracker({
  incident: propIncident,
  onPhaseSelect,
}: AndonPhaseTrackerProps): React.ReactElement {
  const [internalIncident, setInternalIncident] = useState<IncidentState | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<AndonPhaseKey | null>(null);

  // If incident prop is not provided, subscribe directly to the SSE stream
  useEffect(() => {
    if (propIncident !== undefined) return;

    let eventSource: EventSource | null = null;
    let fallbackAttempted = false;

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const data: IncidentState = JSON.parse(event.data);
        setInternalIncident(data);
      } catch (err) {
        console.error('Failed to parse incident SSE event in AndonPhaseTracker:', err);
      }
    };

    const initEventSource = (url: string) => {
      const es = new EventSource(url);
      es.addEventListener('incident_update', handleMessage);
      es.onerror = (err) => {
        if (!fallbackAttempted && url === '/api/incidents/stream') {
          fallbackAttempted = true;
          console.warn('AndonPhaseTracker /api/incidents/stream unreachable, falling back to /api/incidents/events:', err);
          es.close();
          eventSource = initEventSource('/api/incidents/events');
        } else {
          console.warn(`AndonPhaseTracker SSE connection warning on ${url}:`, err);
        }
      };
      return es;
    };

    try {
      eventSource = initEventSource('/api/incidents/stream');
    } catch (e) {
      console.warn('EventSource not available:', e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [propIncident]);

  const incident = propIncident !== undefined ? propIncident : internalIncident;
  const currentStatus: IncidentStatus = incident?.status ?? 'normal';
  const activeAgent = getActiveAgentDetails(incident);

  // Determine which lamp on the stack is currently active
  const isLampAActive = currentStatus === 'detecting' || currentStatus === 'error' || currentStatus === 'escalated';
  const isLampBActive = ['tracing', 'investigating', 'analyzing', 'awaiting_evidence'].includes(currentStatus);
  const isLampCActive = ['repairing', 'verifying'].includes(currentStatus);
  const isLampDActive = currentStatus === 'closed' || currentStatus === 'normal';

  // Overall lifecycle progress calculation
  const getProgressPercentage = (): number => {
    switch (currentStatus) {
      case 'normal':
        return 0;
      case 'detecting':
        return 15;
      case 'tracing':
        return 30;
      case 'analyzing':
      case 'investigating':
      case 'awaiting_evidence':
        return 50;
      case 'repairing':
        return 70;
      case 'verifying': {
        const count = incident?.verification_count ?? 0;
        const target = incident?.verification_target ?? 50;
        return 75 + Math.min(20, Math.round((count / target) * 20));
      }
      case 'closed':
        return 100;
      default:
        return 0;
    }
  };

  const handlePhaseClick = (key: AndonPhaseKey) => {
    const nextSelected = selectedPhase === key ? null : key;
    setSelectedPhase(nextSelected);
    if (onPhaseSelect) {
      onPhaseSelect(key);
    }
  };

  return (
    <div
      style={{
        background: '#0B131F',
        border: '1px solid #1E293B',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes andon-pulse-red {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 6px #EF4444, 0 0 12px rgba(239, 68, 68, 0.6);
          }
          50% {
            transform: scale(1.18);
            box-shadow: 0 0 14px #EF4444, 0 0 24px rgba(239, 68, 68, 0.9);
          }
        }
        @keyframes andon-pulse-yellow {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 6px #F59E0B, 0 0 12px rgba(245, 158, 11, 0.6);
          }
          50% {
            transform: scale(1.18);
            box-shadow: 0 0 14px #F59E0B, 0 0 24px rgba(245, 158, 11, 0.9);
          }
        }
        @keyframes andon-pulse-blue {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 6px #3B82F6, 0 0 12px rgba(59, 130, 246, 0.6);
          }
          50% {
            transform: scale(1.18);
            box-shadow: 0 0 14px #3B82F6, 0 0 24px rgba(59, 130, 246, 0.9);
          }
        }
        @keyframes andon-pulse-green {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 6px #10B981, 0 0 12px rgba(16, 185, 129, 0.6);
          }
          50% {
            transform: scale(1.18);
            box-shadow: 0 0 14px #10B981, 0 0 24px rgba(16, 185, 129, 0.9);
          }
        }
        @keyframes andon-alarm-flash {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(0.9); }
        }
        .andon-stepper-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        @media (max-width: 1024px) {
          .andon-stepper-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .andon-stepper-grid {
            grid-template-columns: 1fr;
          }
        }
        .andon-card-hover:hover {
          transform: translateY(-2px);
          border-color: #475569 !important;
        }
      `}</style>

      {/* Header: Title, Active Agent Pill, and Industrial Andon Light Tower */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          borderBottom: '1px solid #1E293B',
          paddingBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                background: '#1E293B',
                color: '#38BDF8',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              ANDON SYSTEM
            </span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC' }}>
              4-Phase Incident Lifecycle Tracker
            </h2>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
            Quy trình 4 pha: Phát hiện ➔ Truy ngược ➔ Xử lý ➔ Học hỏi
          </span>
        </div>

        {/* Industrial Andon Lamp Stack & Active Agent Pill container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Active Agent Pill */}
          <div
            style={{
              background: '#0F172A',
              border: '1px solid #334155',
              borderRadius: '24px',
              padding: '0.4rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background:
                  currentStatus === 'normal'
                    ? '#10B981'
                    : currentStatus === 'escalated' || currentStatus === 'error'
                    ? '#EF4444'
                    : '#38BDF8',
                boxShadow: `0 0 8px ${
                  currentStatus === 'normal' ? '#10B981' : currentStatus === 'escalated' ? '#EF4444' : '#38BDF8'
                }`,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F1F5F9' }}>
                  {activeAgent.agentName}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background:
                      currentStatus === 'closed'
                        ? '#064E3B'
                        : currentStatus === 'normal'
                        ? '#1E293B'
                        : '#1E3A8A',
                    color:
                      currentStatus === 'closed'
                        ? '#6EE7B7'
                        : currentStatus === 'normal'
                        ? '#94A3B8'
                        : '#93C5FD',
                  }}
                >
                  {activeAgent.statusText}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                {activeAgent.timestamp}
                {activeAgent.confidence !== undefined && (
                  <span style={{ marginLeft: '0.5rem', color: '#38BDF8' }}>
                    • {(activeAgent.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Physical Andon Lamp Stack (Red, Yellow, Blue, Green) */}
          <div
            title="Industrial Andon Stack: Red (Defect Spike), Yellow (RCA/Investigation), Blue (Repair/Verification), Green (Verified & Stable)"
            style={{
              background: '#030712',
              border: '2px solid #334155',
              borderRadius: '16px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            {/* Lamp A: Red */}
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isLampAActive ? '#EF4444' : '#3F1212',
                border: '1px solid #7F1D1D',
                animation: isLampAActive ? 'andon-pulse-red 1.5s infinite ease-in-out' : 'none',
                opacity: isLampAActive ? 1 : 0.35,
                transition: 'all 0.3s ease',
              }}
              title="Lamp A: Defect Spike / Anomaly Alarm"
            />
            {/* Lamp B: Yellow */}
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isLampBActive ? '#F59E0B' : '#452A03',
                border: '1px solid #78350F',
                animation: isLampBActive ? 'andon-pulse-yellow 1.5s infinite ease-in-out' : 'none',
                opacity: isLampBActive ? 1 : 0.35,
                transition: 'all 0.3s ease',
              }}
              title="Lamp B: Tracing & RCA Investigation"
            />
            {/* Lamp C: Blue */}
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isLampCActive ? '#3B82F6' : '#0F254B',
                border: '1px solid #1E3A8A',
                animation: isLampCActive ? 'andon-pulse-blue 1.5s infinite ease-in-out' : 'none',
                opacity: isLampCActive ? 1 : 0.35,
                transition: 'all 0.3s ease',
              }}
              title="Lamp C: Technician Repair & Verification"
            />
            {/* Lamp D: Green */}
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isLampDActive ? '#10B981' : '#063022',
                border: '1px solid #065F46',
                animation:
                  currentStatus === 'closed'
                    ? 'andon-pulse-green 1.5s infinite ease-in-out'
                    : 'none',
                opacity: isLampDActive ? 1 : 0.35,
                transition: 'all 0.3s ease',
              }}
              title="Lamp D: Verified, Closed & Stable"
            />
          </div>
        </div>
      </div>

      {/* Overall Lifecycle Progress Bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#94A3B8' }}>Lifecycle Progression</span>
          <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{getProgressPercentage()}% Completed</span>
        </div>
        <div
          style={{
            height: '6px',
            background: '#1E293B',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${getProgressPercentage()}%`,
              background:
                currentStatus === 'closed'
                  ? 'linear-gradient(90deg, #3B82F6, #10B981)'
                  : currentStatus === 'escalated'
                  ? '#EF4444'
                  : 'linear-gradient(90deg, #EF4444 0%, #F59E0B 35%, #3B82F6 70%, #10B981 100%)',
              transition: 'width 0.5s ease-in-out',
            }}
          />
        </div>
      </div>

      {/* Four-Phase Visual Stepper Grid */}
      <div className="andon-stepper-grid">
        {PHASES_CONFIG.map((phase) => {
          const phaseStatus = getPhaseStatus(phase.key, currentStatus);
          const isActive = phaseStatus === 'active';
          const isCompleted = phaseStatus === 'completed';
          const isEscalated = phaseStatus === 'escalated';
          const isCardSelected = selectedPhase === phase.key;

          // Border & Glow styling
          let borderColor = '#1E293B';
          let bgGradient = '#0F172A';
          let shadow = 'none';

          if (isActive) {
            borderColor = phase.lampHex;
            bgGradient = '#131E33';
            shadow = `0 0 16px ${phase.lampHex}33`;
          } else if (isCompleted) {
            borderColor = '#059669';
            bgGradient = '#0B1724';
          } else if (isEscalated) {
            borderColor = '#DC2626';
            bgGradient = '#261214';
          }

          if (isCardSelected) {
            borderColor = '#38BDF8';
            shadow = '0 0 20px rgba(56, 189, 248, 0.3)';
          }

          return (
            <div
              key={phase.key}
              onClick={() => handlePhaseClick(phase.key)}
              className="andon-card-hover"
              style={{
                background: bgGradient,
                border: `2px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '1.1rem',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: shadow,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                position: 'relative',
              }}
            >
              {/* Card Top: Phase Badge, Lamp, and Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Phase Letter Circle */}
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: isActive ? phase.lampHex : isCompleted ? '#065F46' : '#1E293B',
                      color: isActive ? '#030712' : isCompleted ? '#A7F3D0' : '#94A3B8',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {phase.letter}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#F8FAFC' }}>
                      {phase.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{phase.vietnameseName}</div>
                  </div>
                </div>

                {/* Individual Andon Lamp for this phase */}
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: isActive ? phase.lampHex : isCompleted ? '#10B981' : '#334155',
                    boxShadow: isActive
                      ? `0 0 10px ${phase.lampHex}, 0 0 20px ${phase.lampHex}`
                      : isCompleted
                      ? '0 0 6px #10B981'
                      : 'none',
                    animation: isActive
                      ? phase.key === 'A'
                        ? 'andon-pulse-red 1.5s infinite'
                        : phase.key === 'B'
                        ? 'andon-pulse-yellow 1.5s infinite'
                        : phase.key === 'C'
                        ? 'andon-pulse-blue 1.5s infinite'
                        : 'andon-pulse-green 1.5s infinite'
                      : 'none',
                  }}
                  title={`Andon Lamp ${phase.letter}: ${phaseStatus.toUpperCase()}`}
                />
              </div>

              {/* Status Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: isActive
                      ? `${phase.lampHex}22`
                      : isCompleted
                      ? '#064E3B'
                      : isEscalated
                      ? '#7F1D1D'
                      : '#1E293B',
                    color: isActive
                      ? phase.lampHex
                      : isCompleted
                      ? '#34D399'
                      : isEscalated
                      ? '#FCA5A5'
                      : '#64748B',
                    border: `1px solid ${
                      isActive
                        ? `${phase.lampHex}44`
                        : isCompleted
                        ? '#059669'
                        : isEscalated
                        ? '#DC2626'
                        : '#334155'
                    }`,
                  }}
                >
                  {isEscalated ? 'ESCALATED' : isCompleted ? 'VERIFIED / DONE' : isActive ? 'ACTIVE NOW' : 'PENDING'}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  {isCardSelected ? '▼ Details open' : 'Click to inspect'}
                </span>
              </div>

              {/* Key Agent Activities Summary */}
              <div
                style={{
                  background: '#0B1322',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                  Key Activities
                </div>
                <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.75rem', color: '#CBD5E1' }}>
                  {phase.activities.slice(0, 2).map((act, idx) => (
                    <li key={idx} style={{ marginBottom: '2px' }}>
                      {act}
                    </li>
                  ))}
                  {phase.activities.length > 2 && (
                    <li style={{ color: '#64748B', listStyleType: 'none' }}>
                      +{phase.activities.length - 2} more steps...
                    </li>
                  )}
                </ul>
              </div>

              {/* Dynamic Live Outputs Preview */}
              <div
                style={{
                  background: '#070D18',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #172554',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 600, color: '#38BDF8', marginBottom: '0.25rem' }}>
                  Outputs (Ra)
                </div>
                {phase.key === 'A' && (
                  <div style={{ color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div>
                      Defect Rate:{' '}
                      <strong style={{ color: incident ? '#EF4444' : '#94A3B8' }}>
                        {incident ? `${(incident.defect_rate * 100).toFixed(2)}%` : '0.50%'}
                      </strong>{' '}
                      (UCL {incident ? `${(incident.spc_ucl * 100).toFixed(2)}%` : '3.00%'})
                    </div>
                    <div>Type: {incident?.defect_type || 'scratch_vertical'}</div>
                  </div>
                )}
                {phase.key === 'B' && (
                  <div style={{ color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div>
                      Suspect:{' '}
                      <strong style={{ color: '#F59E0B' }}>
                        {incident?.suspect_machine || 'CNC-02'}
                      </strong>{' '}
                      / {incident?.suspect_tool || 'T07'}
                    </div>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '220px',
                      }}
                      title={incident?.root_cause || 'Tool insert flank wear after 240 cycles'}
                    >
                      RCA: {incident?.root_cause || 'Tool flank wear'}
                    </div>
                  </div>
                )}
                {phase.key === 'C' && (
                  <div style={{ color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div>
                      Repair:{' '}
                      <strong style={{ color: incident?.repair_done ? '#10B981' : '#38BDF8' }}>
                        {incident?.repair_done ? 'Completed' : currentStatus === 'repairing' ? 'In Progress' : 'Pending'}
                      </strong>
                    </div>
                    <div>
                      Streak Verification:{' '}
                      <strong style={{ color: '#38BDF8' }}>
                        {incident?.verification_count ?? 0} / {incident?.verification_target ?? 50}
                      </strong>{' '}
                      PASS
                    </div>
                  </div>
                )}
                {phase.key === 'D' && (
                  <div style={{ color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div>
                      Scrap Saved:{' '}
                      <strong style={{ color: '#10B981' }}>
                        {incident?.impact?.scrap_avoided ?? 240} pcs
                      </strong>
                    </div>
                    <div>
                      Sign-off:{' '}
                      <strong style={{ color: incident?.approved ? '#10B981' : '#F59E0B' }}>
                        {incident?.approved ? 'Shift Leader Approved' : 'Pending'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Interactive Detail Drawer (when a phase is clicked) */}
      {selectedPhase && (
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.25rem',
            marginTop: '0.5rem',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {(() => {
            const phase = PHASES_CONFIG.find((p) => p.key === selectedPhase)!;
            const phaseStatus = getPhaseStatus(phase.key, currentStatus);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: phase.lampHex,
                        color: '#0F172A',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {phase.letter}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#F8FAFC' }}>
                        Phase {phase.letter}: {phase.name} ({phase.vietnameseName})
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                        {phase.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPhase(null)}
                    style={{
                      background: '#1E293B',
                      border: '1px solid #475569',
                      color: '#94A3B8',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Close ✕
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {/* Inputs (Vào) */}
                  <div
                    style={{
                      background: '#131D30',
                      border: '1px solid #1E293B',
                      borderRadius: '8px',
                      padding: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#38BDF8', marginBottom: '0.5rem' }}>
                      Inputs (Vào)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                      {phase.inputs.map((inItem, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          {inItem}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Agent Activities */}
                  <div
                    style={{
                      background: '#131D30',
                      border: '1px solid #1E293B',
                      borderRadius: '8px',
                      padding: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#FBBF24', marginBottom: '0.5rem' }}>
                      Agent Flow & Activities
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                      {phase.activities.map((act, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          {act}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Outputs (Ra) */}
                  <div
                    style={{
                      background: '#131D30',
                      border: '1px solid #1E293B',
                      borderRadius: '8px',
                      padding: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#34D399', marginBottom: '0.5rem' }}>
                      Outputs (Ra)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#E2E8F0' }}>
                      {phase.outputs.map((out, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          {out}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  style={{
                    background: '#0B1322',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    color: '#94A3B8',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Current Stage Status:{' '}
                    <strong style={{ color: phaseStatus === 'active' ? phase.lampHex : '#38BDF8' }}>
                      {phaseStatus.toUpperCase()}
                    </strong>
                  </span>
                  <span>
                    Referenced Architecture:{' '}
                    <code style={{ color: '#E2E8F0' }}>kaizen-agent-du-lieu-va-luong.html</code>
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
