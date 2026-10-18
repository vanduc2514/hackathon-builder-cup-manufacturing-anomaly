import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import Chip from '../components/Chip';
import { C, FONT, eyebrow, fadeUp } from '../theme';
import { footageRate } from './ZoomVideo';

interface ShotChromeProps {
  /** e.g. "1 · Detect" */
  step: string;
  title: string;
  /** Google services working in this shot. */
  services: string[];
  /** Source seconds shown by the shot, for the honest speed tag. */
  start?: number;
  end?: number;
}

/** Step heading (top-left), speed tag (top-right) and the Google services rail (right edge). */
export default function ShotChrome({ step, title, services, start, end }: ShotChromeProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const rate = start !== undefined && end !== undefined ? footageRate(start, end, durationInFrames, fps) : 1;

  return (
    <>
      <div style={{ position: 'absolute', left: 80, top: 26, ...fadeUp(frame, 0, 12, 12) }}>
        <div style={{ ...eyebrow, color: C.accent }}>{step}</div>
        <div style={{ fontFamily: FONT.display, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: C.ink, marginTop: 2 }}>
          {title}
        </div>
      </div>
      {rate >= 1.3 ? (
        <div style={{ position: 'absolute', right: 80, top: 44, ...fadeUp(frame, 4, 12, 12) }}>
          <Chip tone="neutral" mono style={{ fontSize: 20 }}>
            {rate.toFixed(1)}× speed
          </Chip>
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 1630, top: 150, width: 270, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ ...eyebrow, fontSize: 15, ...fadeUp(frame, 4, 12, 12) }}>Google Cloud at work</span>
        {services.map((s, i) => (
          <Chip key={s} tone="accent" dot style={{ fontSize: 20, ...fadeUp(frame, 6 + i * 3, 12, 12) }}>
            {s}
          </Chip>
        ))}
      </div>
    </>
  );
}
