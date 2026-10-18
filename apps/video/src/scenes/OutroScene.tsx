import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp, progress } from '../theme';

const TITLE_AT = 80;

const KPIS = [
  { value: 240, prefix: '', unit: 'parts', label: 'scrap avoided' },
  { value: 45, prefix: '', unit: 'min', label: 'downtime saved' },
  { value: 3600, prefix: '$', unit: '', label: 'cost avoided' },
];

const STACK = ['Gemini', 'Gemini Live', 'Gemma 3', 'Google ADK', 'Vertex AI Search', 'BigQuery', 'Cloud Run'];

const OutroSceneInner = ({ caption }: { caption: string }): React.ReactElement => {
  const frame = useCurrentFrame();
  const kpiOut = 1 - progress(frame, TITLE_AT - 12, TITLE_AT);

  return (
    <>
      <Backdrop />

      {frame < TITLE_AT ? (
        <div style={{ position: 'absolute', left: 120, right: 120, top: 200, opacity: kpiOut }}>
          <div style={{ ...eyebrow, ...fadeUp(frame, 0) }}>Impact per incident · CNC tool wear</div>
          <div style={{ display: 'flex', gap: 40, marginTop: 32 }}>
            {KPIS.map((k, i) => {
              const v = Math.round(interpolate(frame, [6 + i * 8, 40 + i * 8], [0, k.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
              return (
                <GlassCard key={k.label} tone="success" style={{ flex: 1, ...fadeUp(frame, 4 + i * 8, 40) }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: 96, fontWeight: 700, color: C.successText, letterSpacing: '-0.04em' }}>
                    {k.prefix}
                    {v.toLocaleString('en-US')}
                    {k.unit ? <span style={{ fontSize: 40, marginLeft: 12 }}>{k.unit}</span> : null}
                  </div>
                  <div style={{ fontFamily: FONT.main, fontSize: 30, color: C.text, marginTop: 8 }}>{k.label}</div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: 60,
          }}
        >
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 140,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              background: `linear-gradient(120deg, ${C.ink} 30%, ${C.accent} 70%, ${C.accent2})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              ...fadeUp(frame, TITLE_AT, 30, 20),
            }}
          >
            Kaizen Agent
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 52, fontWeight: 600, color: C.ink2, marginTop: 8, ...fadeUp(frame, TITLE_AT + 8) }}>
            The product tells the truth. AI traces it back.
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 56, flexWrap: 'wrap', justifyContent: 'center', ...fadeUp(frame, TITLE_AT + 18) }}>
            {STACK.map((s) => (
              <Chip key={s} tone="neutral" style={{ fontSize: 24, padding: '10px 22px' }}>
                {s}
              </Chip>
            ))}
          </div>
          <div style={{ ...eyebrow, marginTop: 40, ...fadeUp(frame, TITLE_AT + 24) }}>Built on Google Cloud</div>
        </div>
      )}

      <Subtitle text={caption} to={TITLE_AT - 4} />
    </>
  );
};

export const OutroScene = Interactive.create({
  Component: OutroSceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: {
      type: 'string',
      default: '240 parts saved. 45 min downtime avoided. Every fix becomes knowledge.',
      description: 'Subtitle',
    },
  },
});
