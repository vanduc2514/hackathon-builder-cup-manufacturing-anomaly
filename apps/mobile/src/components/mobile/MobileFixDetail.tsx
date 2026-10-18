import React from 'react';
import type { WorkOrder } from '../../types/mobile';
import { useOemManual } from '../../hooks/useOemManual';
import MobileNavBar from './MobileNavBar';
import ConfidenceRing from './ConfidenceRing';
import AiReasonCard from './AiReasonCard';
import MobileMarkdown from './MobileMarkdown';

interface MobileFixDetailProps {
  order: WorkOrder;
  onBack: () => void;
  onStart: () => void;
}

const TREND_ICON = { up: 'trending_up', down: 'trending_down', flat: 'trending_flat' } as const;

/** Repair job briefing: what's wrong, why, what you need, and the step plan — then Start. */
export default function MobileFixDetail({ order, onBack, onStart }: MobileFixDetailProps): React.ReactElement {
  const { steps: dynamicSteps, parts: dynamicParts } = useOemManual(order.machine);
  const steps = order.steps.length > 0 ? order.steps : dynamicSteps;
  const partsNeeded = order.partsNeeded.length > 0 ? order.partsNeeded : dynamicParts;
  return (
    <>
      <MobileNavBar
        title="Repair brief"
        subtitle={`#${order.id}`}
        onBack={onBack}
        trailing={<span className={`m-chip ${order.priority === 'P1' ? 'red' : 'plain'}`}>{order.priority}</span>}
      />
      <div className="m-screen m-push">
        <div className="m-hero">
          <img src={order.image} alt={order.machine} />
          <div className="m-hero-top">
            <span className="m-chip dark plain">
              <span className="material-symbols-outlined">location_on</span>
              {order.location}
            </span>
            {order.estMinutes !== undefined && (
              <span className="m-chip dark plain">
                <span className="material-symbols-outlined">timer</span>~{order.estMinutes} min
              </span>
            )}
          </div>
          <div className="m-hero-bottom">
            <div className="m-sub">{order.machine}</div>
            <h2>{order.title}</h2>
          </div>
        </div>

        {/* What's going on */}
        <section className="m-glass m-ai">
          <div className="m-between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="m-col" style={{ gap: 8, flex: 1 }}>
              <span className="m-ai-badge">
                <span className="spark">
                  <span className="material-symbols-outlined ms-fill">auto_awesome</span>
                </span>
                What’s going on
              </span>
              <p className="m-body">{order.summary}</p>
            </div>
            <div className="m-col" style={{ alignItems: 'center', gap: 2 }}>
              <ConfidenceRing value={order.aiConfidence} color="#30c25a" />
              <span className="m-sub" style={{ fontSize: 10.5 }}>AI sure</span>
            </div>
          </div>
          <div className="m-divider" style={{ margin: '12px 0' }} />
          <div className="m-col" style={{ gap: 10 }}>
            <div className="m-row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="m-li-icon" style={{ background: 'rgba(255,59,48,.1)', color: '#d70015' }}>
                <span className="material-symbols-outlined">report</span>
              </span>
              <div>
                <div className="m-sub">Root cause</div>
                <div className="m-li-title">{order.rootCause ?? 'Not confirmed yet'}</div>
              </div>
            </div>
            <div className="m-row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="m-li-icon">
                <span className="material-symbols-outlined">hardware</span>
              </span>
              <div>
                <div className="m-sub">Suspect part</div>
                <div className="m-li-title">{order.suspectTool ?? 'Not identified yet'}</div>
              </div>
            </div>
          </div>
        </section>

        {order.live?.reason && <AiReasonCard title="Why the AI flagged this" reason={order.live.reason} />}

        {order.live?.workOrderText && (
          <details className="m-glass m-details" open>
            <summary>
              <span className="m-row" style={{ gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>assignment</span>
                Work order · Incident Scribe
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>expand_more</span>
            </summary>
            <MobileMarkdown source={order.live.workOrderText} />
          </details>
        )}

        {/* Live readings */}
        <div className="m-label">
          Live readings
          {order.live && (
            <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
              {order.live.sensorSource === 'stream'
                ? 'Edge telemetry'
                : order.live.sensorSource === 'history'
                  ? 'Last recorded sample'
                  : 'No sensor data'}
            </span>
          )}
        </div>
        <div className={`m-stats ${order.sensors.length === 4 ? 'four' : ''}`}>
          {order.sensors.map((s) => (
            <div key={s.label} className={`m-glass m-stat ${s.alert ? 'alert' : ''}`}>
              <span className="l m-row" style={{ gap: 3 }}>
                {s.label}
              </span>
              <span className="v">
                {s.value}
                <small>{s.unit}</small>
              </span>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: s.alert ? '#d70015' : 'var(--ink-3)' }}
              >
                {TREND_ICON[s.trend]}
              </span>
            </div>
          ))}
        </div>

        {/* Bring */}
        <div className="m-label">Bring with you</div>
        <div className="m-glass m-list">
          {partsNeeded.length === 0 && (
            <div className="m-li">
              <div className="m-li-body">
                <div className="m-li-sub">No parts list for this machine. Check the work order above.</div>
              </div>
            </div>
          )}
          {partsNeeded.map((p) => (
            <div key={p} className="m-li">
              <span className="m-li-icon">
                <span className="material-symbols-outlined">inventory_2</span>
              </span>
              <div className="m-li-body">
                <div className="m-li-title" style={{ fontSize: 13.5 }}>{p}</div>
              </div>
              <span className="material-symbols-outlined ms-fill" style={{ color: 'var(--green)', fontSize: 20 }}>
                check_circle
              </span>
            </div>
          ))}
        </div>

        {/* Plan */}
        <div className="m-label">
          Repair plan
          <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{steps.length} steps</span>
        </div>
        <div className="m-glass m-list">
          {steps.length === 0 && (
            <div className="m-li">
              <div className="m-li-body">
                <div className="m-li-sub">No OEM repair procedure for {order.machine}.</div>
              </div>
            </div>
          )}
          {steps.map((s) => (
            <div key={s.id} className="m-li">
              <span className="m-step-num">{s.id}</span>
              <div className="m-li-body">
                <div className="m-li-title" style={{ fontSize: 13.5 }}>{s.title}</div>
                <div className="m-li-sub">
                  Target {s.target} · {s.reference}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="m-glass m-card m-row" style={{ gap: 10, padding: 12, background: 'rgba(255,149,0,.1)' }}>
          <span className="material-symbols-outlined ms-fill" style={{ color: '#ff9500' }}>shield</span>
          <span className="m-body" style={{ fontSize: 12.5 }}>
            Lock out the machine before touching it. The copilot will check this with you in step 1.
          </span>
        </div>

        <div className="m-sticky-cta">
          <button className="m-btn accent" onClick={onStart} disabled={steps.length === 0} id="m-start-repair">
            <span className="material-symbols-outlined ms-fill">play_arrow</span>
            Start guided repair
          </button>
        </div>
      </div>
    </>
  );
}
