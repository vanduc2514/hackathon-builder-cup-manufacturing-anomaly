import React from 'react';
import type { EvidenceItem, WorkOrder } from '../../types/mobile';
import MobileNavBar from './MobileNavBar';
import ConfidenceRing from './ConfidenceRing';
import AiReasonCard from './AiReasonCard';
import VisualEvidenceCard from './VisualEvidenceCard';

interface MobileEvidenceDetailProps {
  order: WorkOrder;
  submitting: boolean;
  onBack: () => void;
  onCapture: (item: EvidenceItem) => void;
  onSubmit: () => void;
}

/** Decorative spectrum shown only on demo orders, which have no sensor samples. */
const DEMO_SPECTRUM = [22, 30, 26, 40, 34, 52, 46, 92, 58, 38, 30, 24, 20, 18];

function SourceTag({ item }: { item: EvidenceItem }): React.ReactElement {
  const map = {
    sensor: { icon: 'sensors', text: 'Sensor' },
    camera: { icon: 'videocam', text: 'Inline cam' },
    technician: { icon: 'person', text: 'You' },
  } as const;
  const s = map[item.source ?? 'technician'];
  return (
    <span className="m-chip dark tag plain" style={{ height: 22 }}>
      <span className="material-symbols-outlined">{s.icon}</span>
      {s.text}
    </span>
  );
}

function TileVisual({ item, isLive }: { item: EvidenceItem; isLive: boolean }): React.ReactElement {
  if (item.thumbnail) return <img src={item.thumbnail} alt={item.label} />;
  if (item.series && item.series.length > 0) {
    const max = Math.max(...item.series);
    const min = Math.min(...item.series);
    const span = max - min || 1;
    return (
      <div className="bars" aria-label={`${item.label} history`}>
        {item.series.map((v, i) => (
          <i key={i} className={v === max ? 'over' : ''} style={{ height: `${20 + ((v - min) / span) * 80}%` }} />
        ))}
      </div>
    );
  }
  if (!isLive && item.source === 'sensor') {
    return (
      <div className="spectrum">
        {DEMO_SPECTRUM.map((h, i) => (
          <i key={i} className={h > 80 ? 'peak' : ''} style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="placeholder">
      <span className="material-symbols-outlined">{item.source === 'technician' ? 'image' : 'sensors'}</span>
    </div>
  );
}

/** Evidence job: what the AI already has, and what the technician still needs to shoot. */
export default function MobileEvidenceDetail({
  order,
  submitting,
  onBack,
  onCapture,
  onSubmit,
}: MobileEvidenceDetailProps): React.ReactElement {
  const live = order.live;
  const have = order.evidence.filter((e) => !e.guidance);
  const required = order.evidence.filter((e) => e.guidance);
  const remaining = required.filter((e) => !e.captured).length;
  const waitingForAi = Boolean(live && !live.canSubmitEvidence);

  let cta: string;
  if (submitting) cta = 'Sending to AI…';
  else if (waitingForAi) cta = live?.visualEvidence ? 'AI is re-analysing your photo' : 'Waiting for the AI to ask';
  else if (remaining > 0) cta = `Capture ${remaining} more to submit`;
  else cta = 'Submit evidence to AI';

  return (
    <>
      <MobileNavBar
        title="Collect evidence"
        subtitle={`#${order.id} · ${order.machine}`}
        onBack={onBack}
        trailing={<span className={`m-chip ${order.priority === 'P1' ? 'red' : 'orange'}`}>{order.priority}</span>}
      />
      <div className="m-screen m-push">
        {/* What's going on */}
        <section className="m-glass m-ai">
          <div className="m-between" style={{ alignItems: 'flex-start' }}>
            <div className="m-col" style={{ gap: 8, flex: 1 }}>
              <span className="m-ai-badge">
                <span className="spark">
                  <span className="material-symbols-outlined ms-fill">auto_awesome</span>
                </span>
                {waitingForAi ? 'AI is working' : 'AI needs your eyes'}
              </span>
              <h2 className="m-h2">{order.title}</h2>
            </div>
            <div className="m-col" style={{ alignItems: 'center', gap: 2 }}>
              <ConfidenceRing value={order.aiConfidence} color="#ff9500" />
              <span className="m-sub" style={{ fontSize: 10.5 }}>confidence</span>
            </div>
          </div>
          <p className="m-body" style={{ marginTop: 10 }}>“{order.aiRequest}”</p>
          <div className="m-row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
            <span className="m-chip plain">
              <span className="material-symbols-outlined">location_on</span>
              {order.location}
            </span>
            {order.suspectTool && (
              <span className="m-chip plain">
                <span className="material-symbols-outlined">hardware</span>
                {order.suspectTool}
              </span>
            )}
            {live && (
              <span className="m-chip plain">
                <span className="material-symbols-outlined">monitoring</span>
                Status: {live.status.replace('_', ' ')}
              </span>
            )}
          </div>
        </section>

        {live?.visualEvidence && <VisualEvidenceCard evidence={live.visualEvidence} />}
        {live?.reason && <AiReasonCard title="Why the AI flagged this" reason={live.reason} />}

        {/* Already have */}
        {have.length > 0 && (
          <>
            <div className="m-label">
              Already collected
              <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{have.length} items</span>
            </div>
            <div className="m-ev-grid">
              {have.map((item) => (
                <div key={item.id} className="m-ev-tile">
                  <TileVisual item={item} isLive={Boolean(live)} />
                  <SourceTag item={item} />
                  <div className="cap">
                    <div className="t">{item.label}</div>
                    <div className="s">
                      {item.hint}
                      {item.capturedAt ? ` · ${item.capturedAt}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Still needed */}
        {required.length > 0 && (
          <>
            <div className="m-label">
              Still needed
              <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: remaining ? '#d70015' : '#1b8a3c' }}>
                {remaining ? `${remaining} left` : 'All done'}
              </span>
            </div>
            <div className="m-col" style={{ gap: 10 }}>
              {required.map((item) => (
                <div
                  key={item.id}
                  className="m-glass m-need m-pressable"
                  onClick={() => onCapture(item)}
                  id={`m-need-${item.id}`}
                >
                  <div className={`m-need-icon ${item.captured ? 'done' : ''}`}>
                    {item.captured && item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.label} />
                    ) : (
                      <span className="material-symbols-outlined">
                        {item.mediaType === 'video' ? 'videocam' : 'add_a_photo'}
                      </span>
                    )}
                  </div>
                  <div className="m-li-body">
                    <div className="m-li-title">{item.label}</div>
                    <div className="m-li-sub">
                      {item.captured ? `Captured ${item.capturedAt} · tap to retake` : item.hint}
                    </div>
                  </div>
                  {item.captured ? (
                    <span className="material-symbols-outlined ms-fill" style={{ color: 'var(--green)', fontSize: 24 }}>
                      check_circle
                    </span>
                  ) : (
                    <span className="m-chip indigo">
                      <span className="material-symbols-outlined">
                        {item.mediaType === 'video' ? 'videocam' : 'photo_camera'}
                      </span>
                      {item.mediaType}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="m-sticky-cta">
          <button
            className="m-btn"
            disabled={submitting || waitingForAi || remaining > 0 || required.length === 0}
            onClick={onSubmit}
            id="m-submit-evidence"
          >
            <span className="material-symbols-outlined">{waitingForAi ? 'hourglass_top' : 'send'}</span>
            {cta}
          </button>
        </div>
      </div>
    </>
  );
}
