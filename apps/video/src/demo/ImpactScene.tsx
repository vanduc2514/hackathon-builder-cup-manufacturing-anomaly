import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';
import type { Caption } from './timeline';

// Benchmark-based estimate from the Impact card of the signed 8D report (INC-1028C4, prod).
const KPIS = [
  { value: 240, prefix: '', unit: 'parts', label: 'scrap avoided' },
  { value: 45, prefix: '', unit: 'min', label: 'downtime saved' },
  { value: 25, prefix: '', unit: 'kg CO₂e', label: 'emissions avoided' },
  { value: 3600, prefix: '$', unit: '', label: 'cost avoided' },
];

const ImpactSceneInner = ({ captions }: { captions: Caption[] }): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 140, right: 140, top: 190 }}>
        <div style={{ ...eyebrow, ...fadeUp(frame, 0) }}>Estimated impact · if this ran on a real line</div>
        <div style={{ fontFamily: FONT.display, fontSize: 76, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8, ...fadeUp(frame, 2) }}>
          Every incident pays back
        </div>
        <div style={{ fontFamily: FONT.main, fontSize: 30, color: C.text, marginTop: 10, ...fadeUp(frame, 4) }}>
          Our estimate for the CNC tool-wear scenario, per incident
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 56 }}>
          {KPIS.map((k, i) => {
            const v = Math.round(interpolate(frame, [12 + i * 8, 50 + i * 8], [0, k.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
            return (
              <GlassCard key={k.label} tone="success" style={{ ...fadeUp(frame, 8 + i * 8, 40) }}>
                <div style={{ ...eyebrow, fontSize: 15, color: C.successText }}>est. ≈</div>
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
        <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.muted, marginTop: 28, lineHeight: 1.5, ...fadeUp(frame, 50) }}>
          Assumption: the defect is caught about 2 hours before end-of-shift QC on one CNC line.
          <br />
          Benchmark-based estimate (line speed, scrap cost, energy and material factors), as written to the incident's Impact card.
        </div>
      </div>
      {captions.map((c) => (
        <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
      ))}
    </>
  );
};

export const ImpactScene = Interactive.create({
  Component: ImpactSceneInner,
  layout: 'absolute-fill',
});
