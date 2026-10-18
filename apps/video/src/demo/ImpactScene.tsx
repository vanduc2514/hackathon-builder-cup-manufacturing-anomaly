import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';

// Values from the Impact card of the signed 8D report (INC-3A510E, prod).
const KPIS = [
  { value: 240, prefix: '', unit: 'parts', label: 'scrap avoided' },
  { value: 45, prefix: '', unit: 'min', label: 'downtime saved' },
  { value: 25, prefix: '', unit: 'kg CO₂e', label: 'emissions avoided' },
  { value: 3600, prefix: '$', unit: '', label: 'cost avoided' },
];

const ImpactSceneInner = ({ caption, captionFrom }: { caption: string; captionFrom: number }): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 140, right: 140, top: 190 }}>
        <div style={{ ...eyebrow, ...fadeUp(frame, 0) }}>Impact of this one incident</div>
        <div style={{ fontFamily: FONT.display, fontSize: 76, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8, ...fadeUp(frame, 2) }}>
          Every incident pays back
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 56 }}>
          {KPIS.map((k, i) => {
            const v = Math.round(interpolate(frame, [12 + i * 8, 50 + i * 8], [0, k.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
            return (
              <GlassCard key={k.label} tone="success" style={{ ...fadeUp(frame, 8 + i * 8, 40) }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 80, fontWeight: 700, color: C.successText, letterSpacing: '-0.04em' }}>
                  {k.prefix}
                  {v.toLocaleString('en-US')}
                </div>
                <div style={{ fontFamily: FONT.main, fontSize: 28, fontWeight: 600, color: C.ink2 }}>{k.unit}</div>
                <div style={{ fontFamily: FONT.main, fontSize: 26, color: C.text, marginTop: 4 }}>{k.label}</div>
              </GlassCard>
            );
          })}
        </div>
        <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.muted, marginTop: 28, ...fadeUp(frame, 50) }}>
          From the Impact card of the signed 8D report, INC-3A510E · CNC tool-wear scenario
        </div>
      </div>
      <Subtitle text={caption} from={captionFrom} />
    </>
  );
};

export const ImpactScene = Interactive.create({
  Component: ImpactSceneInner,
  layout: 'absolute-fill',
});
