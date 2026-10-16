// DemoController: glass slide-over for passive incident execution monitoring, factory stream health, and blackboard reset.
import React, { useState } from 'react';
import type {
  GeminiLiveStatus,
  HealthResponse,
  IncidentState,
  ResetResponse,
  SimulationStatusResponse,
  TelemetryBaselineResponse,
} from '../types';
import { useApi } from '../lib/api';
import { authFetch } from '../lib/auth';
import type { ToastTone } from '../App';
import { STATUS_LABEL, friendlyDefectName } from '../lib/incident';
import { useFactoryStream } from '../hooks/useFactoryStream';

interface DemoControllerProps {
  open: boolean;
  onClose: () => void;
  incident: IncidentState | null;
  simStatus: SimulationStatusResponse | null;
  onStatusChange: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type Scenario = 'cnc_tool_wear' | 'im_damp_material';

const SCENARIOS: {
  id: Scenario;
  index: number;
  title: string;
  machine: string;
  tool: string;
  icon: string;
  detail: string;
  signal: string;
}[] = [
  {
    id: 'cnc_tool_wear',
    index: 1,
    title: 'CNC Tool Wear',
    machine: 'CNC-02',
    tool: 'T07',
    icon: 'precision_manufacturing',
    detail: 'Insert flank wear drives spindle chatter → surface scratches at CAM-EOL.',
    signal: 'Vibration +35% · Current surge',
  },
  {
    id: 'im_damp_material',
    index: 2,
    title: 'IM Damp Material',
    machine: 'IM-05',
    tool: 'MOLD-03',
    icon: 'water_drop',
    detail: 'Under-dried resin raises moisture → splay and short-shot on molded housings.',
    signal: 'Dryer dew point drift',
  },
];

const PHASE_SCRIPT: Record<string, string> = {
  normal: 'All stations nominal. Trigger an anomaly on the Factory Floor (Window 1) to watch the agent team respond.',
  detecting: 'Quality Inspector sees the defect rate breach the 3.00% UCL and opens an incident.',
  tracing: 'Traceability agent walks part genealogy in BigQuery to isolate the suspect station.',
  investigating: 'Process Analyst correlates spindle vibration and current with defect onset.',
  analyzing: 'Root Cause agent grounds a 5-Whys chain in OEM manuals and past 8D reports.',
  awaiting_evidence: 'Confidence below 70% — Technician Copilot requests field evidence.',
  repairing: 'Technician Copilot guides the repair over Gemini Live voice + camera.',
  verifying: 'Streak gatekeeper counts consecutive good parts. Any defect resets to 0.',
  closed: 'Streak passed. Continuous Learning captures lessons learned and impact; awaiting shift-leader approval.',
  escalated: 'Escalated to supervisor — automatic resolution halted.',
  error: 'Workflow error — check backend logs.',
  dismissed: 'Incident dismissed.',
};

export default function DemoController({
  open,
  onClose,
  incident,
  simStatus,
  onStatusChange,
  onNotify,
}: DemoControllerProps): React.ReactElement {
  const [busy, setBusy] = useState<'reset' | null>(null);
  const [lastReset, setLastReset] = useState<ResetResponse | null>(null);

  const factoryStream = useFactoryStream({ enabled: open });
  const health = useApi<HealthResponse>(open ? '/health' : null, 10000);
  const live = useApi<GeminiLiveStatus>(open ? '/api/gemini-live/status' : null, 10000);
  const baseline = useApi<TelemetryBaselineResponse>(open ? '/api/telemetry/baseline' : null);

  const status = incident?.status ?? 'normal';
  const isIncidentActive = status !== 'normal' && status !== 'closed' && status !== 'dismissed';
  const running = simStatus?.status === 'running' || isIncidentActive;

  const elapsed =
    simStatus?.elapsed_seconds ??
    (incident?.opened_at ? Math.max(0, Math.round((Date.now() - new Date(incident.opened_at).getTime()) / 1000)) : 0);
  const total = simStatus?.total_seconds ?? (simStatus?.mode === 'fast' ? 8 : 90);
  const runPct = running ? Math.min(100, (elapsed / Math.max(1, total)) * 100) : 0;

  const suspectMachine = incident?.suspect_machine ?? simStatus?.target_machine ?? null;
  const activeDefectType = incident?.defect_type
    ? friendlyDefectName(incident.defect_type)
    : simStatus?.active_scenario ?? factoryStream.packet.active_anomaly?.scenario ?? null;

  const factoryUiUrl =
    (import.meta.env.VITE_FACTORY_UI_URL as string | undefined) ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3002`
      : 'http://localhost:3002');

  const factoryStreamOrigin = import.meta.env.VITE_FACTORY_STREAM_ORIGIN ?? '';
  const factoryStreamEndpoint = `${factoryStreamOrigin || (typeof window !== 'undefined' ? window.location.origin : '')}/api/factory/stream`;

  const reset = async () => {
    setBusy('reset');
    try {
      const res = await authFetch('/api/simulation/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as ResetResponse;
      setLastReset(data);
      onNotify(data.message ?? 'Blackboard reset to nominal baseline');
      onStatusChange();
    } catch (err) {
      onNotify(err instanceof Error ? `Reset failed: ${err.message}` : 'Reset failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 80,
          background: 'rgba(15,23,42,0.18)',
          backdropFilter: 'blur(3px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.35s var(--ease)',
        }}
      />
      <aside
        aria-label="Incident Execution & Factory Monitor"
        aria-hidden={!open}
        className="glass glass-strong"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          bottom: 12,
          width: 'min(440px, calc(100vw - 24px))',
          zIndex: 90,
          borderRadius: 26,
          padding: '1.3rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1rem',
          overflowY: 'auto',
          visibility: open ? 'visible' : 'hidden',
          transform: open ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          transition: `transform 0.5s var(--ease), visibility 0s linear ${open ? '0s' : '0.5s'}`,
        }}
      >
        {/* Header */}
        <div className="row between">
          <div>
            <div className="eyebrow">Physical Separation · Control Plane</div>
            <h2 className="card-title" style={{ fontSize: '1.2rem', marginTop: 2 }}>
              Incident &amp; Factory Monitor
            </h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close monitor panel">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Window 1 Navigation Banner */}
        <div
          className="glass-inset col"
          style={{
            padding: '1rem',
            borderRadius: 18,
            gap: 10,
            border: '1px solid rgba(91, 91, 240, 0.25)',
            background: 'linear-gradient(145deg, rgba(244, 246, 255, 0.9) 0%, rgba(235, 240, 255, 0.6) 100%)',
          }}
        >
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
                precision_manufacturing
              </span>
              <strong style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>Window 1: Factory Floor Client</strong>
            </span>
            <span className="chip chip-blue mono" style={{ fontSize: '0.65rem' }}>
              Edge Ingress
            </span>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
            In the decoupled architecture, anomaly injection belongs exclusively to the physical factory floor. The
            Cloud AI Control Plane listens passively to Google Cloud Pub/Sub events.
          </p>
          <a
            id="open-factory-floor-btn"
            href={factoryUiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-accent btn-block"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textDecoration: 'none',
              padding: '0.75rem',
              fontWeight: 650,
              fontSize: '0.82rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              open_in_new
            </span>
            Open Factory Floor UI (Window 1)
          </a>
        </div>

        {/* Active Incident Execution Progress */}
        <div className={running ? 'glass-dark' : 'glass-inset'} style={{ padding: '0.95rem 1rem', borderRadius: 16 }}>
          <div className="row between">
            <span className="row" style={{ gap: 8, fontSize: '0.8rem', fontWeight: 650 }}>
              <span
                className={running ? 'animate-pulse-glow' : undefined}
                style={{ width: 8, height: 8, borderRadius: 999, background: running ? '#f87171' : 'var(--green)' }}
              />
              {running
                ? `Active · ${STATUS_LABEL[status]}${suspectMachine ? ` · ${suspectMachine}` : ''}`
                : 'Nominal · Monitoring line'}
            </span>
            <span className="mono" style={{ fontSize: '0.72rem', opacity: 0.75 }}>
              {running ? `${elapsed.toFixed(0)}s / ${total}s` : simStatus ? 'backend connected' : 'backend offline'}
            </span>
          </div>

          {running && (
            <div className="progress" style={{ marginTop: 10, background: 'rgba(255,255,255,0.15)' }}>
              <span style={{ width: `${runPct}%`, background: 'linear-gradient(90deg,#f87171,#fbbf24)' }} />
            </div>
          )}

          <div
            style={{
              marginTop: 10,
              fontSize: '0.76rem',
              opacity: running ? 0.9 : 1,
              color: running ? '#e2e8f0' : 'var(--text)',
              lineHeight: 1.5,
            }}
          >
            <strong>{STATUS_LABEL[status]}:</strong> {PHASE_SCRIPT[status] ?? PHASE_SCRIPT.normal}
          </div>

          {incident && isIncidentActive && (
            <div
              className="row wrap mono"
              style={{
                gap: 6,
                marginTop: 8,
                fontSize: '0.7rem',
                color: running ? '#cbd5e1' : 'var(--muted)',
              }}
            >
              <span className="chip" style={{ background: running ? 'rgba(255,255,255,0.12)' : undefined }}>
                ID: #{incident.incident_id}
              </span>
              {suspectMachine && (
                <span className="chip" style={{ background: running ? 'rgba(255,255,255,0.12)' : undefined }}>
                  Station: {suspectMachine}
                </span>
              )}
              {activeDefectType && (
                <span className="chip" style={{ background: running ? 'rgba(255,255,255,0.12)' : undefined }}>
                  Defect: {activeDefectType}
                </span>
              )}
              {status === 'verifying' && (
                <span className="chip chip-green mono">
                  Streak: {incident.verification_count}/{incident.verification_target}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Live Factory Stream Health & Edge Status */}
        <div className="glass-inset col" style={{ padding: '0.85rem 0.95rem', gap: 6, borderRadius: 16 }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Factory Floor Stream (SSE)</span>
            <span
              className={`chip ${factoryStream.connected ? 'chip-green' : 'chip-amber'} mono`}
              style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: factoryStream.connected ? 'var(--green, #0e8a43)' : '#f59e0b',
                  display: 'inline-block',
                }}
              />
              {factoryStream.connected ? 'Live Stream Active' : 'Connecting…'}
            </span>
          </div>

          <div className="mono" style={{ fontSize: '0.72rem', lineHeight: 1.6 }}>
            Endpoint: <span style={{ opacity: 0.85 }}>{factoryStreamEndpoint}</span>
            <br />
            Conveyor Tick: <span style={{ fontWeight: 600 }}>#{factoryStream.packet.tick_index}</span>
            {factoryStream.lastTickAt && (
              <span style={{ opacity: 0.7 }}> ({new Date(factoryStream.lastTickAt).toLocaleTimeString()})</span>
            )}
            <br />
            Edge Anomaly:{' '}
            <span
              style={{
                color: factoryStream.packet.active_anomaly ? 'var(--red, #e5484d)' : 'var(--green, #12a150)',
                fontWeight: 600,
              }}
            >
              {factoryStream.packet.active_anomaly
                ? `${factoryStream.packet.active_anomaly.scenario ?? 'Active Anomaly'} (${(factoryStream.packet.active_anomaly.severity * 100).toFixed(0)}% sev)`
                : 'None (Nominal)'}
            </span>
          </div>

          {factoryStream.packet.edge_stats && (
            <div
              className="row wrap mono"
              style={{ gap: 6, fontSize: '0.68rem', marginTop: 4, color: 'var(--muted)' }}
            >
              <span className="chip">
                Gemma 3 Reduction: {factoryStream.packet.edge_stats.cloud_bandwidth_reduction_pct.toFixed(1)}%
              </span>
              <span className="chip">
                Defects: {factoryStream.packet.edge_stats.defect_frames_forwarded} / {factoryStream.packet.edge_stats.total_frames_evaluated}
              </span>
            </div>
          )}
        </div>

        {/* Factory Scenarios Catalog Guide */}
        <div className="col" style={{ gap: 8 }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Factory Anomaly Scenarios</span>
            <span className="chip mono" style={{ fontSize: '0.65rem' }}>
              Window 1 Triggers
            </span>
          </div>
          {SCENARIOS.map((s) => (
            <div
              key={s.id}
              id={`factory-scenario-${s.index}`}
              className="glass-inset"
              style={{
                textAlign: 'left',
                padding: '0.85rem 0.95rem',
                borderRadius: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(91,91,240,0.1)',
                  color: 'var(--accent)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {s.icon}
                </span>
              </span>
              <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                <span className="row between wrap" style={{ gap: 6 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 650 }}>
                    Scenario {s.index}: {s.title}
                  </span>
                  <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--accent)' }}>
                    {s.machine} · {s.tool}
                  </span>
                </span>
                <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                  Signal: {s.signal}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{s.detail}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Last Reset Summary */}
        {lastReset && (
          <div
            className="glass-inset col"
            style={{ padding: '0.8rem 0.95rem', gap: 6, borderRadius: 14 }}
            aria-label="Last reset summary"
          >
            <div className="row between">
              <span className="eyebrow">Last reset</span>
              <span className="chip chip-green mono">{lastReset.status}</span>
            </div>
            <div className="mono" style={{ fontSize: '0.74rem', lineHeight: 1.6 }}>
              Blackboard → {lastReset.state?.status ?? 'normal'} (#{lastReset.state?.incident_id ?? '—'})
              <br />
              BigQuery: {lastReset.bigquery?.status ?? '—'}
              {lastReset.bigquery?.message ? ` · ${lastReset.bigquery.message}` : ''}
            </div>
          </div>
        )}

        {/* Backend Services & Diagnostics */}
        <div className="glass-inset col" style={{ padding: '0.8rem 0.95rem', gap: 6, borderRadius: 14 }} aria-label="Backend services">
          <div className="row between" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Cloud AI Control Plane</span>
            <span className={`chip ${health.data ? 'chip-green' : 'chip-amber'} mono`} style={{ fontSize: '0.65rem' }}>
              {health.data ? 'Healthy' : 'Checking…'}
            </span>
          </div>
          <div className="mono" style={{ fontSize: '0.74rem', lineHeight: 1.7 }}>
            API: {health.data ? `${health.data.status} · ${health.data.app} v${health.data.version}` : health.error ? 'unreachable' : '…'}
            <br />
            GCP project: {health.data?.gcp_project || 'unset (mock data)'}
            <br />
            Gemini Live:{' '}
            {live.data
              ? `${live.data.status} · ${live.data.simulation_mode ? 'simulation' : 'live'} · ${live.data.active_sessions} session(s)`
              : live.error
                ? 'unreachable'
                : '…'}
          </div>
          {baseline.data && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text)' }}>Sensor baseline:</strong> {baseline.data.description}
            </div>
          )}
        </div>

        {/* Reset Action */}
        <div className="col" style={{ gap: 8, marginTop: 'auto' }}>
          <button
            id="sim-reset"
            type="button"
            className="btn btn-block"
            style={{ padding: '0.75rem' }}
            disabled={busy !== null}
            onClick={reset}
          >
            <span className="material-symbols-outlined">restart_alt</span>
            {busy === 'reset' ? 'Resetting…' : 'Reset Blackboard'}
          </button>
          <span style={{ fontSize: '0.68rem', color: 'var(--faint)', textAlign: 'center' }}>
            Anomalies route via Factory Pub/Sub · Reset restores the shared Blackboard
          </span>
        </div>
      </aside>
    </>
  );
}
