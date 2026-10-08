// DemoController: Interactive simulation controls and physical verification streak counter.
import React, { useState, useEffect, useRef } from 'react';
import type { IncidentState, SimulationStatusResponse } from '../types';

interface DemoControllerProps {
  incident: IncidentState | null;
  onReset?: () => void;
}

const PHASE_GUIDANCE: Record<string, { phase: string; title: string; script: string; agent: string }> = {
  normal: {
    phase: 'Standby',
    title: 'Baseline Factory Operation',
    agent: 'Edge Gateways & Conveyor Stream',
    script: 'All machines and conveyor belts are operating within nominal thresholds. Ready to inject an anomaly.',
  },
  detecting: {
    phase: 'Phase A',
    title: 'Anomaly Detection & SPC Breach',
    agent: 'Quality Inspector (SPC & Gemma 3)',
    script:
      'Gemma 3 edge classifier and SPC Calculator detect defect surge exceeding the 3.00% UCL limit. Incident opened automatically.',
  },
  tracing: {
    phase: 'Phase B',
    title: 'Cross-Lot Traceability Isolation',
    agent: 'Traceability Agent (BigQuery)',
    script:
      'Agent executes BigQuery cross-lot topology queries, isolating suspect machine (CNC-02) and cutting tool (T07) with zero manual search.',
  },
  investigating: {
    phase: 'Phase B',
    title: 'Root Cause & RAG Grounding',
    agent: 'Root Cause Agent (Vertex AI Search)',
    script:
      'Root Cause Agent grounds 5-Whys deduction in OEM maintenance manuals and 8D reports. Generates verified causal hypothesis.',
  },
  analyzing: {
    phase: 'Phase B',
    title: 'Sensor Telemetry Correlation',
    agent: 'Process Analyst (BigQuery Telemetry)',
    script:
      'Process Analyst correlates spindle vibration spikes (+35%) and motor current surges with physical defect onset.',
  },
  repairing: {
    phase: 'Phase C',
    title: 'Technician Copilot Guidance',
    agent: 'Technician Copilot (Gemini Live)',
    script:
      'Gemini Live Copilot delivers interactive repair instructions in Vietnamese, requiring physical dial indicator measurement confirmation.',
  },
  verifying: {
    phase: 'Phase C',
    title: 'Physical Streak Verification Gatekeeper',
    agent: 'Streak Gatekeeper (Conveyor QC)',
    script:
      'Closed-loop proof: AI monitors 50 consecutive defect-free physical parts. If any defect recurs, the streak immediately resets to 0.',
  },
  closed: {
    phase: 'Phase D',
    title: 'Continuous Learning & Incident Closure',
    agent: 'Incident Scribe & Continuous Learning',
    script:
      'Physical streak passed! Incident Scribe drafts automotive 8D report, updates SOP threshold, and calculates avoided scrap & carbon savings.',
  },
};

export default function DemoController({ incident, onReset }: DemoControllerProps): React.ReactElement {
  const [timingMode, setTimingMode] = useState<'demo' | 'fast'>('fast');
  const [isInjecting, setIsInjecting] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHud, setShowHud] = useState<boolean>(false);
  const [streakResetFlash, setStreakResetFlash] = useState<boolean>(false);
  const [simStatus, setSimStatus] = useState<SimulationStatusResponse | null>(null);

  const prevCountRef = useRef<number>(incident?.verification_count ?? 0);
  const prevStatusRef = useRef<string>(incident?.status ?? 'normal');

  // Detect verification streak reset (drop from >0 to 0 while verifying or reverting from verifying)
  useEffect(() => {
    const currentCount = incident?.verification_count ?? 0;
    const currentStatus = incident?.status ?? 'normal';
    const prevCount = prevCountRef.current;
    const prevStatus = prevStatusRef.current;

    const streakWasActive = prevCount > 0;
    const countDroppedToZero = currentCount === 0;
    const isStillActivePhase = currentStatus !== 'closed' && currentStatus !== 'normal';
    const revertedFromVerifying = prevStatus === 'verifying' && currentStatus === 'investigating';

    if ((streakWasActive && countDroppedToZero && isStillActivePhase) || revertedFromVerifying) {
      setStreakResetFlash(true);
      const timer = window.setTimeout(() => {
        setStreakResetFlash(false);
      }, 7000);
      return () => window.clearTimeout(timer);
    }

    prevCountRef.current = currentCount;
    prevStatusRef.current = currentStatus;
  }, [incident?.verification_count, incident?.status]);

  // Poll simulation status when incident is not normal/closed, or periodically
  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/simulation/status');
        if (res.ok && active) {
          const data: SimulationStatusResponse = await res.json();
          setSimStatus(data);
        }
      } catch (err) {
        // Silent catch for background poll
      }
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [incident?.status]);

  const handleInject = async (scenario: 'cnc_tool_wear' | 'im_damp_material', machineId: string, toolId: string) => {
    setIsInjecting(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setStreakResetFlash(false);

    try {
      const response = await fetch('/api/simulation/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          mode: timingMode,
          machine_id: machineId,
          tool_id: toolId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      setFeedbackMessage(data.message || `Injected ${scenario} on ${machineId} (${timingMode} mode)`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Defect injection failed');
    } finally {
      setIsInjecting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setStreakResetFlash(false);

    try {
      const response = await fetch('/api/simulation/reset', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      setFeedbackMessage(data.message || 'Simulation reset to pristine baseline');
      if (onReset) {
        onReset();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Simulation reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  // Streak calculation
  const verificationCount = incident?.verification_count ?? 0;
  const verificationTarget = incident?.verification_target ?? 50;
  const progressPercent = Math.min(100, Math.round((verificationCount / verificationTarget) * 100));
  const isVerifying = incident?.status === 'verifying';
  const isClosed = incident?.status === 'closed';

  const currentStatusKey = incident?.status ?? 'normal';
  const guidance = PHASE_GUIDANCE[currentStatusKey] || PHASE_GUIDANCE.normal;

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1F2937',
        borderRadius: '8px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* Header bar: Title, Mode toggle, and HUD switch */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          borderBottom: '1px solid #1F2937',
          paddingBottom: '0.75rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Demo Simulation Controller</h2>
            <span
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '12px',
                background: simStatus?.status === 'running' ? '#065F46' : '#374151',
                color: simStatus?.status === 'running' ? '#6EE7B7' : '#9CA3AF',
                fontWeight: 600,
              }}
            >
              {simStatus?.status === 'running' ? '● Simulation Active' : '○ Standby'}
            </span>
          </div>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#9CA3AF' }}>
            Deterministic anomaly injection, timing envelopes, and physical streak gatekeeper
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Timing Mode Toggle */}
          <div
            style={{
              display: 'flex',
              background: '#090D16',
              borderRadius: '6px',
              border: '1px solid #374151',
              padding: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setTimingMode('fast')}
              style={{
                background: timingMode === 'fast' ? '#2563EB' : 'transparent',
                color: timingMode === 'fast' ? '#FFFFFF' : '#9CA3AF',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="Fast-forward execution (~8s) for testing"
            >
              ⚡ Fast Mode (~8s)
            </button>
            <button
              type="button"
              onClick={() => setTimingMode('demo')}
              style={{
                background: timingMode === 'demo' ? '#2563EB' : 'transparent',
                color: timingMode === 'demo' ? '#FFFFFF' : '#9CA3AF',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="Full 90-second deterministic demo envelope"
            >
              🎬 Demo Mode (90s)
            </button>
          </div>

          {/* Presenter HUD Mode Switch */}
          <button
            type="button"
            onClick={() => setShowHud(!showHud)}
            style={{
              background: showHud ? '#7C3AED' : '#1F2937',
              color: '#FFFFFF',
              border: `1px solid ${showHud ? '#A78BFA' : '#374151'}`,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🎙️ Presenter HUD:</span>
            <span style={{ color: showHud ? '#C4B5FD' : '#9CA3AF' }}>{showHud ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Presenter HUD Overlay Panel */}
      {showHud && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%)',
            border: '1px solid #6366F1',
            borderRadius: '6px',
            padding: '1rem',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  background: '#6366F1',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {guidance.phase}
              </span>
              <strong style={{ fontSize: '0.9rem', color: '#F3F4F6' }}>{guidance.title}</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#C7D2FE' }}>
              Active Agent: <strong>{guidance.agent}</strong>
            </div>
          </div>
          <p style={{ margin: '0.5rem 0 0.5rem 0', fontSize: '0.85rem', color: '#E0E7FF', lineHeight: 1.4 }}>
            💡 <em>Presenter Talking Point:</em> {guidance.script}
          </p>
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              fontSize: '0.75rem',
              color: '#94A3B8',
              borderTop: '1px solid #312E81',
              paddingTop: '0.4rem',
            }}
          >
            <span>
              Suspect: <strong>{incident?.suspect_machine ?? 'None'}</strong> (Tool {incident?.suspect_tool ?? 'N/A'})
            </span>
            <span>
              Elapsed:{' '}
              <strong>
                {simStatus?.elapsed_seconds !== null && simStatus?.elapsed_seconds !== undefined
                  ? `${simStatus.elapsed_seconds}s`
                  : '0.0s'}
              </strong>{' '}
              / {simStatus?.total_seconds ?? 90}s
            </span>
            <span>
              Gatekeeper:{' '}
              <strong style={{ color: isClosed ? '#34D399' : '#FCD34D' }}>
                {verificationCount} / {verificationTarget}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Streak Reset Warning Visual Banner */}
      {streakResetFlash && (
        <div
          role="alert"
          style={{
            background: 'linear-gradient(90deg, #7F1D1D 0%, #991B1B 100%)',
            border: '2px solid #EF4444',
            borderRadius: '6px',
            padding: '0.9rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#FEE2E2' }}>
                PHYSICAL VERIFICATION STREAK RESET TO 0!
              </div>
              <div style={{ fontSize: '0.8rem', color: '#FECACA' }}>
                Defect detected during Phase C verification. Streak reset from active count back to 0/50 consecutive
                clean parts. Closed-loop integrity enforced.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStreakResetFlash(false)}
            style={{
              background: '#450A0A',
              border: '1px solid #F87171',
              color: '#FEE2E2',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Physical Streak Counter Section */}
      <div
        style={{
          background: '#090D16',
          border: `1px solid ${isVerifying ? '#F59E0B' : isClosed ? '#10B981' : '#1F2937'}`,
          borderRadius: '6px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          transition: 'border-color 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F3F4F6' }}>
              Physical Verification Streak Counter
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              Phase C Zero-Defect Gatekeeper (Requires 50 consecutive defect-free parts)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '12px',
                background: isClosed
                  ? '#065F46'
                  : isVerifying
                  ? '#78350F'
                  : '#1F2937',
                color: isClosed
                  ? '#34D399'
                  : isVerifying
                  ? '#FCD34D'
                  : '#9CA3AF',
                border: `1px solid ${
                  isClosed ? '#059669' : isVerifying ? '#D97706' : '#374151'
                }`,
              }}
            >
              {isClosed
                ? '50 / 50 PASSED'
                : isVerifying
                ? `VERIFYING (${verificationCount}/${verificationTarget})`
                : `STANDBY (0/${verificationTarget})`}
            </span>
          </div>
        </div>

        {/* Live Progress Bar */}
        <div style={{ width: '100%', height: '16px', background: '#1F2937', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${isClosed ? 100 : progressPercent}%`,
              height: '100%',
              background: isClosed
                ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                : isVerifying
                ? 'linear-gradient(90deg, #F59E0B 0%, #10B981 100%)'
                : '#374151',
              transition: 'width 0.4s ease-out, background 0.4s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9CA3AF' }}>
          <span>
            Current Streak: <strong style={{ color: '#F3F4F6' }}>{verificationCount}</strong> / {verificationTarget} parts
          </span>
          <span>
            {isClosed ? (
              <span style={{ color: '#10B981', fontWeight: 600 }}>✓ Gatekeeper Satisfied — Ready for 8D Report</span>
            ) : isVerifying ? (
              <span style={{ color: '#F59E0B', fontWeight: 600 }}>Continuous streak in progress ({progressPercent}%)</span>
            ) : (
              <span>Verification activates during Phase C</span>
            )}
          </span>
        </div>
      </div>

      {/* Action Buttons: Defect Injection Triggers & Reset Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {/* Scenario 1 Button */}
        <button
          type="button"
          onClick={() => handleInject('cnc_tool_wear', 'CNC-02', 'T07')}
          disabled={isInjecting || isResetting}
          style={{
            background: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            textAlign: 'left',
            cursor: isInjecting || isResetting ? 'not-allowed' : 'pointer',
            opacity: isInjecting || isResetting ? 0.6 : 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#EF4444';
          }}
          onMouseLeave={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#374151';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#F87171' }}>
              Inject CNC-02 Tool Defect
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Scenario 1</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            Tool T07 wear (+35% vib, vertical scratch spike &gt; UCL)
          </span>
        </button>

        {/* Scenario 2 Button */}
        <button
          type="button"
          onClick={() => handleInject('im_damp_material', 'IM-05', 'MOLD-03')}
          disabled={isInjecting || isResetting}
          style={{
            background: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            textAlign: 'left',
            cursor: isInjecting || isResetting ? 'not-allowed' : 'pointer',
            opacity: isInjecting || isResetting ? 0.6 : 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#F59E0B';
          }}
          onMouseLeave={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#374151';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#FBBF24' }}>
              Inject IM-05 Damp Material Defect
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Scenario 2</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            Mold-03 cavity #3 short fill &amp; dryer dew point (-18°C)
          </span>
        </button>

        {/* Simulate Streak Reset Button (Demo Tool) */}
        <button
          type="button"
          onClick={() => setStreakResetFlash(true)}
          style={{
            background: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#DC2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#374151';
          }}
          title="Demonstrates the closed-loop streak reset visual alert on demand for judges"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#FB7185' }}>
              Test Streak Reset Alert
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Demo Tool</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            Flashes verification gatekeeper streak reset banner
          </span>
        </button>

        {/* Reset Environment Button */}
        <button
          type="button"
          onClick={handleReset}
          disabled={isInjecting || isResetting}
          style={{
            background: '#1E293B',
            border: '1px solid #475569',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            textAlign: 'left',
            cursor: isInjecting || isResetting ? 'not-allowed' : 'pointer',
            opacity: isInjecting || isResetting ? 0.6 : 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#38BDF8';
          }}
          onMouseLeave={(e) => {
            if (!isInjecting && !isResetting) e.currentTarget.style.borderColor = '#475569';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#38BDF8' }}>
              ↺ Reset Environment
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: isResetting ? '#38BDF8' : '#94A3B8',
              }}
            >
              {isResetting ? 'Resetting...' : 'Pristine'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
            Restore Blackboard, Machines, and BigQuery buffers to baseline
          </span>
        </button>
      </div>

      {/* Status Feedback / Error Toasts */}
      {feedbackMessage && (
        <div
          style={{
            background: '#064E3B',
            border: '1px solid #059669',
            borderRadius: '4px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            color: '#A7F3D0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#A7F3D0',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            background: '#7F1D1D',
            border: '1px solid #DC2626',
            borderRadius: '4px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            color: '#FECACA',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✕ Error: {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FECACA',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
