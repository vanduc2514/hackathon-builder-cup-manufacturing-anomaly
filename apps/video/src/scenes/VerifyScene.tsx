import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, INK_BUTTON, RADIUS, eyebrow, fadeUp, progress } from '../theme';

const TARGET = 50;
const FILL_FROM = 12;
const FILL_TO = 72;
const UNLOCK_AT = 76;
const PRESS_AT = 94;

const VerifySceneInner = ({ caption }: { caption: string }): React.ReactElement => {
  const frame = useCurrentFrame();
  const count = Math.floor(interpolate(frame, [FILL_FROM, FILL_TO], [0, TARGET], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const unlocked = frame >= UNLOCK_AT;
  const press = frame >= PRESS_AT && frame < PRESS_AT + 6 ? 0.96 : 1;
  const signed = progress(frame, PRESS_AT + 4, PRESS_AT + 16);

  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 120, top: 80, ...fadeUp(frame, 0) }}>
        <div style={eyebrow}>4 · Verify &amp; sign off</div>
        <div style={{ fontFamily: FONT.display, fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8 }}>
          Closed on product evidence
        </div>
      </div>

      <GlassCard
        tone={count >= TARGET ? 'success' : 'neutral'}
        style={{ position: 'absolute', left: 120, top: 270, width: 1000, ...fadeUp(frame, 4, 40) }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: C.ink }}>Good parts in a row</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 64, fontWeight: 700, color: count >= TARGET ? C.successText : C.ink }}>
            {count}/{TARGET}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 12 }}>
          {Array.from({ length: TARGET }, (_, i) => (
            <div
              key={i}
              style={{
                height: 52,
                borderRadius: RADIUS.sm,
                background: i < count ? C.streak : 'rgba(15,23,42,.06)',
                scale: i === count - 1 ? '1.08' : '1',
              }}
            />
          ))}
        </div>
      </GlassCard>

      <GlassCard style={{ position: 'absolute', left: 1180, top: 270, width: 620, ...fadeUp(frame, 10, 40) }}>
        <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: C.ink }}>8D report · INC-T07</div>
        <div style={{ fontFamily: FONT.main, fontSize: 22, color: C.muted, marginTop: 8 }}>Drafted by Incident Scribe</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <Chip tone="neutral">8D</Chip>
          <Chip tone="neutral">Work order</Chip>
          <Chip tone="neutral">SOP update</Chip>
        </div>
        <div
          style={{
            marginTop: 32,
            height: 72,
            borderRadius: RADIUS.lg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: unlocked ? INK_BUTTON : 'rgba(15,23,42,.08)',
            color: unlocked ? '#fff' : C.faint,
            fontFamily: FONT.main,
            fontSize: 26,
            fontWeight: 600,
            scale: `${press}`,
            boxShadow: unlocked ? '0 12px 24px -10px rgba(11,18,32,.5)' : 'none',
          }}
        >
          <svg width={26} height={26} viewBox="0 0 24 24">
            {unlocked ? (
              <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <>
                <rect x={5} y={11} width={14} height={10} rx={2} fill={C.faint} />
                <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke={C.faint} strokeWidth={2.4} />
              </>
            )}
          </svg>
          Approve 8D &amp; Release Line
        </div>
        <div style={{ marginTop: 20, opacity: signed }}>
          <Chip tone="success" dot>Signed by shift leader · line released</Chip>
        </div>
      </GlassCard>

      <Subtitle text={caption} />
    </>
  );
};

export const VerifyScene = Interactive.create({
  Component: VerifySceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: { type: 'string', default: 'Closed only when 50 good parts in a row prove it.', description: 'Subtitle' },
  },
});
