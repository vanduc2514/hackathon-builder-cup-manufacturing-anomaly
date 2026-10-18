import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, RADIUS, eyebrow, fadeUp, progress } from '../theme';

const PITCH = 170;
const SPEED = 7;
const SCRATCH_FROM_FRAME = 24;

function clock(frame: number): string {
  // 09:40 → 17:00 over the scene.
  const minutes = Math.round(interpolate(frame, [10, 110], [9 * 60 + 40, 17 * 60], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function Part({ scratched }: { scratched: boolean }): React.ReactElement {
  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: RADIUS.lg,
        background: 'linear-gradient(145deg, #f8fafc, #cbd5e1 55%, #e2e8f0)',
        border: `2px solid ${scratched ? 'rgba(229,72,77,.55)' : 'rgba(255,255,255,.9)'}`,
        boxShadow: '0 10px 20px -8px rgba(30,41,90,.25), inset 0 2px 0 rgba(255,255,255,.9)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 34, borderRadius: 30, background: 'radial-gradient(#94a3b8, #e2e8f0)' }} />
      {scratched ? (
        <svg width={120} height={120} style={{ position: 'absolute', inset: 0 }}>
          <path d="M22 30 L96 84" stroke={C.danger} strokeWidth={4} strokeLinecap="round" />
          <path d="M30 22 L90 70" stroke={C.danger} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
        </svg>
      ) : null}
    </div>
  );
}

const ProblemSceneInner = ({ caption }: { caption: string }): React.ReactElement => {
  const frame = useCurrentFrame();
  const shift = frame * SPEED;
  const scrap = Math.round(interpolate(frame, [SCRATCH_FROM_FRAME, 115], [0, 312], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const spin = frame * 24;

  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 120, top: 96, ...fadeUp(frame, 0) }}>
        <div style={eyebrow}>A typical shift today</div>
        <div style={{ fontFamily: FONT.display, fontSize: 84, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 12 }}>
          Hours of invisible scrap
        </div>
      </div>

      <GlassCard style={{ position: 'absolute', right: 120, top: 96, display: 'flex', gap: 40, alignItems: 'center', ...fadeUp(frame, 6) }}>
        <div>
          <div style={eyebrow}>Shift clock</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 56, fontWeight: 700, color: C.ink }}>{clock(frame)}</div>
        </div>
        <div style={{ width: 1.5, alignSelf: 'stretch', background: C.hairStrong }} />
        <div>
          <div style={eyebrow}>Scrap parts</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 56, fontWeight: 700, color: scrap > 0 ? C.danger : C.ink }}>{scrap}</div>
        </div>
      </GlassCard>

      {/* Machine */}
      <GlassCard style={{ position: 'absolute', left: 120, top: 380, width: 360, ...fadeUp(frame, 4) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: FONT.display, fontSize: 40, fontWeight: 700, color: C.ink }}>CNC-02</div>
          <svg width={72} height={72} viewBox="0 0 72 72" style={{ rotate: `${spin}deg` }}>
            <circle cx={36} cy={36} r={30} fill="none" stroke={C.ink2} strokeWidth={5} />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <rect key={a} x={33} y={4} width={6} height={14} rx={3} fill={C.ink2} transform={`rotate(${a} 36 36)`} />
            ))}
            <circle cx={36} cy={36} r={8} fill={C.accent} />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <Chip tone="success" dot>Running</Chip>
          <Chip tone="success" dot>Sensors normal</Chip>
        </div>
        <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.muted, marginTop: 20 }}>
          Tool <b style={{ fontFamily: FONT.mono, color: C.ink }}>T07</b> wearing{' '}
          <span style={{ color: C.danger, opacity: progress(frame, SCRATCH_FROM_FRAME, SCRATCH_FROM_FRAME + 10) }}>silently</span>
        </div>
      </GlassCard>

      {/* Conveyor */}
      <div style={{ position: 'absolute', left: 520, right: 120, top: 470, height: 200, overflow: 'hidden', ...fadeUp(frame, 8) }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 150,
            height: 24,
            borderRadius: RADIUS.full,
            background: `repeating-linear-gradient(90deg, rgba(15,23,42,.14) 0 20px, rgba(15,23,42,.06) 20px 40px)`,
            backgroundPositionX: shift,
          }}
        />
        {Array.from({ length: 9 }, (_, i) => {
          const x = i * PITCH + (shift % PITCH) - PITCH;
          const id = i - Math.floor(shift / PITCH);
          const madeAt = (-id * PITCH) / SPEED;
          return (
            <div key={i} style={{ position: 'absolute', left: x, top: 20 }}>
              <Part scratched={madeAt >= SCRATCH_FROM_FRAME - 14} />
            </div>
          );
        })}
      </div>

      <Subtitle text={caption} />
    </>
  );
};

export const ProblemScene = Interactive.create({
  Component: ProblemSceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: { type: 'string', default: "Machines don't stop. They silently make scrap.", description: 'Subtitle' },
  },
});
