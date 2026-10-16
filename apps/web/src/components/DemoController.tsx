// DemoController: glass slide-over for scenario defect injection, timing mode, blackboard reset and live run status.
import React, { useState } from 'react';
import type {
  GeminiLiveStatus,
  HealthResponse,
  IncidentState,
  InjectionResponse,
  ResetResponse,
  SimulationStatusResponse,
  TelemetryBaselineResponse,
} from '../types';
import { useApi } from '../lib/api';
import { authFetch } from '../lib/auth';
import type { ToastTone } from '../App';
import { STATUS_LABEL } from '../lib/incident';

interface DemoControllerProps {
  open: boolean;
  onClose: () => void;
  incident: IncidentState | null;
  simStatus: SimulationStatusResponse | null;
  onStatusChange: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

type Scenario = 'cnc_tool_wear' | 'im_damp_material';
type TimingMode = 'demo' | 'fast';

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
  normal: 'All stations nominal. Inject a scenario to watch the agent team respond.',
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
  const [scenario, setScenario] = useState<Scenario>('cnc_tool_wear');
  const [mode, setMode] = useState<TimingMode>('demo');
  const [busy, setBusy] = useState<'inject' | 'reset' | null>(null);
  const [injectedDuration, setInjectedDuration] = useState<number | null>(null);
  const [lastInject, setLastInject] = useState<InjectionResponse | null>(null);
  const [lastReset, setLastReset] = useState<ResetResponse | null>(null);

  const health = useApi<HealthResponse>(open ? '/health' : null, 10000);
  const live = useApi<GeminiLiveStatus>(open ? '/api/gemini-live/status' : null, 10000);
  const baseline = useApi<TelemetryBaselineResponse>(open ? '/api/telemetry/baseline' : null);

  const running = simStatus?.status === 'running';
  const elapsed = simStatus?.elapsed_seconds ?? 0;
  const total = simStatus?.total_seconds ?? injectedDuration ?? (simStatus?.mode === 'fast' || mode === 'fast' ? 8 : 90);
  const runPct = running ? Math.min(100, (elapsed / Math.max(1, total)) * 100) : 0;
  const status = incident?.status ?? 'normal';

  const inject = async () => {
    const s = SCENARIOS.find((x) => x.id === scenario);
    if (!s) return;
    setBusy('inject');
    try {
      const res = await authFetch('/api/simulation/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: s.id, mode, machine_id: s.machine, tool_id: s.tool }),
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as InjectionResponse;
      setLastInject(data);
      setLastReset(null);
      if (typeof data.duration_seconds === 'number') {
        setInjectedDuration(data.duration_seconds);
      }
      onNotify(data.message ?? `Scenario ${s.index} injected on ${s.machine} (${mode === 'demo' ? '90s' : '8s'})`);
      onStatusChange();
    } catch (err) {
      onNotify(err instanceof Error ? `Injection failed: ${err.message}` : 'Injection failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy('reset');
    setInjectedDuration(null);
    try {
      const res = await authFetch('/api/simulation/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as ResetResponse;
      setLastReset(data);
      setLastInject(null);
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
        aria-label="Simulation and defect injection controller"
        aria-hidden={!open}
        className="glass glass-strong"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          bottom: 12,
          width: 'min(420px, calc(100vw - 24px))',
          zIndex: 90,
          borderRadius: 26,
          padding: '1.3rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1rem',
          overflowY: 'auto',
          transform: open ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          visibility: open ? 'visible' : 'hidden',
          transition: `transform 0.5s var(--ease), visibility 0s linear ${open ? '0s' : '0.5s'}`,
        }}
      >
        <div className="row between">
          <div>
            <div className="eyebrow">Simulation &amp; Defect Injection</div>
            <h2 className="card-title" style={{ fontSize: '1.2rem', marginTop: 2 }}>
              Demo Controller
            </h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close simulation panel">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className={running ? 'glass-dark' : 'glass-inset'} style={{ padding: '0.95rem 1rem' }}>
          <div className="row between">
            <span className="row" style={{ gap: 8, fontSize: '0.8rem', fontWeight: 650 }}>
              <span
                className={running ? 'animate-pulse-glow' : undefined}
                style={{ width: 8, height: 8, borderRadius: 999, background: running ? '#f87171' : 'var(--green)' }}
              />
              {running
                ? `Running · ${simStatus?.active_scenario ?? ''}${simStatus?.target_machine ? ` · ${simStatus.target_machine}${simStatus.target_tool ? `/${simStatus.target_tool}` : ''}` : ''}`
                : 'Idle · ready to inject'}
            </span>
            <span className="mono" style={{ fontSize: '0.72rem', opacity: 0.75 }}>
              {running ? `${elapsed.toFixed(0)}s / ${total}s` : simStatus ? 'backend ok' : 'backend offline'}
            </span>
          </div>
          {running && (
            <div className="progress" style={{ marginTop: 10, background: 'rgba(255,255,255,0.15)' }}>
              <span style={{ width: `${runPct}%`, background: 'linear-gradient(90deg,#f87171,#fbbf24)' }} />
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: '0.76rem', opacity: running ? 0.85 : 1, color: running ? '#e2e8f0' : 'var(--text)' }}>
            <strong>{STATUS_LABEL[status]}:</strong> {PHASE_SCRIPT[status] ?? PHASE_SCRIPT.normal}
          </div>
        </div>

        {lastInject && (
          <div className="glass-inset col" style={{ padding: '0.8rem 0.95rem', gap: 6 }} aria-label="Last injection summary">
            <div className="row between">
              <span className="eyebrow">Last injection</span>
              <span className="chip chip-green mono">{lastInject.status}</span>
            </div>
            <div className="mono" style={{ fontSize: '0.74rem', lineHeight: 1.6 }}>
              {lastInject.scenario} · {lastInject.mode} · {lastInject.duration_seconds}s
              <br />
              target {lastInject.target_machine ?? '—'}/{lastInject.target_tool ?? '—'} · defect {lastInject.defect_type ?? 'auto'}
            </div>
            {lastInject.burst_telemetry && Object.keys(lastInject.burst_telemetry).length > 0 && (
              <div className="row wrap mono" style={{ gap: 6, fontSize: '0.7rem' }}>
                {Object.entries(lastInject.burst_telemetry)
                  .filter(([k]) => !['scenario', 'machine_id', 'tool_id'].includes(k))
                  .map(([k, v]) => (
                    <span key={k} className="chip">
                      {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
        {lastReset && (
          <div className="glass-inset col" style={{ padding: '0.8rem 0.95rem', gap: 6 }} aria-label="Last reset summary">
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

        <div className="col" style={{ gap: 8 }}>
          <div className="eyebrow">Scenario</div>
          {SCENARIOS.map((s) => {
            const selected = scenario === s.id;
            return (
              <button
                key={s.id}
                id={`sim-scenario-${s.index}`}
                type="button"
                onClick={() => setScenario(s.id)}
                className={selected ? 'glass tone-accent' : 'glass-inset'}
                style={{
                  textAlign: 'left',
                  padding: '0.9rem 1rem',
                  borderRadius: 16,
                  border: '1px solid',
                  borderColor: selected ? 'rgba(91,91,240,0.35)' : 'rgba(255,255,255,0.85)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  boxShadow: selected ? '0 0 0 3px var(--accent-ring)' : undefined,
                  transition: 'all 0.25s var(--ease)',
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: selected ? 'var(--accent)' : 'rgba(255,255,255,0.9)',
                    color: selected ? '#fff' : 'var(--muted)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
                    {s.icon}
                  </span>
                </span>
                <span className="col" style={{ gap: 3, minWidth: 0 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 650 }}>
                      Scenario {s.index}: {s.title}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--accent)' }}>
                    {s.machine} · {s.tool} · {s.signal}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{s.detail}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="col" style={{ gap: 8 }}>
          <div className="eyebrow">Timing Envelope</div>
          <div className="seg" style={{ width: '100%' }}>
            <button
              id="sim-mode-demo"
              type="button"
              className={mode === 'demo' ? 'active' : ''}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setMode('demo')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                slideshow
              </span>
              Demo · 90s
            </button>
            <button
              id="sim-mode-fast"
              type="button"
              className={mode === 'fast' ? 'active' : ''}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setMode('fast')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                fast_forward
              </span>
              Fast · 8s
            </button>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            {mode === 'demo'
              ? 'Paced for narration — each Andon phase is visible on the wall display.'
              : 'Fast-forward for smoke testing the full pipeline.'}
          </span>
        </div>

        <div className="glass-inset col" style={{ padding: '0.8rem 0.95rem', gap: 6 }} aria-label="Backend services">
          <div className="eyebrow">Backend services</div>
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

        <div className="col" style={{ gap: 8, marginTop: 'auto' }}>
          <button
            id="sim-inject"
            type="button"
            className="btn btn-accent btn-block"
            style={{ padding: '0.8rem' }}
            disabled={busy !== null || running}
            onClick={inject}
          >
            <span className="material-symbols-outlined">bolt</span>
            {busy === 'inject' ? 'Injecting…' : running ? 'Scenario in progress' : 'Inject Defect'}
          </button>
          <button
            id="sim-reset"
            type="button"
            className="btn btn-block"
            style={{ padding: '0.7rem' }}
            disabled={busy !== null}
            onClick={reset}
          >
            <span className="material-symbols-outlined">restart_alt</span>
            {busy === 'reset' ? 'Resetting…' : 'Reset Blackboard'}
          </button>
          <span style={{ fontSize: '0.68rem', color: 'var(--faint)', textAlign: 'center' }}>
            Inputs route through the Orchestrator · reset clears the shared Blackboard
          </span>
        </div>
      </aside>
    </>
  );
}
