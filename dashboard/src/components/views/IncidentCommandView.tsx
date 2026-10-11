// IncidentCommandView: product-first, state-aware five-step incident dossier with a sticky status/action bar.
import React, { useMemo, useState } from 'react';
import type { AgentFinding, IncidentState, MultiMachineTelemetryResponse } from '../../types';
import type { ToastTone } from '../../App';
import StepSection from '../incident/StepSection';
import StepRail from '../incident/StepRail';
import IncidentStatusBar from '../incident/IncidentStatusBar';
import AgentAttribution from '../incident/AgentAttribution';
import SpcRunChart from '../incident/SpcRunChart';
import SensorHistoryChart from '../incident/SensorHistoryChart';
import DocumentsPanel from '../incident/DocumentsPanel';
import TelemetryAlertsPanel from '../incident/TelemetryAlertsPanel';
import LiveTelemetryStrip from '../incident/LiveTelemetryStrip';
import StatusReasonBanner from '../incident/StatusReasonBanner';
import GeminiLiveCard from '../incident/GeminiLiveCard';
import { useApi } from '../../lib/api';
import {
  DEMO_INCIDENT,
  FALLBACK_FIVE_WHYS,
  FALLBACK_ISHIKAWA,
  STATUS_LABEL,
  STEP_OF_STATUS,
  computeIncidentDuration,
  formatClock,
  formatIncidentDate,
  friendlyDefectName,
  isIshikawaCategoryCausal,
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

const NOMINAL_RATE = 0.0044;
const STEP_LABELS = ['Inspection', 'Traceability', 'Analysis', 'Work Order', 'Release'];

const ROUTE = [
  { id: 'RAW', tag: 'Raw Stock', name: 'Incoming Billet Lot' },
  { id: 'CNC-01', tag: 'Station CNC-01', name: 'Roughing Spindle · Op-10' },
  { id: 'CNC-02', tag: 'Station CNC-02', name: 'Finish Spindle · Op-20' },
  { id: 'CNC-03', tag: 'Station CNC-03', name: 'Bore Finishing · Op-30' },
];

const INSET: React.CSSProperties = {
  background: 'rgba(240, 242, 255, 0.72)',
  border: '1px solid rgba(255, 255, 255, 0.9)',
  borderRadius: 18,
  padding: '1.2rem 1.3rem',
};

const WHITE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.92)',
  border: '1px solid var(--hair)',
  borderRadius: 14,
  padding: '0.9rem 1rem',
};

const EYEBROW: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--text)', letterSpacing: '0.06em' };

const PLACEHOLDER: React.CSSProperties = { fontSize: '0.86rem', color: 'var(--muted)', fontStyle: 'italic' };

export default function IncidentCommandView({
  incident,
  product,
  onNavigateHome,
  onNotify,
}: IncidentCommandViewProps): React.ReactElement {
  const [releasing, setReleasing] = useState<boolean>(false);
  const [released, setReleased] = useState<boolean>(false);

  const id = incident.incident_id;
  const status = incident.status;
  const closed = status === 'closed';
  const approved = incident.approved || released;
  const isDemo = id === DEMO_INCIDENT.incident_id;
  const machine = incident.suspect_machine;
  const tool = incident.suspect_tool;
  const rate = incident.defect_rate;
  const ucl = incident.spc_ucl;
  const count = incident.verification_count;
  const target = incident.verification_target;
  const proofDone = count >= target;
  const defect = incident.defect_type ?? 'surface defect';
  const friendlyName = friendlyDefectName(incident.defect_type);
  const archetype = resolveDefectArchetype(incident.defect_type);

  const findings = incident.findings;
  const byAgent = (role: string): AgentFinding | undefined =>
    findings.find((f) => matchesAgentRole(f, role));
  const qiFindings = findings.filter((f) => matchesAgentRole(f, 'quality_inspector'));
  const qiDetection =
    qiFindings.find(
      (f) =>
        !f.phase?.toLowerCase().includes('verification') &&
        !f.agent_name?.toLowerCase().includes('gatekeeper')
    ) ?? qiFindings[0];
  const qiVerificationFindings = qiFindings.filter(
    (f) =>
      f !== qiDetection ||
      f.phase?.toLowerCase().includes('verification') ||
      f.agent_name?.toLowerCase().includes('gatekeeper')
  );
  const reopeningFinding = qiVerificationFindings.find((vf) => {
    const fLower = vf.finding.toLowerCase();
    return fLower.includes('reopen') || fLower.includes('persist');
  });
  const trace = byAgent('traceability');
  const process = byAgent('process_analyst');
  const rca = findings.slice().reverse().find((f) => matchesAgentRole(f, 'root_cause')) ?? byAgent('root_cause');
  const copilot = findings.slice().reverse().find((f) => matchesAgentRole(f, 'technician_copilot')) ?? byAgent('technician_copilot');
  const scribe = byAgent('incident_scribe');
  const learning = byAgent('continuous_learning');

  const whys =
    findings.slice().reverse().find((f) => f.five_whys && f.five_whys.length > 0)?.five_whys ??
    rca?.five_whys ??
    (isDemo ? FALLBACK_FIVE_WHYS : []);
  const ishikawa =
    rca?.ishikawa ??
    findings.slice().reverse().find((f) => f.ishikawa && Object.keys(f.ishikawa).length > 0)?.ishikawa ??
    (isDemo ? FALLBACK_ISHIKAWA : null);
  const impact = incident.impact ?? (isDemo ? DEMO_INCIDENT.impact : null);
  const earliestFindingTime = useMemo(() => {
    if (!findings.length) return incident.updated_at;
    let minTime = findings[0].timestamp;
    let minSec = parseTimeSeconds(minTime) ?? Infinity;
    for (const f of findings) {
      const s = parseTimeSeconds(f.timestamp);
      if (s !== null && s < minSec) {
        minSec = s;
        minTime = f.timestamp;
      }
    }
    return minTime;
  }, [findings, incident.updated_at]);

  const duration = computeIncidentDuration(earliestFindingTime, incident.updated_at);
  const tel = incident.latest_telemetry?.machine_id === machine ? incident.latest_telemetry : null;
  const alerts = incident.telemetry_alerts ?? [];
  const history = useApi<MultiMachineTelemetryResponse>(
    machine && !isDemo ? '/api/telemetry/history' : null,
    closed || approved ? 0 : 5000,
  );
  const docs = incident.documents ?? {};
  const hasDocs = Boolean(docs.work_order || docs.report_8d || docs.sop_proposal);

  const hasStepFindings = useMemo(
    () => [
      qiFindings.length > 0,
      Boolean(trace || process),
      Boolean(rca || (whys && whys.length > 0) || ishikawa),
      Boolean(copilot || scribe || qiVerificationFindings.length > 0 || incident.repair_done || count > 0),
      Boolean(learning || impact || approved),
    ],
    [
      qiFindings.length,
      trace,
      process,
      rca,
      whys,
      ishikawa,
      copilot,
      scribe,
      qiVerificationFindings.length,
      incident.repair_done,
      count,
      learning,
      impact,
      approved,
    ],
  );

  const rail = useMemo(
    () =>
      STEP_LABELS.map((label, i) => ({
        id: `step-${i + 1}`,
        label,
        state: stepState(i + 1, { status, approved }, hasStepFindings[i]),
      })),
    [status, approved, hasStepFindings],
  );
  const states = rail.map((r) => r.state);
  const currentNumber = approved ? 5 : STEP_OF_STATUS[status];

  const jumpToStep = (n: number) => document.getElementById(`step-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const release = async () => {
    setReleasing(true);
    try {
      if (isDemo) {
        throw new Error('Archived reference incident cannot release live factory lines.');
      }
      // Guard against stale tabs approving a different backend incident
      const currentRes = await fetch('/api/incidents/current');
      if (currentRes.ok) {
        const currentData = (await currentRes.json()) as IncidentState;
        if (currentData.incident_id && currentData.incident_id !== id) {
          throw new Error(`Cannot approve stale incident #${id}; current active incident is #${currentData.incident_id}`);
        }
      }

      const res = await fetch('/api/incidents/approve', {
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
      onNotify(data.message ?? `Incident #${id} approved — Line-01 released`);
    } catch (err) {
      onNotify(`Sign-off not recorded: ${err instanceof Error ? err.message : 'backend unreachable'}`, 'error');
    } finally {
      setReleasing(false);
    }
  };

  const releaseControl = approved ? (
    <span className="chip chip-green" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>
      <span className="material-symbols-outlined icon-fill" style={{ fontSize: 17 }}>
        task_alt
      </span>
      Line-01 released · #{id} archived
    </span>
  ) : (
    <button
      id="incident-approve-release"
      type="button"
      className="btn btn-dark"
      style={{ padding: '0.85rem 1.4rem', borderRadius: 14, fontSize: '0.88rem' }}
      disabled={!closed || releasing}
      onClick={release}
    >
      <span className="material-symbols-outlined">{releasing ? 'autorenew' : 'check_circle'}</span>
      {releasing ? 'Releasing…' : 'Approve & Release Line'}
    </button>
  );

  return (
    <>
      <div className="page" style={{ gap: '1.5rem', paddingRight: 48 }}>
        <header className="col" style={{ gap: 8 }}>
          <nav aria-label="Breadcrumb" className="row" style={{ gap: 10, fontSize: '0.88rem', color: 'var(--text)' }}>
            <button type="button" className="crumb" onClick={onNavigateHome}>
              Products
            </button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <button type="button" className="crumb" onClick={onNavigateHome}>
              {product}
            </button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span className="mono chip chip-accent" style={{ borderRadius: 6, fontWeight: 700 }}>
              #{id}
            </span>
          </nav>
          <h1 className="page-title" style={{ fontSize: '2.1rem' }}>
            {product}: {friendlyName} Defect Spike
          </h1>
          <p style={{ fontSize: '0.95rem', color: 'var(--text)' }}>
            Detected on finished parts at Line-01 end-of-line inspection ·{' '}
            {machine ? (
              <>
                traced to <strong style={{ color: 'var(--ink)' }}>{machine}</strong>
                {tool ? ` (Tool ${tool})` : ''}
              </>
            ) : (
              'source trace in progress'
            )}
          </p>
          <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
            <span className="chip" style={{ padding: '5px 12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                history
              </span>
              {closed || approved ? 'Resolved' : 'Updated'} {formatIncidentDate(incident.updated_at)} · {formatClock(incident.updated_at)} UTC · {closed || approved ? 'Duration' : 'Elapsed'} {duration}
            </span>
            {isDemo && (
              <span className="chip" style={{ padding: '5px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  inventory_2
                </span>
                Archived reference incident
              </span>
            )}
          </div>
        </header>

        <IncidentStatusBar
          incident={incident}
          product={product}
          approved={approved}
          currentStep={{ number: currentNumber, label: STEP_LABELS[currentNumber - 1] }}
          releasing={releasing}
          onRelease={release}
          onJumpToStep={jumpToStep}
        />

        <StatusReasonBanner incident={incident} />

        {reopeningFinding && (
          <div
            id="incident-reopening-banner"
            className="row between wrap"
            style={{
              padding: '0.9rem 1.25rem',
              borderRadius: 14,
              background: 'rgba(254, 242, 242, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#991b1b',
              gap: 12,
              animation: 'toastIn 0.3s var(--ease) both',
            }}
          >
            <div className="row" style={{ gap: 10, minWidth: 0, flex: '1 1 400px' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24, color: '#dc2626' }}>
                restart_alt
              </span>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  Post-Repair Verification Failed · Investigation Reopened
                </span>
                <span style={{ fontSize: '0.84rem', color: '#7f1d1d' }}>
                  {reopeningFinding.finding} — {reopeningFinding.evidence}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#fff', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#991b1b', fontWeight: 650, flexShrink: 0 }}
              onClick={() => jumpToStep(4)}
            >
              View Verification Gate
            </button>
          </div>
        )}

        <StepSection
          id="step-1"
          step={1}
          title="END-OF-LINE INSPECTION"
          subtitle="End Product Only (Keyence CV-X480 CAM-EOL)"
          state={states[0]}
          activeLabel="Classifying"
          pendingNote=""
        >
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className="col" style={{ ...INSET, gap: 12 }}>
              <span className="eyebrow" style={EYEBROW}>
                Classified Defect Archetype
              </span>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                {archetype}
              </div>
              <code className="mono" style={{ background: 'rgba(229,72,77,0.1)', color: '#9f1d22', fontWeight: 700, fontSize: '0.84rem', padding: '0.5rem 0.7rem', borderRadius: 6 }}>
                defect_type: "{defect}"
              </code>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={WHITE}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text)' }}>Defect Rate</div>
                  <div className="mono" style={{ fontSize: '2.2rem', fontWeight: 700, color: rate >= ucl ? '#c9343a' : 'var(--ink)', lineHeight: 1.2 }}>
                    {(rate * 100).toFixed(2)}%
                  </div>
                  <div className="row" style={{ gap: 4, fontSize: '0.8rem', color: rate >= ucl ? '#c9343a' : 'var(--text)', fontWeight: 600 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                      {rate >= NOMINAL_RATE ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                    {rate >= NOMINAL_RATE ? '+' : ''}
                    {((rate - NOMINAL_RATE) * 100).toFixed(2)}% vs nominal
                  </div>
                </div>
                <div style={WHITE}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text)' }}>Upper Control Limit</div>
                  <div className="mono" style={{ fontSize: '2.2rem', fontWeight: 700, lineHeight: 1.2 }}>
                    {(ucl * 100).toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text)' }}>Nominal: {(NOMINAL_RATE * 100).toFixed(2)}%</div>
                </div>
              </div>
            </div>

            <div className="col" style={{ ...INSET, gap: 8 }}>
              <div className="row between" style={{ gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 650, fontSize: '0.95rem' }}>SPC Run Chart · last 60 parts</span>
                <div className="row mono" style={{ gap: 14, fontSize: '0.72rem', color: 'var(--text)', flexShrink: 0 }}>
                  <span className="row" style={{ gap: 5 }}>
                    <span style={{ width: 10, height: 2, background: '#e5484d' }} />
                    UCL {(ucl * 100).toFixed(1)}%
                  </span>
                  <span className="row" style={{ gap: 5 }}>
                    <span style={{ width: 10, height: 2, background: '#475569' }} />
                    Defect rate
                  </span>
                </div>
              </div>
              <SpcRunChart peak={rate} ucl={ucl} mean={NOMINAL_RATE} />
              <div className="row between mono" style={{ fontSize: '0.74rem', color: 'var(--text)' }}>
                <span>−60 parts</span>
                <span>{formatClock(incident.updated_at).substring(0, 5)} UTC</span>
              </div>
            </div>
          </div>

          <div className="grid" style={{ ...INSET, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'center' }}>
            <figure style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', aspectRatio: '512 / 279', background: '#0b1220' }}>
              <img src="/incident/cam-eol-frame.jpg" alt={`End-of-line camera frame with the ${friendlyName.toLowerCase()} defect boxed`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span className="mono" style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(11,18,32,0.85)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>
                CAM-LINE01-EOL
              </span>
              {qiDetection && (
                <span className="mono" style={{ position: 'absolute', top: 10, right: 10, background: '#12a150', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>
                  {(qiDetection.confidence * 100).toFixed(1)}% AI CONF
                </span>
              )}
              <span style={{ position: 'absolute', left: '30%', top: '26%', width: '30%', height: '46%', border: '2px solid #e5484d', background: 'rgba(229,72,77,0.12)' }}>
                <span className="mono" style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', background: '#e5484d', color: '#fff', fontSize: '0.64rem', fontWeight: 700, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                  DEFECT: {friendlyName.toUpperCase()}
                </span>
              </span>
            </figure>
            <div className="col" style={{ gap: 10 }}>
              <span className="eyebrow" style={EYEBROW}>
                Vision finding
              </span>
              {qiDetection ? (
                <>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.45, letterSpacing: '-0.01em' }}>{qiDetection.finding}</p>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.55 }}>{qiDetection.evidence}</p>
                </>
              ) : (
                <p style={PLACEHOLDER}>Quality Inspector is classifying end-of-line frames…</p>
              )}
              {qiVerificationFindings.length > 0 && (
                <div className="col" style={{ gap: 6, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>
                  <span className="eyebrow" style={{ ...EYEBROW, color: 'var(--accent)' }}>Post-Repair Re-inspection</span>
                  {qiVerificationFindings.map((vf, idx) => {
                    const isReopen = vf.finding.toLowerCase().includes('reopen') || vf.finding.toLowerCase().includes('persist');
                    return (
                      <div key={`s1-${vf.agent_id}-${vf.timestamp}-${idx}`} className="row between wrap" style={{ fontSize: '0.82rem', gap: 6 }}>
                        <span style={{ fontWeight: 600, color: isReopen ? '#c9343a' : '#0e8a43' }}>
                          {vf.finding}
                        </span>
                        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                          {formatClock(vf.timestamp)} UTC
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <AgentAttribution findings={[qiDetection, ...qiVerificationFindings]} />
        </StepSection>

        <StepSection
          id="step-2"
          step={2}
          title="TRACEABILITY"
          subtitle="Genealogy Correlation & Sensor Telemetry"
          state={states[1]}
          activeLabel="Tracing"
          pendingNote="Unlocks once the Quality Inspector opens the incident."
          trailing={trace && <span className="chip chip-accent mono">{(trace.confidence * 100).toFixed(1)}% isolation</span>}
        >
          <div className="col" style={{ ...INSET, gap: 12 }}>
            <span className="eyebrow" style={EYEBROW}>
              Upstream Line Genealogy Route
            </span>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {ROUTE.map((n) => {
                const fault = n.id === machine;
                const cleared = n.id === 'RAW' || Boolean(trace);
                const label = n.id === 'RAW' ? 'Material verified' : fault ? `FAULT ISOLATED${tool ? ` · ${tool}` : ''}` : trace ? 'Cleared' : 'Checking…';
                return (
                  <div key={n.id} style={{ ...WHITE, background: fault ? 'rgba(255,241,242,0.95)' : WHITE.background, borderColor: fault ? 'rgba(229,72,77,0.35)' : 'var(--hair)' }}>
                    <div style={{ fontSize: '0.76rem', color: fault ? '#c9343a' : 'var(--muted)' }}>{n.tag}</div>
                    <div style={{ fontWeight: 650, fontSize: '0.92rem', margin: '2px 0 4px' }}>{n.name}</div>
                    <div className="row mono" style={{ gap: 4, fontSize: '0.72rem', fontWeight: fault ? 700 : 500, color: fault ? '#c9343a' : cleared ? '#0e8a43' : 'var(--faint)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        {fault ? 'error' : cleared ? 'check_circle' : 'pending'}
                      </span>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
            {trace && <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', lineHeight: 1.55 }}>{trace.finding}</p>}
          </div>

          {machine && (
            <div className="col" style={{ ...INSET, gap: 10 }}>
              <div style={{ fontWeight: 650, fontSize: '0.95rem' }}>{machine} Synchronized Sensor History</div>
              <div className="row wrap mono" style={{ gap: 18, fontSize: '0.76rem', fontWeight: 600 }}>
                {[
                  { c: '#c9343a', t: 'Vibration Axis-Z', v: tel ? `${tel.spindle_vibration.toFixed(2)} mm/s` : null },
                  { c: 'var(--accent)', t: 'Current Draw', v: tel ? `${tel.motor_current.toFixed(1)} A` : null },
                  { c: '#64748b', t: 'Bearing Temp', v: tel ? `${tel.spindle_temp.toFixed(1)}°C` : null },
                ].map((l) => (
                  <span key={l.t} className="row" style={{ gap: 6, color: l.c }}>
                    <span style={{ width: 14, height: 3, borderRadius: 2, background: l.c }} />
                    {l.t}
                    {l.v ? ` (${l.v})` : ''}
                  </span>
                ))}
              </div>
              <SensorHistoryChart machine={machine} data={history.data} loading={history.loading} error={history.error} />
              {incident.latest_telemetry && <LiveTelemetryStrip telemetry={incident.latest_telemetry} />}
              <div className="row" style={{ ...WHITE, gap: 12, alignItems: 'flex-start', background: 'rgba(240,242,255,0.9)' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', padding: 6, borderRadius: 8 }}>
                  analytics
                </span>
                {process ? (
                  <div>
                    <div style={{ fontWeight: 650, fontSize: '0.9rem' }}>{process.finding}</div>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.55 }}>{process.evidence}</p>
                  </div>
                ) : (
                  <p style={PLACEHOLDER}>Process Analyst is correlating telemetry with the defect onset…</p>
                )}
              </div>
            </div>
          )}
          <div className="col" style={{ ...INSET, gap: 10 }}>
            <TelemetryAlertsPanel alerts={alerts} machine={machine} />
          </div>
          <AgentAttribution findings={[trace, process]} />
        </StepSection>

        <StepSection
          id="step-3"
          step={3}
          title="ANALYSIS"
          subtitle="5-Whys, 6M Ishikawa & Field Evidence"
          state={states[2]}
          activeLabel={status === 'escalated' || status === 'awaiting_evidence' ? STATUS_LABEL[status] : 'Analyzing'}
          pendingNote="Unlocks after traceability isolates a suspect station."
          trailing={rca && <span className="chip chip-green mono">{(rca.confidence * 100).toFixed(1)}% root-cause confidence</span>}
        >
          {incident.root_cause && (
            <div className="row" style={{ ...INSET, gap: 14, alignItems: 'flex-start', background: 'var(--ink)', color: '#fff', border: '1px solid var(--ink)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 24 }}>
                target
              </span>
              <div className="col" style={{ gap: 2 }}>
                <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.65)' }}>Confirmed root cause</span>
                <span style={{ fontWeight: 650, fontSize: '1rem', lineHeight: 1.45 }}>{incident.root_cause}</span>
              </div>
            </div>
          )}
          {whys.length > 0 ? (
            <ol className="col" style={{ gap: 8, listStyle: 'none' }}>
              {whys.map((w, i) => {
                const root = i === whys.length - 1;
                return (
                  <li
                    key={w.level}
                    className="row between wrap"
                    style={{
                      ...INSET,
                      padding: root ? '1.1rem 1.2rem' : '0.75rem 1.1rem',
                      gap: 12,
                      background: root ? 'var(--ink)' : INSET.background,
                      color: root ? '#fff' : 'var(--ink)',
                      border: root ? '1px solid var(--ink)' : INSET.border,
                      boxShadow: root ? '0 14px 30px -14px rgba(11,18,32,0.55)' : 'none',
                    }}
                  >
                    <div className="row" style={{ gap: 14, minWidth: 0, flex: '1 1 380px' }}>
                      <span
                        className="mono"
                        style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: '0.78rem', fontWeight: 700, background: root ? '#fff' : 'rgba(91,91,240,0.12)', color: root ? 'var(--ink)' : 'var(--accent)' }}
                      >
                        {w.level}
                      </span>
                      <div className="col" style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: root ? 'rgba(255,255,255,0.65)' : 'var(--muted)' }}>
                          {root ? `Root cause · ${w.why}` : w.why}
                        </span>
                        <span style={{ fontWeight: root ? 700 : 600, fontSize: root ? '1rem' : '0.9rem' }}>{w.answer}</span>
                      </div>
                    </div>
                    {(w.evidence || w.citation) && (
                      <div className="row wrap mono" style={{ gap: 6, fontSize: '0.72rem' }}>
                        {w.evidence && (
                          <span style={{ padding: '3px 8px', borderRadius: 6, background: root ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.85)', color: root ? 'var(--ink)' : 'var(--text)', fontWeight: root ? 700 : 500 }}>
                            Ev: {w.evidence}
                          </span>
                        )}
                        {w.citation && (
                          <span style={{ padding: '3px 8px', borderRadius: 6, background: root ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.85)', color: root ? 'var(--ink)' : 'var(--text)', fontWeight: root ? 700 : 500 }}>
                            Ref: {w.citation}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p style={PLACEHOLDER}>Root Cause agent is building the causal chain…</p>
          )}

          {ishikawa && (
            <div className="col" style={{ ...INSET, gap: 12 }}>
              <div className="row between">
                <span style={{ fontWeight: 650, fontSize: '0.95rem' }}>Ishikawa 6M Factors</span>
                <span className="row mono" style={{ gap: 12, fontSize: '0.72rem', color: 'var(--text)' }}>
                  <span className="row" style={{ gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: '#c9343a' }} /> causal
                  </span>
                  <span className="row" style={{ gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: '#12a150' }} /> cleared
                  </span>
                </span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {Object.entries(ishikawa).map(([cat, items], i) => {
                  const isCausal = isIshikawaCategoryCausal(cat, items, rca?.finding);
                  return (
                    <div key={cat} style={{ ...WHITE, borderColor: isCausal ? 'rgba(229,72,77,0.3)' : 'var(--hair)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isCausal ? '#c9343a' : '#0e8a43', marginBottom: 4 }}>
                        {i + 1}. {cat}
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>{items.join('; ') || '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rca && (
            <div className="row" style={{ ...INSET, gap: 14, alignItems: 'flex-start', background: 'rgba(229,231,255,0.8)' }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', background: 'var(--accent)', padding: 8, borderRadius: 10 }}>
                troubleshoot
              </span>
              <div className="col" style={{ gap: 4 }}>
                <span style={{ fontWeight: 650 }}>Grounding &amp; field evidence</span>
                <p style={{ fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.55 }}>{rca.evidence}</p>
              </div>
            </div>
          )}
          <AgentAttribution findings={[rca]} />
        </StepSection>

        <StepSection
          id="step-4"
          step={4}
          title="WORK ORDER"
          subtitle={
            reopeningFinding
              ? 'Defects Persisted · Investigation Reopened'
              : proofDone
              ? 'Physical Recovery Verified'
              : 'Physical Rectification & Product Proof'
          }
          tone="accent"
          state={states[3]}
          activeLabel={status === 'repairing' ? 'Repairing' : status === 'verifying' ? 'Verifying parts' : 'Reviewing'}
          pendingNote="Unlocks once the root cause is grounded."
          trailing={
            reopeningFinding ? (
              <span className="chip chip-red mono" style={{ fontWeight: 700 }}>
                REOPENED
              </span>
            ) : proofDone ? (
              <span className="chip chip-green mono" style={{ fontWeight: 700 }}>
                VERIFIED
              </span>
            ) : undefined
          }
        >
          <div className="col" style={{ ...INSET, gap: 14, background: proofDone ? 'rgba(236,253,243,0.8)' : INSET.background }}>
            <div className="row between wrap" style={{ gap: 10 }}>
              <div>
                <div style={{ fontWeight: 650, fontSize: '1rem' }}>Post-Repair Verification · CAM-LINE01-EOL</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>The incident closes only after {target} consecutive defect-free end products.</div>
              </div>
              <span className="mono" style={{ fontSize: '1.6rem', fontWeight: 700, color: proofDone ? '#0e8a43' : 'var(--accent)' }}>
                {count} / {target}
                <span style={{ fontSize: '0.8rem', marginLeft: 8 }}>{proofDone ? 'PASSED' : 'VERIFIED'}</span>
              </span>
            </div>
            <div role="img" aria-label={`${count} of ${target} parts verified defect-free`} className="grid" style={{ gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {Array.from({ length: target }, (_, i) => (
                <span key={i} style={{ height: 16, borderRadius: 4, background: i < count ? '#22b573' : 'rgba(118,128,160,0.16)', transition: 'background 0.4s var(--ease)' }} />
              ))}
            </div>
            <div className="row between wrap mono" style={{ fontSize: '0.74rem', color: 'var(--text)', gap: 8 }}>
              <span style={{ color: proofDone ? '#0e8a43' : 'var(--muted)', fontWeight: 700 }}>
                {proofDone ? 'Criteria satisfied: zero-defect run' : `${target - count} parts to go`}
              </span>
              <span>Updated {formatClock(incident.updated_at)} UTC</span>
            </div>

            {qiVerificationFindings.length > 0 && (
              <div className="col" style={{ gap: 8, marginTop: 4, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
                <span className="eyebrow" style={EYEBROW}>Gatekeeper Verification Results</span>
                {qiVerificationFindings.map((vf, idx) => {
                  const fLower = vf.finding.toLowerCase();
                  const isVerified = fLower.includes('verified') || fLower.includes('recovery');
                  const isReopen = fLower.includes('reopen') || fLower.includes('persist');
                  return (
                    <div
                      key={`${vf.agent_id}-${vf.timestamp}-${idx}`}
                      style={{
                        ...WHITE,
                        borderLeft: `4px solid ${isVerified ? 'var(--green, #12a150)' : isReopen ? 'var(--red, #e5484d)' : 'var(--accent)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="row between wrap" style={{ gap: 6 }}>
                        <span
                          className={`chip mono ${isVerified ? 'chip-green' : isReopen ? 'chip-red' : 'chip-accent'}`}
                          style={{ fontWeight: 700, fontSize: '0.72rem' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            {isVerified ? 'check_circle' : isReopen ? 'restart_alt' : 'verified'}
                          </span>
                          {isVerified ? 'PHYSICAL RECOVERY VERIFIED' : isReopen ? 'DEFECTS PERSIST · REOPENING' : 'GATEKEEPER VERIFICATION'}
                        </span>
                        <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                          {(vf.confidence * 100).toFixed(1)}% AI CONF · {formatClock(vf.timestamp)} UTC
                        </span>
                      </div>
                      <div style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--ink)' }}>{vf.finding}</div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.45 }}>{vf.evidence}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className="col" style={{ ...INSET, gap: 10 }}>
              <div className="row between">
                <span className="eyebrow" style={EYEBROW}>
                  Repair
                </span>
                <span className={`chip mono ${incident.repair_done || closed ? 'chip-green' : 'chip-amber'}`} style={{ fontWeight: 700 }}>
                  {incident.repair_done || closed ? 'EXECUTED' : 'IN PROGRESS'}
                </span>
              </div>
              {copilot ? (
                <>
                  <p style={{ fontWeight: 650, fontSize: '0.95rem', lineHeight: 1.45 }}>{copilot.finding}</p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5 }}>{copilot.evidence}</p>
                </>
              ) : (
                <p style={PLACEHOLDER}>Technician Copilot session not started yet.</p>
              )}
              <div className="row between" style={WHITE}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>8D report</span>
                <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.84rem' }}>
                  #8D-{id} · {docs.report_8d || scribe ? 'Ready' : 'Drafting'}
                </span>
              </div>
            </div>
            <div className="col" style={{ ...INSET, gap: 10 }}>
              <GeminiLiveCard machine={machine} />
            </div>
          </div>
          <div className="col" style={{ ...INSET, gap: 10 }}>
            <DocumentsPanel incident={incident} ready={hasDocs || Boolean(scribe)} />
          </div>
          <AgentAttribution findings={[copilot, scribe, ...qiVerificationFindings]} />
        </StepSection>

        <StepSection
          id="step-5"
          step={5}
          title="APPROVAL & LINE RELEASE"
          subtitle={approved ? 'Signed off · Line-01 released' : 'Awaiting shift-leader sign-off'}
          tone="green"
          emphasis
          state={states[4]}
          activeLabel="Awaiting sign-off"
          pendingNote={`Unlocks after ${target}/${target} consecutive defect-free parts.`}
          trailing={
            <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
              Gatekeeper: Devon Vance
            </span>
          }
        >
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <div className="col" style={{ ...INSET, gap: 8 }}>
              <span className="row" style={{ gap: 8, fontWeight: 650 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>
                  psychology
                </span>
                Lesson learned
              </span>
              {learning ? (
                <>
                  <p style={{ fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.5 }}>{learning.finding}</p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5 }}>{learning.evidence}</p>
                </>
              ) : (
                <p style={PLACEHOLDER}>Continuous Learning captures lessons learned on incident close, before sign-off.</p>
              )}
            </div>
            <div className="col" style={{ ...INSET, gap: 10 }}>
              <span className="row" style={{ gap: 8, fontWeight: 650 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--green)' }}>
                  savings
                </span>
                Impact
              </span>
              {impact ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'Scrap avoided', value: `${impact.scrap_avoided}`, unit: 'parts', note: impact.cost_savings_usd ? `$${impact.cost_savings_usd.toLocaleString('en-US')}` : null },
                    { label: 'Downtime avoided', value: (impact.downtime_minutes / 60).toFixed(1), unit: 'h', note: null },
                    { label: 'CO₂ avoided', value: impact.co2_kg.toLocaleString('en-US'), unit: 'kg', note: impact.energy_co2_kg !== undefined || impact.material_co2_kg !== undefined ? `energy ${(impact.energy_co2_kg ?? 0).toLocaleString('en-US')} · material ${(impact.material_co2_kg ?? 0).toLocaleString('en-US')}` : null },
                    { label: 'Energy saved', value: impact.energy_kwh.toLocaleString('en-US'), unit: 'kWh', note: null },
                    { label: 'Factory profile', value: impact.factory_type ? titleCase(impact.factory_type) : '—', unit: '', note: null },
                  ].map((s) => (
                    <div key={s.label} style={WHITE}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text)' }}>{s.label}</div>
                      <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                        {s.value}
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>
                      </div>
                      {s.note && (
                        <div className="mono" style={{ fontSize: '0.74rem', color: '#0e8a43', fontWeight: 700 }}>
                          {s.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={PLACEHOLDER}>Calculated when the incident closes.</p>
              )}
            </div>
          </div>

          <div className="row between wrap" style={{ ...WHITE, padding: '1.1rem 1.3rem', gap: 16 }}>
            <div style={{ flex: '1 1 420px' }}>
              <div style={{ fontWeight: 650 }}>Final authorization</div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.55 }}>
                Approving returns Line-01{machine ? ` and ${machine}` : ''} to full production cadence and archives this incident record.
              </p>
            </div>
            {releaseControl}
          </div>
          <AgentAttribution findings={[learning]} />
        </StepSection>
      </div>
      <StepRail steps={rail} />
    </>
  );
}
