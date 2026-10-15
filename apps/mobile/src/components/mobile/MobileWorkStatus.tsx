import React, { useState } from 'react';
import type { HandoverNote } from '../../types';
import type { WorkOrder } from '../../types/mobile';
import MobileNavBar from './MobileNavBar';
import ConfidenceRing from './ConfidenceRing';
import AiReasonCard from './AiReasonCard';
import VisualEvidenceCard from './VisualEvidenceCard';

interface MobileWorkStatusProps {
  order: WorkOrder;
  handoverNote?: string;
  handoverNotes?: HandoverNote[];
  onBack: () => void;
  onPingLead: () => void;
  onAddHandoverNote?: (note: string) => Promise<void>;
}

interface Milestone {
  title: string;
  sub: string;
  state: 'done' | 'current' | 'todo';
}

/** Milestones for a demo order, driven by local state. */
function demoMilestones(order: WorkOrder): Milestone[] {
  const done = order.stage === 'completed';
  const p = order.processing;
  const verified = p?.verified ?? 0;
  const target = p?.target ?? 0;
  const partsDone = target > 0 && verified >= target;
  const isEvidence = order.kind === 'evidence';
  const list: Milestone[] = [
    { title: isEvidence ? 'Evidence submitted' : 'Repair submitted', sub: done ? 'By you' : `By you at ${p?.submittedAt ?? '—'}`, state: 'done' },
    { title: isEvidence ? 'AI re-analysis' : 'AI check of repair steps', sub: p?.aiNote ?? 'All checks passed', state: 'done' },
  ];
  if (!isEvidence) {
    list.push({
      title: 'Product verification',
      sub: target > 0 ? `${verified} of ${target} parts passed inline camera` : '50 of 50 parts passed',
      state: done || partsDone ? 'done' : 'current',
    });
  }
  list.push({
    title: 'Lead sign-off',
    sub: done ? order.outcome ?? 'Approved' : `Waiting for ${p?.lead ?? 'Shift Leader'}`,
    state: done ? 'done' : !isEvidence && !partsDone ? 'todo' : 'current',
  });
  return list;
}

/** Milestones for the live incident, driven by backend fields only. */
function liveMilestones(order: WorkOrder): Milestone[] {
  const live = order.live;
  if (!live) return [];
  const p = order.processing;
  const verified = live.verificationCount;
  const target = live.verificationTarget;
  const partsDone = target > 0 && verified >= target;
  const escalated = live.status === 'escalated' || live.status === 'error';

  if (live.status === 'dismissed') {
    return [{ title: 'Incident dismissed', sub: order.statusReason ?? 'No anomaly confirmed', state: 'done' }];
  }

  const list: Milestone[] = [
    {
      title: 'Root cause',
      sub: order.rootCause ?? (escalated ? 'Not confirmed' : 'AI is analysing'),
      state: order.rootCause ? 'done' : escalated ? 'todo' : 'current',
    },
    {
      title: 'Repair',
      sub: live.repairDone ? live.copilotNote?.finding ?? 'Recorded by the Technician Copilot' : 'Not done yet',
      state: live.repairDone ? 'done' : order.rootCause ? 'current' : 'todo',
    },
    {
      title: 'Product verification',
      sub: `${verified} consecutive good parts (target ${target})`,
      state: partsDone ? 'done' : live.repairDone && !escalated ? 'current' : 'todo',
    },
    {
      title: 'Lead sign-off',
      sub: live.approved ? order.outcome ?? 'Approved' : partsDone ? `Waiting for ${p?.lead ?? 'Shift Leader'}` : 'After verification',
      state: live.approved ? 'done' : partsDone ? 'current' : 'todo',
    },
  ];
  if (escalated) {
    list.push({ title: 'Escalated', sub: order.statusReason ?? 'Needs a senior engineer', state: 'current' });
  }
  return list;
}

function formatNoteTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Read-only status for Processing (awaiting lead) and Completed work. */
export default function MobileWorkStatus({
  order,
  handoverNote,
  handoverNotes,
  onBack,
  onPingLead,
  onAddHandoverNote,
}: MobileWorkStatusProps): React.ReactElement {
  const [noteDraft, setNoteDraft] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const live = order.live;
  const done = order.stage === 'completed';
  const p = order.processing;
  const verified = p?.verified ?? 0;
  const target = p?.target ?? 0;
  const hasParts = target > 0;
  const isEscalated = live
    ? live.status === 'escalated' || live.status === 'error'
    : Boolean(order.statusReason || p?.aiNote?.startsWith('Escalated'));
  const milestones = live ? liveMilestones(order) : demoMilestones(order);
  const pct = hasParts ? Math.min(100, (verified / target) * 100) : 100;
  const impact = live?.impact;

  const allNotes: Array<{ author: string; note: string; created_at?: string }> = [
    ...(handoverNotes ?? []),
    ...(handoverNote && !handoverNotes?.some((n) => n.note === handoverNote)
      ? [{ author: 'You', note: handoverNote }]
      : []),
  ];

  const handleAddNote = async () => {
    if (!noteDraft.trim() || !onAddHandoverNote) return;
    try {
      setSubmittingNote(true);
      await onAddHandoverNote(noteDraft.trim());
      setNoteDraft('');
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <>
      <MobileNavBar
        title={done ? 'Completed' : isEscalated ? 'Escalated' : 'Processing'}
        subtitle={`#${order.id}`}
        onBack={onBack}
      />
      <div className="m-screen m-push">
        <div className="m-hero" style={{ height: 160 }}>
          <img src={order.image} alt={order.machine} />
          <div className="m-hero-top">
            <span
              className={`m-chip ${done ? 'green' : isEscalated ? 'red' : 'blue'}`}
              style={{ background: 'rgba(255,255,255,.85)' }}
            >
              <span className="material-symbols-outlined ms-fill">
                {done ? 'verified' : isEscalated ? 'warning' : 'hourglass_top'}
              </span>
              {done ? 'Closed' : isEscalated ? 'Escalated' : live?.status === 'verifying' ? 'Verifying parts' : 'Awaiting lead'}
            </span>
          </div>
          <div className="m-hero-bottom">
            <div className="m-sub">{order.machine} · {order.location}</div>
            <h2>{order.title}</h2>
          </div>
        </div>

        {order.statusReason && (
          <section
            className="m-glass m-card m-row"
            style={{ gap: 10, background: 'rgba(255,59,48,.1)', borderColor: 'rgba(255,59,48,.3)' }}
          >
            <span className="material-symbols-outlined" style={{ color: '#d70015', fontSize: 22 }}>
              info
            </span>
            <div className="m-col" style={{ gap: 2, flex: 1 }}>
              <div className="m-h3" style={{ color: '#d70015' }}>Incident Notice</div>
              <div className="m-sub" style={{ color: 'var(--ink)' }}>{order.statusReason}</div>
            </div>
          </section>
        )}

        {hasParts && !done && !isEscalated && (
          <section className="m-glass m-card m-row" style={{ gap: 14 }}>
            <ConfidenceRing value={pct} size={66} color="#0a84ff" label={`${verified}`} />
            <div className="m-col" style={{ flex: 1, gap: 4 }}>
              <div className="m-h3">{verified >= target ? 'Parts verified' : 'Verifying parts'}</div>
              <div className="m-sub">
                {verified >= target
                  ? `${target} good parts in a row. Your lead can approve now.`
                  : `${target - verified} more good parts in a row before your lead can approve.`}
              </div>
              <div className="m-progress" style={{ marginTop: 4 }}>
                <div style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#0a84ff,#5ac8fa)' }} />
              </div>
            </div>
          </section>
        )}

        {done && (
          <section className="m-glass m-card m-row" style={{ gap: 12 }}>
            <span className="m-type-icon done" style={{ width: 40, height: 40, borderRadius: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>task_alt</span>
            </span>
            <div className="m-col" style={{ gap: 2 }}>
              <div className="m-h3">{order.outcome}</div>
              <div className="m-sub">Finished {order.completedAt}</div>
            </div>
          </section>
        )}

        {impact && (
          <>
            <div className="m-label">Impact</div>
            <div className="m-stats four">
              <div className="m-glass m-stat">
                <span className="l">Scrap avoided</span>
                <span className="v">{impact.scrap_avoided}<small>parts</small></span>
              </div>
              <div className="m-glass m-stat">
                <span className="l">Downtime</span>
                <span className="v">{impact.downtime_minutes}<small>min</small></span>
              </div>
              <div className="m-glass m-stat">
                <span className="l">CO₂ saved</span>
                <span className="v">{impact.co2_kg.toFixed(1)}<small>kg</small></span>
              </div>
              <div className="m-glass m-stat">
                <span className="l">Savings</span>
                <span className="v">
                  {impact.cost_savings_usd != null ? `$${Math.round(impact.cost_savings_usd).toLocaleString('en-US')}` : '—'}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="m-label">Progress</div>
        <section className="m-glass m-timeline">
          {milestones.map((m) => (
            <div key={m.title} className={`m-tl ${m.state}`}>
              <span className="m-tl-dot">
                <span className="material-symbols-outlined">
                  {m.state === 'done' ? 'check' : m.state === 'current' ? 'more_horiz' : 'radio_button_unchecked'}
                </span>
              </span>
              <div>
                <div className="m-li-title">{m.title}</div>
                <div className="m-li-sub">{m.sub}</div>
              </div>
            </div>
          ))}
        </section>

        {live?.visualEvidence && <VisualEvidenceCard evidence={live.visualEvidence} />}
        {live?.reason && <AiReasonCard title="Why the AI flagged this" reason={live.reason} />}

        <div className="m-label">Summary</div>
        <section className="m-glass m-card">
          <p className="m-body">{order.summary}</p>
        </section>

        {(allNotes.length > 0 || onAddHandoverNote) && (
          <>
            <div className="m-label">
              Handover notes
              {live && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Synced to board</span>}
            </div>
            <section className="m-glass m-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allNotes.length === 0 ? (
                <p className="m-sub" style={{ margin: 0 }}>No handover notes recorded yet.</p>
              ) : (
                allNotes.map((n, i) => (
                  <div
                    key={i}
                    style={{
                      borderBottom: i < allNotes.length - 1 ? '1px solid var(--hair)' : 'none',
                      paddingBottom: i < allNotes.length - 1 ? 10 : 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{n.author}</span>
                      {n.created_at && (
                        <span className="m-sub" style={{ fontSize: 11 }}>
                          {formatNoteTime(n.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="m-body" style={{ margin: 0 }}>{n.note}</p>
                  </div>
                ))
              )}

              {onAddHandoverNote && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="m-textarea"
                    placeholder="Add a handover note for the next shift..."
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    disabled={submittingNote}
                    rows={2}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="m-btn glass"
                      disabled={!noteDraft.trim() || submittingNote}
                      onClick={handleAddNote}
                      style={{ height: 36, minWidth: 80, fontSize: 13 }}
                    >
                      {submittingNote ? 'Saving...' : 'Add note'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {(live?.report8d || live?.sopProposal) && <div className="m-label">Reports</div>}
        {live?.report8d && (
          <details className="m-glass m-details">
            <summary>
              <span>8D report</span>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>expand_more</span>
            </summary>
            <pre>{live.report8d}</pre>
          </details>
        )}
        {live?.sopProposal && (
          <details className="m-glass m-details">
            <summary>
              <span>SOP proposal</span>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>expand_more</span>
            </summary>
            <pre>{live.sopProposal}</pre>
          </details>
        )}

        {!done && (
          <div className="m-sticky-cta">
            <button className="m-btn glass" onClick={onPingLead} id="m-ping-lead">
              <span className="material-symbols-outlined">notifications_active</span>
              Remind {p?.lead ?? 'Shift Leader'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
