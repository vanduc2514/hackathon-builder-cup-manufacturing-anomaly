import React from 'react';
import { Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';

const ROWS: [string, string, string][] = [
  ['Starts when', 'a machine sensor crosses a limit', 'the first defective part is seen'],
  ['Blind to', 'material, environment and method faults', 'nothing: every cause marks the product'],
  ['Search space', 'the whole line, every signal', 'one machine, one tool, one time window'],
  ['Closes when', 'the technician says "done"', '50 good parts in a row prove it'],
];

const InsightSceneInner = ({ caption, captionFrom }: { caption: string; captionFrom: number }): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 160, right: 160, top: 110 }}>
        <div style={{ ...eyebrow, ...fadeUp(frame, 0) }}>Our insight</div>
        <div style={{ fontFamily: FONT.display, fontSize: 76, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8, ...fadeUp(frame, 2) }}>
          Start from the product, not the sensor
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr', gap: 18, marginTop: 48 }}>
          <div />
          <div style={{ ...eyebrow, fontSize: 20, ...fadeUp(frame, 6) }}>Sensor-first monitoring</div>
          <div style={{ ...eyebrow, fontSize: 20, color: C.accent, ...fadeUp(frame, 6) }}>Kaizen Agent: product-first</div>
          {ROWS.map(([label, before, after], i) => (
            <React.Fragment key={label}>
              <div style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, color: C.ink2, alignSelf: 'center', ...fadeUp(frame, 10 + i * 6) }}>
                {label}
              </div>
              <GlassCard style={{ padding: '20px 26px', ...fadeUp(frame, 10 + i * 6) }}>
                <span style={{ fontFamily: FONT.main, fontSize: 28, color: C.muted }}>{before}</span>
              </GlassCard>
              <GlassCard tone="accent" style={{ padding: '20px 26px', ...fadeUp(frame, 13 + i * 6) }}>
                <span style={{ fontFamily: FONT.main, fontSize: 28, fontWeight: 600, color: C.ink }}>{after}</span>
              </GlassCard>
            </React.Fragment>
          ))}
        </div>
      </div>
      <Subtitle text={caption} from={captionFrom} />
    </>
  );
};

export const InsightScene = Interactive.create({
  Component: InsightSceneInner,
  layout: 'absolute-fill',
});
