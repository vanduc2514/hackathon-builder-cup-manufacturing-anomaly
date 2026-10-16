// IncidentCommandView: incident page as collapsible investigation steps — done steps fold to one line, evidence on demand.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentFinding, IncidentState, MultiMachineTelemetryResponse } from '../../types';
import type { ToastTone } from '../../App';
import StepSection from '../incident/StepSection';
import StepRail from '../incident/StepRail';
import AgentAttribution from '../incident/AgentAttribution';
import SpcRunChart from '../incident/SpcRunChart';
import SensorHistoryChart from '../incident/SensorHistoryChart';
import DocumentsPanel from '../incident/DocumentsPanel';
import TelemetryAlertsPanel from '../incident/TelemetryAlertsPanel';
import LiveTelemetryStrip from '../incident/LiveTelemetryStrip';
import StatusReasonBanner from '../incident/StatusReasonBanner';
import StreakGate from '../incident/StreakGate';
import CausalTreeTabs from '../incident/CausalTreeTabs';
import EightDReportCard from '../incident/EightDReportCard';
import { buildCausalChain, buildSolution, rootCauseOf, type CausalChain } from '../../lib/eightD';
import { useApi } from '../../lib/api';
import { authFetch } from '../../lib/auth';
import { LINE_NAME } from '../../lib/fleet';
import {
  STATUS_LABEL,
  STEP_OF_STATUS,
  computeIncidentDuration,
  formatClock,
  formatPct,
  friendlyDefectName,
  matchesAgentRole,
  parseTimeSeconds,
  resolveDefectArchetype,
  stepState,
  titleCase,
} from '../../lib/incident';

interface IncidentCommandViewProps {
  incident: IncidentState;
  product: string;
  onNavigateHome: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

const STEP_LABELS = ['Inspection', 'Traceability', 'Analysis', 'Repair & Proof', 'Sign-off'];
const APPROVER = 'Shift Leader';

const ROUTE = [
  { id: 'RAW', tag: 'Raw stock', name: 'Billet lot' },
  { id: 'CNC-01', tag: 'CNC-01', name: 'Rough turn · Op-10' },
  { id: 'CNC-02', tag: 'CNC-02', name: 'Face mill · Op-20' },
  { id: 'CNC-03', tag: 'CNC-03', name: 'Drill & tap · Op-30' },
];

/** First "x.xx%" in the detection finding — the rate that opened the incident (the board only keeps the current rate). */
function detectedRate(finding?: AgentFinding): number | null {
  const m = finding?.finding.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : null;
}

export default function IncidentCommandView({ incident, product, onNavigateHome, onNotify }: IncidentCommandViewProps): React.ReactElement {
  const [releasing, setReleasing] = useState<boolean>(false);
  const [released, setReleased] = useState<boolean>(false);

  const id = incident.incident_id;
  const status = incident.status;
  const closed = status === 'closed';
  const approved = incident.approved || released;
  const machine = incident.suspect_machine;
  const tool = incident.suspect_tool;
  const rate = incident.defect_rate;
  const ucl = incident.spc_ucl;
  const count = incident.verification_count;
  const target = incident.verification_target;
  const proofDone = count >= target;
  const friendlyName = friendlyDefectName(incident.defect_type);
  const archetype = resolveDefectArchetype(incident.defect_type);

  const findings = incident.findings;
  const byAgent = (role: string): AgentFinding | undefined => findings.find((f) => matchesAgentRole(f, role));
  const latestBy = (role: string): AgentFinding | undefined => findings.slice().reverse().find((f) => matchesAgentRole(f, role));
  const qiFindings = findings.filter((f) => matchesAgentRole(f, 'quality_inspector'));
  const isVerification = (f: AgentFinding) => f.phase?.toLowerCase().includes('verification') || f.agent_name?.toLowerCase().includes('gatekeeper');
  const qiDetection = qiFindings.find((f) => !isVerification(f)) ?? qiFindings[0];
  const qiVerificationFindings = qiFindings.filter((f) => f !== qiDetection || isVerification(f));
  const reopeningFinding = qiVerificationFindings.find((vf) => /reopen|persist/i.test(vf.finding));
  const trace = byAgent('traceability');
  const process = byAgent('process_analyst');
  const rca = latestBy('root_cause');
  const copilot = latestBy('technician_copilot');
  const scribe = byAgent('incident_scribe');
  const learning = byAgent('continuous_learning');

  const chain: CausalChain = buildCausalChain(incident);
  const rawIshikawa = rca?.ishikawa ?? findings.slice().reverse().find((f) => f.ishikawa && Object.keys(f.ishikawa).length > 0)?.ishikawa ?? null;
  const ishikawa = rawIshikawa && Object.values(rawIshikawa).some((items) => items.length > 0) ? rawIshikawa : null;
  const impact = incident.impact ?? null;

  // Peak defect rate: the backend resets defect_rate after repair, so keep the highest value seen plus the detection figure.
  const peakSeen = useRef<number>(rate);
  peakSeen.current = Math.max(peakSeen.current, rate);
  const peak = Math.max(peakSeen.current, detectedRate(qiDetection) ?? 0);

  // Cause: agent 5-Whys / 8D root cause, else the root-cause finding — unless it only repeats the repair text, then sensor/trace evidence.
  const rcaIsRepairEcho = Boolean(rca && copilot && rca.finding === copilot.finding);
  const cause =
    rootCauseOf(incident) ??
    (chain.origin === 'agent' ? chain.nodes[chain.nodes.length - 1]?.answer ?? null : null) ??
    (rca && !rcaIsRepairEcho ? rca.finding : null) ??
    (incident.root_cause && incident.root_cause !== copilot?.finding ? incident.root_cause : null) ??
    process?.finding ??
    trace?.finding ??
    null;
  const fix = copilot?.finding ?? (incident.repair_done ? 'Repair recorded by technician.' : null);

  const { firstTime, lastTime } = useMemo(() => {
    let first: string | null = null;
    let last: string | null = null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of findings) {
      const s = parseTimeSeconds(f.timestamp);
      if (s === null) continue;
      if (s < lo) [lo, first] = [s, f.timestamp];
      if (s > hi) [hi, last] = [s, f.timestamp];
    }
    return { firstTime: first ?? incident.updated_at, lastTime: last ?? incident.updated_at };
  }, [findings, incident.updated_at]);
  const duration = computeIncidentDuration(firstTime, closed || approved ? lastTime : new Date().toTimeString().substring(0, 8));

  const tel = incident.latest_telemetry?.machine_id === machine ? incident.latest_telemetry : null;
  const alerts = incident.telemetry_alerts ?? [];
  const docs = incident.documents ?? {};
  const hasDocs = Boolean(docs.work_order || docs.sop_proposal);
  const solution = useMemo(() => ({ ...buildSolution(incident), approved }), [incident, approved]);

  const hasStepFindings = [
    qiFindings.length > 0,
    Boolean(trace || process),
    Boolean(rca || chain.nodes.length > 0 || ishikawa),
    Boolean(copilot || scribe || qiVerificationFindings.length > 0 || incident.repair_done || count > 0),
    Boolean(learning || impact || approved),
  ];
  const rail = STEP_LABELS.map((label, i) => ({
    id: `step-${i + 1}`,
    label,
    state: stepState(i + 1, { status, approved }, hasStepFindings[i]),
  }));
  const states = rail.map((r) => r.state);
  const currentNumber = approved ? 5 : STEP_OF_STATUS[status];

  // Only the step being worked on is open; finished steps fold to one line. Re-collapses as the incident moves on.
  const [open, setOpen] = useState<Set<number>>(() => new Set(approved ? [] : [currentNumber]));
  useEffect(() => {
    setOpen(new Set(approved ? [] : [currentNumber]));
  }, [currentNumber, approved]);

  const history = useApi<MultiMachineTelemetryResponse>(machine && open.has(2) ? '/api/telemetry/history' : null, closed || approved ? 0 : 15000);

  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const openStep = (n: number) => {
    setOpen((prev) => new Set(prev).add(n));
    window.setTimeout(() => document.getElementById(`step-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const reachable = states.map((s, i) => (s === 'pending' ? 0 : i + 1)).filter(Boolean);
  const allOpen = reachable.every((n) => open.has(n));

  const release = async () => {
    setReleasing(true);
    try {
      // Guard against stale tabs approving a different backend incident
      const currentRes = await authFetch('/api/incidents/current');
      if (currentRes.ok) {
        const currentData = (await currentRes.json()) as IncidentState;
        if (currentData.incident_id && currentData.incident_id !== id) {
          throw new Error(`Cannot approve stale incident #${id}; current active incident is #${currentData.incident_id}`);
        }
      }

      const res = await authFetch('/api/incidents/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: id }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { message?: string; state?: IncidentState };
      if (data.state && data.state.incident_id !== id) {
        throw new Error(`Server state mismatch: approved #${data.state.incident_id} instead of #${id}`);
      }
      setReleased(true);
      onNotify(data.message ?? `Incident #${id} approved — line released`);
    } catch (err) {
      onNotify(`Sign-off not recorded: ${err instanceof Error ? err.message : 'backend unreachable'}`, 'error');
    } finally {
      setReleasing(false);
    }
  };

  const canApprove = closed && proofDone && !approved;
  const lockReason = !closed
    ? `Locked until ${target}/${target} good parts close the incident`
    : !proofDone
      ? `Locked: streak ${count}/${target}`
      : '';
  const approveButton = approved ? (
    <span className="chip chip-green" style={{ padding: '6px 12px' }}>
      <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16 }}>
        task_alt
      </span>
      8D approved · line released
    </span>
  ) : (
    <button
      id="incident-approve-release"
      type="button"
      className={`btn ${canApprove ? 'btn-dark' : 'btn-locked'}`}
      disabled={!canApprove || releasing}
      aria-disabled={!canApprove}
      title={canApprove ? 'Approve the 8D report and release the line' : `${lockReason} (product-evidence rule)`}
      onClick={release}
    >
      <span className="material-symbols-outlined">{releasing ? 'autorenew' : canApprove ? 'verified' : 'lock'}</span>
      {releasing ? 'Releasing…' : canApprove ? 'Approve 8D & Release Line' : `Approve 8D · ${count}/${target}`}
    </button>
  );

  const pct = (v: number) => formatPct(v);

  return (
    <>
      <div className="page incident-page">
        <header className="col" style={{ gap: 6 }}>
          <nav aria-label="Breadcrumb" className="row" style={{ gap: 8, fontSize: '0.84rem', color: 'var(--text)' }}>
            <button type="button" className="crumb" onClick={onNavigateHome}>
              Line Overview
            </button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span className="mono chip chip-accent">#{id}</span>
          </nav>
          <h1 className="page-title" style={{ fontSize: '1.6rem' }}>
            {friendlyName}
            {machine ? ` on ${machine}` : ''}
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
            {product} · found at end-of-line inspection · opened {formatClock(firstTime).substring(0, 5)} ·{' '}
            {closed || approved ? `resolved in ${duration}` : `open for ${duration}`}
          </p>
        </header>

        <StatusReasonBanner incident={incident} />

        <div className="row between" style={{ marginTop: 4 }}>
          <h2 className="card-title">Investigation steps</h2>
          <button type="button" className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => setOpen(new Set(allOpen ? [] : reachable))}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {allOpen ? 'unfold_less' : 'unfold_more'}
            </span>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        <StepSection
          id="step-1"
          step={1}
          title="Inspection"
          state={states[0]}
          activeLabel="Classifying"
          pendingNote=""
          open={open.has(1)}
          onToggle={() => toggle(1)}
          summary={`${friendlyName} · peak ${pct(peak)} vs limit ${pct(ucl)}${qiDetection ? ` · ${(qiDetection.confidence * 100).toFixed(0)}% vision confidence` : ''}`}
        >
          <div className="step-grid">
            <div className="inset col" style={{ gap: 10 }}>
              <span className="eyebrow">Defect type</span>
              <div style={{ fontWeight: 650, fontSize: '1rem', lineHeight: 1.3 }}>{archetype}</div>
              <div className="step-stats">
                <div className="stat">
                  <span>Peak rate</span>
                  <b className="mono" style={{ color: peak >= ucl ? '#c9343a' : 'var(--ink)' }}>
                    {pct(peak)}
                  </b>
                </div>
                <div className="stat">
                  <span>Now</span>
                  <b className="mono" style={{ color: rate >= ucl ? '#c9343a' : '#0e8a43' }}>
                    {pct(rate)}
                  </b>
                </div>
                <div className="stat">
                  <span>Limit (UCL)</span>
                  <b className="mono">{pct(ucl)}</b>
                </div>
              </div>
            </div>
            <div className="inset col" style={{ gap: 6 }}>
              <div className="row between" style={{ gap: 12 }}>
                <span className="eyebrow">Defect rate · last 60 parts</span>
                <span className="mono" style={{ fontSize: '0.7rem', color: '#e5484d' }}>
                  — limit {pct(ucl)}
                </span>
              </div>
              <SpcRunChart machineId={incident.suspect_machine ?? null} />
            </div>
          </div>
          <div className="inset step-grid" style={{ alignItems: 'center' }}>
            <figure className="cam-frame">
              <img src="/incident/cam-eol-frame.jpg" alt={`End-of-line camera frame with the ${friendlyName.toLowerCase()} defect boxed`} />
              <span className="cam-box">
                <span className="mono">{friendlyName.toUpperCase()}</span>
              </span>
            </figure>
            <div className="col" style={{ gap: 6 }}>
              <span className="eyebrow">What the camera saw</span>
              {qiDetection ? (
                <>
                  <p style={{ fontWeight: 600, fontSize: '0.92rem', lineHeight: 1.45 }}>{qiDetection.finding}</p>
                  <p className="kpi-hint" style={{ lineHeight: 1.5 }}>
                    {qiDetection.evidence}
                  </p>
                </>
              ) : (
                <p className="placeholder">Classifying end-of-line frames…</p>
              )}
            </div>
          </div>
          <AgentAttribution findings={[qiDetection]} />
        </StepSection>

        <StepSection
          id="step-2"
          step={2}
          title="Traceability"
          state={states[1]}
          activeLabel="Tracing"
          pendingNote="Starts once the inspection opens the incident."
          open={open.has(2)}
          onToggle={() => toggle(2)}
          summary={machine ? `${machine}${tool ? ` · tool ${tool}` : ''} isolated${trace ? ` · ${(trace.confidence * 100).toFixed(0)}% match` : ''}` : 'Finding the source machine…'}
        >
          <div className="inset col" style={{ gap: 10 }}>
            <span className="eyebrow">Part route through the line</span>
            <div className="route">
              {ROUTE.map((n) => {
                const fault = n.id === machine;
                const cleared = n.id === 'RAW' || Boolean(trace);
                return (
                  <div key={n.id} className={`route-node ${fault ? 'route-fault' : ''}`}>
                    <span className="row" style={{ gap: 4, fontSize: '0.72rem', fontWeight: 650, color: fault ? '#c9343a' : cleared ? '#0e8a43' : 'var(--faint)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        {fault ? 'error' : cleared ? 'check_circle' : 'pending'}
                      </span>
                      {n.tag}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{n.name}</span>
                    {fault && tool && <span className="mono" style={{ fontSize: '0.7rem', color: '#c9343a' }}>Tool {tool}</span>}
                  </div>
                );
              })}
            </div>
            {trace && <p style={{ fontSize: '0.86rem', color: 'var(--ink-2)' }}>{trace.finding}</p>}
          </div>

          {machine && (
            <div className="inset col" style={{ gap: 8 }}>
              <span className="eyebrow">{machine} sensors</span>
              {process ? (
                <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{process.finding}</p>
              ) : (
                <p className="placeholder">Comparing sensor data with the defect start…</p>
              )}
              <details className="evidence">
                <summary>
                  Sensor history chart
                  <span className="material-symbols-outlined agent-trail-chevron" style={{ fontSize: 16 }}>
                    expand_more
                  </span>
                </summary>
                <div className="col" style={{ gap: 8, marginTop: 8 }}>
                  <SensorHistoryChart machine={machine} data={history.data} loading={history.loading} error={history.error} />
                  {tel && <LiveTelemetryStrip telemetry={tel} />}
                  {process && <p className="kpi-hint">{process.evidence}</p>}
                </div>
              </details>
            </div>
          )}
          {alerts.length > 0 && (
            <div className="inset col" style={{ gap: 10 }}>
              <TelemetryAlertsPanel alerts={alerts} machine={machine} />
            </div>
          )}
          <AgentAttribution findings={[trace, process]} />
        </StepSection>

        <StepSection
          id="step-3"
          step={3}
          title="Analysis"
          state={states[2]}
          activeLabel={status === 'escalated' || status === 'awaiting_evidence' ? STATUS_LABEL[status] : 'Analysing'}
          alert={status === 'escalated'}
          pendingNote="Starts after the source machine is found."
          open={open.has(3)}
          onToggle={() => toggle(3)}
          summary={cause ?? 'Working out why…'}
          trailing={rca && <span className="chip mono">{(rca.confidence * 100).toFixed(0)}% confident</span>}
        >
          <div className="inset row" style={{ gap: 12, alignItems: 'flex-start', background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 22 }}>
              target
            </span>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Cause
              </span>
              <span style={{ fontWeight: 650, fontSize: '0.95rem', lineHeight: 1.45 }}>{cause ?? 'Not determined yet'}</span>
            </div>
          </div>

          <CausalTreeTabs
            key={chain.nodes.length}
            chain={chain}
            ishikawa={ishikawa}
            evidence={[process, rca].filter((f): f is AgentFinding => Boolean(f && f.evidence))}
            rcaFinding={rca?.finding}
          />
          <AgentAttribution findings={[rca]} />
        </StepSection>

        <StepSection
          id="step-4"
          step={4}
          title="Repair & Proof"
          state={states[3]}
          activeLabel={status === 'repairing' ? 'Repairing' : status === 'verifying' ? `Checking parts ${count}/${target}` : 'Reviewing'}
          alert={Boolean(reopeningFinding)}
          pendingNote="Starts once the cause is confirmed."
          open={open.has(4)}
          onToggle={() => toggle(4)}
          summary={reopeningFinding ? 'Defects came back — investigation reopened' : `${fix ? 'Repair done' : 'Repair pending'} · ${count}/${target} good parts`}
          trailing={reopeningFinding ? <span className="chip chip-red">Reopened</span> : undefined}
        >
          <div className="step-grid">
            <div className="inset col" style={{ gap: 8 }}>
              <div className="row between">
                <span className="eyebrow">Repair</span>
                <span className={`chip ${incident.repair_done || closed ? 'chip-green' : 'chip-amber'}`}>{incident.repair_done || closed ? 'Done' : 'In progress'}</span>
              </div>
              {copilot ? (
                <>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.45 }}>{copilot.finding}</p>
                  <p className="kpi-hint">{copilot.evidence}</p>
                </>
              ) : (
                <p className="placeholder">Waiting for the technician to log the repair.</p>
              )}
            </div>
            <StreakGate count={count} target={target} status={status} />
          </div>
          <details className="inset evidence">
            <summary>
              Documents (work order, SOP proposal){hasDocs || scribe ? '' : ' · drafting'}
              <span className="material-symbols-outlined agent-trail-chevron" style={{ fontSize: 16 }}>
                expand_more
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              <DocumentsPanel incident={incident} ready={hasDocs || Boolean(scribe)} />
            </div>
          </details>
          <AgentAttribution findings={[copilot, scribe, ...qiVerificationFindings]} />
        </StepSection>

        <StepSection
          id="step-5"
          step={5}
          title="Sign-off"
          state={states[4]}
          activeLabel="Waiting for you"
          pendingNote={`Approval stays locked until ${target}/${target} good parts in a row close the incident. Approver: ${APPROVER}`}
          open={open.has(5)}
          onToggle={() => toggle(5)}
          summary={approved ? `8D signed off by ${APPROVER}` : `Review the 8D report · approver: ${APPROVER}`}
          pinnedTrailing={approveButton}
        >
          <EightDReportCard key={id} solution={solution} defaultOpen={!approved} />
          <div className="step-grid">
            <div className="inset col" style={{ gap: 6 }}>
              <span className="eyebrow">Lesson learned</span>
              {learning ? (
                <>
                  <p style={{ fontWeight: 600, fontSize: '0.88rem', lineHeight: 1.45 }}>{learning.finding}</p>
                  <p className="kpi-hint">{learning.evidence}</p>
                </>
              ) : (
                <p className="placeholder">Captured when the incident closes.</p>
              )}
            </div>
            <div className="inset col" style={{ gap: 8 }}>
              <span className="eyebrow">Impact (backend impact model)</span>
              {impact ? (
                <div className="step-stats">
                  <div className="stat">
                    <span>Cost avoided</span>
                    <b className="mono">${(impact.cost_savings_usd ?? 0).toLocaleString('en-US')}</b>
                  </div>
                  <div className="stat">
                    <span>Scrap avoided</span>
                    <b className="mono">{impact.scrap_avoided} pcs</b>
                  </div>
                  <div className="stat">
                    <span>CO₂e avoided</span>
                    <b className="mono" style={{ color: '#0e8a43' }}>
                      {impact.co2_kg} kg
                    </b>
                  </div>
                  <div className="stat">
                    <span>Downtime</span>
                    <b className="mono">{impact.downtime_minutes} min</b>
                  </div>
                </div>
              ) : (
                <p className="placeholder">Calculated when the incident closes.</p>
              )}
              {impact?.factory_type && <span className="kpi-hint">Profile: {titleCase(impact.factory_type)}</span>}
            </div>
          </div>
          <div className="inset">
            <span className="col" style={{ fontSize: '0.86rem', color: 'var(--text)', gap: 2 }}>
              <span>
                Approving the 8D returns {LINE_NAME}
                {machine ? ` and ${machine}` : ''} to full production and archives this incident.
              </span>
              <span className="kpi-hint">
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'text-bottom' }}>
                  lock
                </span>{' '}
                Product-evidence rule: approval is only possible after the incident closes on {target}/{target} consecutive good parts.
              </span>
            </span>
          </div>
          <AgentAttribution findings={[learning]} />
        </StepSection>
      </div>
      <StepRail steps={rail} onSelect={(sid) => openStep(Number(sid.replace('step-', '')))} />
    </>
  );
}
