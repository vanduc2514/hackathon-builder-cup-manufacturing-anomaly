// StreakGate: live CAM-EOL optical gate — N consecutive good parts; any defect resets the streak to 0 (backend good_streak).
import React, { useEffect, useRef, useState } from 'react';
import type { IncidentStatus } from '../../types';

interface StreakGateProps {
  count: number;
  target: number;
  status: IncidentStatus;
}

interface ResetEvent {
  at: string;
  lost: number;
}

export default function StreakGate({ count, target, status }: StreakGateProps): React.ReactElement {
  const prev = useRef<number>(count);
  const [resets, setResets] = useState<ResetEvent[]>([]);

  // The gatekeeper streams good_streak; a drop means a defective part zeroed the streak.
  useEffect(() => {
    if (count < prev.current && prev.current > 0) {
      setResets((r) => [...r, { at: new Date().toTimeString().substring(0, 8), lost: prev.current }]);
    }
    prev.current = count;
  }, [count]);

  const passed = count >= target;
  const live = status === 'verifying' && !passed;
  const lastReset = resets[resets.length - 1];

  return (
    <div className={`inset col streak-gate ${passed ? 'tone-green' : ''}`} style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: passed ? 'var(--green)' : 'var(--accent)' }}>
            photo_camera
          </span>
          <span className="eyebrow" style={{ color: 'var(--text)' }}>
            Optical streak gate · CAM-EOL
          </span>
          {live && (
            <span className="chip chip-accent">
              <span className="dot animate-pulse-glow" />
              Live
            </span>
          )}
          {passed && <span className="chip chip-green">Passed</span>}
          {!live && !passed && <span className="chip">Starts after repair</span>}
        </span>
        <span className="mono" style={{ fontWeight: 700, fontSize: '1.15rem', color: passed ? '#0e8a43' : 'var(--ink)' }}>
          {count}
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>/{target}</span>
        </span>
      </div>

      <div role="img" aria-label={`${count} of ${target} consecutive good parts`} className="proof-grid">
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className={live && i === count ? 'streak-next' : undefined} style={{ background: i < count ? '#22b573' : 'rgba(118,128,160,0.16)' }} />
        ))}
      </div>

      {lastReset ? (
        <div className="row streak-reset" role="status">
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
            restart_alt
          </span>
          Defect at {lastReset.at} reset the streak from {lastReset.lost} to 0
          {resets.length > 1 ? ` · ${resets.length} resets so far` : ''}
        </div>
      ) : (
        <span className="kpi-hint">
          {passed
            ? `${target} defect-free parts in a row — the incident closed on product evidence.`
            : `Needs ${target} defect-free parts in a row. Any defect resets the count to 0.`}
        </span>
      )}
    </div>
  );
}
