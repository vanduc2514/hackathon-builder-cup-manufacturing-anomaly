import React from 'react';
import { Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, RADIUS, eyebrow, fadeUp, progress } from '../theme';

const STEPS = [
  'Stop spindle, lock out',
  'Remove worn T07 insert',
  'Fit new WNMG-080408',
  'Torque clamp to 3.5 N·m',
  'Run a first-off part',
];
const STEPS_FROM = 70;
const STEP_EVERY = 18;

function Bubble({
  from,
  frame,
  side,
  children,
}: {
  from: number;
  frame: number;
  side: 'ai' | 'tech';
  children: React.ReactNode;
}): React.ReactElement {
  const ai = side === 'ai';
  return (
    <div
      style={{
        alignSelf: ai ? 'flex-start' : 'flex-end',
        maxWidth: 400,
        padding: '16px 20px',
        borderRadius: 22,
        borderTopLeftRadius: ai ? 6 : 22,
        borderTopRightRadius: ai ? 22 : 6,
        background: ai ? '#fff' : C.ink,
        color: ai ? C.ink : '#fff',
        boxShadow: '0 8px 20px -10px rgba(30,41,90,.3)',
        fontFamily: FONT.main,
        fontSize: 22,
        lineHeight: 1.35,
        ...fadeUp(frame, from, 18, 12),
      }}
    >
      {children}
    </div>
  );
}

const ResolveSceneInner = ({ caption }: { caption: string }): React.ReactElement => {
  const frame = useCurrentFrame();

  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 120, top: 80, ...fadeUp(frame, 0) }}>
        <div style={eyebrow}>3 · Resolve · technician app</div>
        <div style={{ fontFamily: FONT.display, fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8 }}>
          Guided repair, in their language
        </div>
      </div>

      {/* Phone */}
      <div
        style={{
          position: 'absolute',
          left: 220,
          top: 250,
          width: 500,
          height: 640,
          borderRadius: 56,
          padding: 14,
          background: 'linear-gradient(160deg, #1f2937, #0b1220)',
          boxShadow: '0 40px 80px -30px rgba(30,41,90,.45)',
          ...fadeUp(frame, 4, 40),
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 44,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #f4f6fd, #eceffa)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '24px 24px 16px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1.5px solid ${C.hair}` }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                background: `linear-gradient(135deg, ${C.accent}, #14b8a6)`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24">
                <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" fill="#fff" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 700, color: C.ink }}>Copilot</div>
              <div style={{ fontFamily: FONT.main, fontSize: 17, color: C.muted }}>CNC-02 · Bay 4</div>
            </div>
            <Chip tone="accent" style={{ fontSize: 17, padding: '6px 12px' }}>Gemini Live</Chip>
          </div>
          <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Bubble frame={frame} from={14} side="ai">
              Please take a close-up photo of the T07 tool tip.
            </Bubble>
            <Bubble frame={frame} from={36} side="tech">
              <div
                style={{
                  width: 220,
                  height: 120,
                  borderRadius: RADIUS.md,
                  background: 'linear-gradient(145deg, #475569, #1e293b)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <svg width={220} height={120} viewBox="0 0 220 120">
                  <path d="M40 100 L110 24 L180 100 Z" fill="#cbd5e1" />
                  <path d="M96 40 L110 24 L124 40 L118 46 L102 46 Z" fill={C.warning} opacity={0.85} />
                </svg>
              </div>
              <div style={{ fontSize: 17, opacity: 0.75, marginTop: 6 }}>Photo · tool tip T07</div>
            </Bubble>
            <Bubble frame={frame} from={56} side="ai">
              The insert is worn. Step 1: stop the spindle and lock out.
            </Bubble>
          </div>
        </div>
      </div>

      {/* OEM steps */}
      <GlassCard style={{ position: 'absolute', left: 820, top: 250, width: 880, ...fadeUp(frame, STEPS_FROM - 10, 40) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: C.ink }}>Tool change · CNC-02</div>
          <Chip tone="neutral">Cited: OEM manual p.42</Chip>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((s, i) => {
            const doneAt = STEPS_FROM + 6 + i * STEP_EVERY;
            const done = progress(frame, doneAt, doneAt + 8);
            const active = frame >= doneAt - STEP_EVERY && frame < doneAt;
            return (
              <div
                key={s}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '14px 20px',
                  borderRadius: RADIUS.lg,
                  background: active ? C.accentSoft : C.inset,
                  border: `1.5px solid ${active ? C.accentRing : 'rgba(255,255,255,.9)'}`,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    display: 'grid',
                    placeItems: 'center',
                    background: done > 0.5 ? C.success : 'transparent',
                    border: `2.5px solid ${done > 0.5 ? C.success : C.hairStrong}`,
                    fontFamily: FONT.mono,
                    fontSize: 20,
                    fontWeight: 700,
                    color: done > 0.5 ? '#fff' : C.muted,
                  }}
                >
                  {done > 0.5 ? (
                    <svg width={22} height={22} viewBox="0 0 24 24">
                      <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div style={{ fontFamily: FONT.main, fontSize: 28, fontWeight: 500, color: done > 0.5 ? C.muted : C.ink }}>{s}</div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <Subtitle text={caption} />
    </>
  );
};

export const ResolveScene = Interactive.create({
  Component: ResolveSceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: {
      type: 'string',
      default: "A Gemini Live copilot guides the fix in the technician's own language.",
      description: 'Subtitle',
    },
  },
});
