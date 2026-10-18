// Report8DCard: automotive 8D discipline tracker with shift-leader approval (accepted only once the incident is closed).
import React, { useState } from 'react';
import type { IncidentState } from '../types';
import type { ToastTone } from '../App';
import { authFetch } from '../lib/auth';
import {
  formatClock,
  formatIncidentDate,
  friendlyDefectName,
  resolveFindings,
} from '../lib/incident';

interface Report8DCardProps {
  incident: IncidentState;
  isLive: boolean;
  onNotify: (text: string, tone?: ToastTone) => void;
}

const STAGE_ORDER = ['detecting', 'tracing', 'analyzing', 'investigating', 'awaiting_evidence', 'repairing', 'verifying', 'closed'];

function build8D(incident: IncidentState) {
  const machine = incident.suspect_machine;
  const tool = incident.suspect_tool;
  const stage = STAGE_ORDER.indexOf(incident.status);
  const signoffReady = incident.status === 'closed' || incident.status === 'pending_approval';
  const done = (minStage: string) => signoffReady || (stage >= 0 && stage >= STAGE_ORDER.indexOf(minStage));
  return [
    { code: 'D1', title: 'Team', desc: 'Kaizen agent team + Marcus Vance (TECH-902), Devon Vance (Lead Ops)', done: done('detecting') },
    { code: 'D2', title: 'Problem', desc: `${friendlyDefectName(incident.defect_type)} spike ${(incident.defect_rate * 100).toFixed(2)}% > UCL ${(incident.spc_ucl * 100).toFixed(1)}%`, done: done('detecting') },
    { code: 'D3', title: 'Containment', desc: machine ? `Suspect lot quarantined; ${machine} feed held` : 'Suspect lot quarantined; feed held', done: done('tracing') },
    { code: 'D4', title: 'Root Cause', desc: incident.root_cause ?? (tool ? `Tool ${tool} — analysis in progress` : 'Root cause analysis in progress'), done: done('repairing') },
    { code: 'D5', title: 'Corrective Action', desc: tool ? `Replace / index ${tool}, patch PLC tool-life offset` : 'Corrective action pending root-cause confirmation', done: done('repairing') },
    { code: 'D6', title: 'Validation', desc: `${incident.verification_count}/${incident.verification_target} consecutive good parts`, done: incident.verification_count >= incident.verification_target },
    { code: 'D7', title: 'Prevention', desc: 'SOP #209 rev 4.2 · PLC hard-tripwire at cycle 440', done: done('closed') },
    { code: 'D8', title: 'Recognition', desc: incident.approved ? 'Signed off by shift leader' : 'Awaiting shift-leader sign-off', done: incident.approved },
  ];
}

export default function Report8DCard({ incident, isLive, onNotify }: Report8DCardProps): React.ReactElement {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showAudit, setShowAudit] = useState<boolean>(false);
  const steps = build8D(incident);
  const closed = incident.status === 'closed' || incident.status === 'pending_approval';
  const approved = incident.approved;
  const canApprove = isLive && closed && !approved;
  const findings = resolveFindings(isLive ? incident : null);

  const approve = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch('/api/incidents/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incident.incident_id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onNotify(`Incident ${incident.incident_id} approved — Line-01 released.`);
    } catch (err) {
      onNotify(`Approval failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const download = () => {
    const whys = findings.find((f) => f.five_whys?.length)?.five_whys;
    const whyLines =
      whys && whys.length > 0
        ? whys.map((w) => `${w.level}. ${w.why} — ${w.answer}`)
        : ['_Root cause analysis pending — no 5-Whys from the Root Cause agent yet._'];
    const lines = [
      `# 8D Report — ${incident.incident_id}`,
      '',
      `Status: ${incident.status}${approved ? ' (approved)' : ''}`,
      `Suspect: ${incident.suspect_machine ?? '-'} / ${incident.suspect_tool ?? '-'}`,
      `Defect rate: ${(incident.defect_rate * 100).toFixed(2)}% (UCL ${(incident.spc_ucl * 100).toFixed(2)}%)`,
      '',
      ...steps.map((s) => `## ${s.code} ${s.title}\n${s.desc}\n`),
      '## 5-Whys',
      ...whyLines,
      '',
      '## Agent findings',
      ...findings.map((f) => `- [${formatClock(f.timestamp)}] ${f.agent_name} (${(f.confidence * 100).toFixed(1)}%): ${f.finding} — ${f.citation}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `8D-${incident.incident_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="glass card-pad" aria-label="8D report and shift leader approval">
      <div className="row between" style={{ marginBottom: 12, gap: 10 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              assignment_turned_in
            </span>
            8D Report &amp; Operator Decision
          </h2>
          <p className="card-sub mono">#8D-{incident.incident_id}</p>
        </div>
        <span className={`chip ${approved ? 'chip-green' : closed ? 'chip-amber' : ''}`}>
          <span className="dot" />
          {approved ? 'Signed' : closed ? 'Awaiting sign-off' : 'Drafting'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {steps.map((s) => (
          <div key={s.code} className="glass-inset" style={{ padding: '0.5rem 0.65rem', opacity: s.done ? 1 : 0.6 }}>
            <div className="row" style={{ gap: 6 }}>
              <span
                className="material-symbols-outlined icon-fill"
                style={{ fontSize: 15, color: s.done ? 'var(--green)' : 'var(--faint)' }}
              >
                {s.done ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className="mono" style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)' }}>
                {s.code}
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: 650 }}>{s.title}</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      <div className={`glass-inset ${approved ? 'tone-green' : ''}`} style={{ marginTop: 12, padding: '0.75rem 0.85rem' }}>
        {approved ? (
          <>
            <div className="row" style={{ gap: 6, fontSize: '0.76rem', fontWeight: 700, color: '#0e8a43' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 17 }}>
                verified
              </span>
              LINE RELEASED &amp; SIGNED
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text)', marginTop: 3 }}>
              Approved by <strong>{incident.approved_by ?? 'Shift Leader'}</strong>
              {incident.approved_at ? (
                <> · {formatIncidentDate(incident.approved_at)} · {formatClock(incident.approved_at)} UTC</>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.76rem', fontWeight: 650 }}>Shift Leader Authorization</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {closed
                ? 'Product evidence complete. Approving releases the station to full cadence and archives the record.'
                : `Locked until the incident closes on product evidence (${incident.verification_count}/${incident.verification_target} good parts).`}
              {!isLive && ' Connect the backend to sign live incidents.'}
            </div>
          </>
        )}
      </div>

      <div className="col" style={{ gap: 6, marginTop: 10 }}>
        {!approved && (
          <button id="approve-incident" type="button" className="btn btn-dark btn-block" style={{ padding: '0.7rem' }} disabled={!canApprove || submitting} onClick={approve}>
            <span className="material-symbols-outlined">{canApprove ? 'task_alt' : 'lock'}</span>
            {submitting ? 'Submitting…' : 'Approve & Release Line'}
          </button>
        )}
        <div className="row" style={{ gap: 6 }}>
          <button id="download-8d" type="button" className={`btn ${approved ? 'btn-dark' : ''}`} style={{ flex: 1 }} onClick={download}>
            <span className="material-symbols-outlined">download</span>
            Download Report
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setShowAudit((v) => !v)}>
            <span className="material-symbols-outlined">receipt_long</span>
            {showAudit ? 'Hide' : 'Audit Log'}
          </button>
        </div>
      </div>

      {showAudit && (
        <ul style={{ listStyle: 'none', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, animation: 'fadeUp 0.3s var(--ease) both' }}>
          {findings.map((f, i) => (
            <li key={i} className="row mono" style={{ gap: 8, fontSize: '0.66rem', color: 'var(--muted)' }}>
              <span>{formatClock(f.timestamp)}</span>
              <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{f.agent_name}</span>
              <span style={{ marginLeft: 'auto' }}>{(f.confidence * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
