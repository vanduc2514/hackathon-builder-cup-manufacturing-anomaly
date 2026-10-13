import React from 'react';
import type { WorkOrder } from '../../types/mobile';

interface WorkOrderCardProps {
  order: WorkOrder;
  onOpen: () => void;
}

const PRIORITY_TONE: Record<WorkOrder['priority'], string> = {
  P1: 'red',
  P2: 'orange',
  P3: 'plain',
};

/** One work order in the Work List; layout adapts to stage (active / processing / completed). */
export default function WorkOrderCard({ order, onOpen }: WorkOrderCardProps): React.ReactElement {
  const isEvidence = order.kind === 'evidence';
  // Progress counts only the shots the technician has to take, not sensor data the AI already has.
  const required = order.evidence.filter((e) => e.guidance);
  const captured = required.filter((e) => e.captured).length;
  const total = required.length;
  const analysing = Boolean(order.live && !order.live.canSubmitEvidence);
  const sourceChip = order.live ? (
    <span className="m-chip live">
      <span className="m-dot pulse" style={{ width: 6, height: 6 }} />
      Live
    </span>
  ) : (
    <span className="m-chip demo">Demo</span>
  );

  if (order.stage === 'completed') {
    return (
      <article className="m-glass m-work m-pressable" onClick={onOpen} id={`m-wo-${order.id}`}>
        <div className="m-work-head">
          <div className="m-thumb" style={{ width: 52, height: 52, borderRadius: 14 }}>
            <img src={order.image} alt={order.machine} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }} className="m-col">
            <div className="m-between">
              <span className="m-row" style={{ gap: 6 }}>
                <span className="m-sub m-mono">#{order.id}</span>
                {sourceChip}
              </span>
              <span className="m-chip green">
                <span className="material-symbols-outlined ms-fill">check_circle</span>Done
              </span>
            </div>
            <h3 className="m-h3">{order.title}</h3>
            <div className="m-sub">{order.outcome}</div>
          </div>
        </div>
        <div className="m-work-meta">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
          Finished {order.completedAt}
          <span className="sep" />
          {order.machine}
        </div>
      </article>
    );
  }

  if (order.stage === 'processing' && order.processing) {
    const p = order.processing;
    const pct = p.target > 0 ? Math.min(100, (p.verified / p.target) * 100) : 0;
    const escalated = order.live ? order.live.status === 'escalated' || order.live.status === 'error' : false;
    const verifying = order.live?.status === 'verifying';
    return (
      <article className="m-glass m-work m-pressable" onClick={onOpen} id={`m-wo-${order.id}`}>
        <span className="m-work-accent" style={{ background: 'var(--blue)' }} />
        <div className="m-between">
          <div className="m-row" style={{ gap: 6 }}>
            <span className={`m-chip ${escalated ? 'red' : 'blue'}`}>
              <span className="m-dot pulse" style={{ width: 6, height: 6 }} />
              {escalated ? 'Escalated' : verifying ? 'Verifying parts' : 'Awaiting lead'}
            </span>
            {sourceChip}
          </div>
          <span className="m-sub m-mono">#{order.id}</span>
        </div>
        <div className="m-work-head">
          <div className="m-thumb">
            <img src={order.image} alt={order.machine} />
          </div>
          <div className="m-col" style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <h3 className="m-h3">{order.title}</h3>
            <div className="m-work-meta">
              {order.machine}
              <span className="sep" />
              {order.location}
            </div>
          </div>
        </div>
        {p.target > 0 && !escalated && (
          <div className="m-col">
            <div className="m-between">
              <span className="m-sub">Parts verified</span>
              <span className="m-sub m-mono" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                {p.verified}/{p.target}
              </span>
            </div>
            <div className="m-progress">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="m-work-foot">
          <span className="m-type-pill">
            <span className="m-type-icon wait">
              <span className="material-symbols-outlined">hourglass_top</span>
            </span>
            {escalated ? (order.statusReason ?? 'Escalated') : `Sign-off by ${p.lead}`}
          </span>
          <span className="material-symbols-outlined m-li-chev">chevron_right</span>
        </div>
      </article>
    );
  }

  return (
    <article className="m-glass m-work m-pressable" onClick={onOpen} id={`m-wo-${order.id}`}>
      <span
        className="m-work-accent"
        style={{ background: isEvidence ? 'linear-gradient(#ff6a5c,#ff9f43)' : 'linear-gradient(var(--accent),#4aa8ff)' }}
      />
      <div className="m-between">
        <div className="m-row" style={{ gap: 6 }}>
          {isEvidence && analysing ? (
            <span className="m-chip orange">
              <span className="m-dot pulse" style={{ width: 6, height: 6 }} />
              AI analysing
            </span>
          ) : isEvidence ? (
            <span className="m-chip red">
              <span className="m-dot pulse" style={{ width: 6, height: 6 }} />
              Needs evidence
            </span>
          ) : (
            <span className="m-chip indigo">
              <span className="material-symbols-outlined ms-fill">verified</span>
              Ready to fix
            </span>
          )}
          <span className={`m-chip ${PRIORITY_TONE[order.priority]}`}>{order.priority}</span>
          {sourceChip}
        </div>
        <span className="m-sub">{order.createdAt}</span>
      </div>

      <div className="m-work-head">
        <div className="m-thumb">
          <img src={order.image} alt={order.machine} />
        </div>
        <div className="m-col" style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <h3 className="m-h3">{order.title}</h3>
          <div className="m-work-meta">
            <span className="m-mono">#{order.id}</span>
            <span className="sep" />
            {order.machine}
          </div>
          <p className="m-body" style={{ fontSize: 12.5 }}>
            {order.summary}
          </p>
        </div>
      </div>

      {isEvidence && total > 0 && (
        <div className="m-col">
          <div className="m-between">
            <span className="m-sub">Evidence collected</span>
            <span className="m-sub" style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {captured} of {total}
            </span>
          </div>
          <div className="m-progress">
            <div style={{ width: `${(captured / total) * 100}%`, background: 'linear-gradient(90deg,#ff6a5c,#ff9f43)' }} />
          </div>
        </div>
      )}

      <div className="m-work-foot">
        <span className="m-type-pill">
          <span className={`m-type-icon ${isEvidence ? 'evidence' : 'fix'}`}>
            <span className="material-symbols-outlined">{isEvidence ? 'photo_camera' : 'build'}</span>
          </span>
          {isEvidence
            ? analysing
              ? 'AI is analysing'
              : `${total - captured} shot${total - captured === 1 ? '' : 's'} needed`
            : order.estMinutes !== undefined
              ? `Repair · ~${order.estMinutes} min`
              : `Repair · ${order.steps.length} steps`}
        </span>
        <button
          className={`m-btn xs ${isEvidence && !analysing ? 'accent' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {isEvidence && !analysing ? 'Collect' : 'Open'}
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
        </button>
      </div>
    </article>
  );
}
