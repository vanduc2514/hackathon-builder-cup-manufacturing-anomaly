import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, DARK_GLASS, FONT, RADIUS, eyebrow, fadeUp, progress } from '../theme';

// Defect rate (%) per sample; the last two breach the 3.00% SPC limit.
const RATES = [0.8, 1.1, 0.9, 1.3, 1.0, 1.4, 1.2, 1.9, 2.6, 4.1, 5.8, 7.67];
const UCL = 3.0;
const CHART_W = 760;
const CHART_H = 240;
const Y_MAX = 9;

const DETECT_AT = 46;
const CHART_FROM = 40;
const CHART_TO = 110;
const ALERT_AT = 112;

const DetectSceneInner = ({ caption }: { caption: string }): React.ReactElement => {
  const frame = useCurrentFrame();
  const scanY = interpolate(frame, [12, DETECT_AT], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const found = progress(frame, DETECT_AT, DETECT_AT + 10);
  const drawn = interpolate(frame, [CHART_FROM, CHART_TO], [1, RATES.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pts = RATES.map((r, i) => ({
    x: (i / (RATES.length - 1)) * CHART_W,
    y: CHART_H - (r / Y_MAX) * CHART_H,
    breach: r > UCL,
  }));
  const visible = pts.slice(0, Math.max(1, Math.floor(drawn)));
  const path = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const uclY = CHART_H - (UCL / Y_MAX) * CHART_H;
  const latest = RATES[visible.length - 1];

  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 120, top: 80, ...fadeUp(frame, 0) }}>
        <div style={eyebrow}>1 · Detect</div>
        <div style={{ fontFamily: FONT.display, fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8 }}>
          The product raises the alarm
        </div>
      </div>

      {/* Edge camera (dark surface allowed for camera views) */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 260,
          width: 760,
          height: 560,
          borderRadius: RADIUS.xl,
          background: DARK_GLASS,
          overflow: 'hidden',
          boxShadow: '0 24px 48px -24px rgba(30,41,90,.35)',
          ...fadeUp(frame, 4),
        }}
      >
        <div style={{ position: 'absolute', left: 28, top: 24, display: 'flex', gap: 12 }}>
          <Chip tone="inverse" dot style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.2)' }}>EOL camera · Bay 4</Chip>
        </div>
        {/* Part under inspection */}
        <div
          style={{
            position: 'absolute',
            left: 230,
            top: 130,
            width: 300,
            height: 300,
            borderRadius: 40,
            background: 'linear-gradient(145deg, #f8fafc, #cbd5e1 55%, #e2e8f0)',
            boxShadow: 'inset 0 4px 0 rgba(255,255,255,.9)',
          }}
        >
          <div style={{ position: 'absolute', inset: 90, borderRadius: 70, background: 'radial-gradient(#94a3b8, #e2e8f0)' }} />
          <svg width={300} height={300} style={{ position: 'absolute', inset: 0 }}>
            <path d="M60 80 L240 210" stroke="#9aa5b8" strokeWidth={6} strokeLinecap="round" />
            <path d="M80 62 L230 180" stroke="#a8b2c3" strokeWidth={3} strokeLinecap="round" />
          </svg>
        </div>
        {/* Scan line */}
        {found < 1 ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${scanY}%`,
              height: 3,
              background: 'linear-gradient(90deg, transparent, #7c6cff, transparent)',
              opacity: 1 - found,
            }}
          />
        ) : null}
        {/* Detection box */}
        <div
          style={{
            position: 'absolute',
            left: 270,
            top: 190,
            width: 230,
            height: 170,
            border: `4px solid ${C.danger}`,
            borderRadius: RADIUS.md,
            opacity: found,
            scale: `${interpolate(found, [0, 1], [1.25, 1])}`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -52,
              left: -4,
              padding: '6px 14px',
              borderRadius: RADIUS.sm,
              background: C.danger,
              color: '#fff',
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            SCRATCH · 0.97
          </div>
        </div>
        <div style={{ position: 'absolute', left: 28, bottom: 24, display: 'flex', gap: 12, opacity: found }}>
          <Chip tone="accent" style={{ background: 'rgba(124,108,255,.25)', color: '#fff', borderColor: 'rgba(124,108,255,.5)' }}>
            Gemma 3 · on-prem edge
          </Chip>
          <Chip mono tone="inverse" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.2)' }}>
            38 ms
          </Chip>
        </div>
      </div>

      {/* SPC chart */}
      <GlassCard style={{ position: 'absolute', left: 940, top: 260, width: 860, ...fadeUp(frame, CHART_FROM - 10) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 600, color: C.ink }}>Defect rate · SPC</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 44, fontWeight: 700, color: latest > UCL ? C.danger : C.ink }}>
            {latest.toFixed(2)}%
          </div>
        </div>
        <svg width={CHART_W + 20} height={CHART_H + 20} style={{ marginTop: 16, overflow: 'visible' }}>
          <line x1={0} x2={CHART_W} y1={uclY} y2={uclY} stroke={C.danger} strokeWidth={2.5} strokeDasharray="10 8" />
          <text x={CHART_W} y={uclY - 12} textAnchor="end" fontFamily={FONT.mono} fontSize={20} fill={C.dangerText}>
            UCL 3.00%
          </text>
          <path d={path} fill="none" stroke={C.accent} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          {visible.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.breach ? 9 : 6} fill={p.breach ? C.danger : C.accent} stroke="#fff" strokeWidth={3} />
          ))}
        </svg>
      </GlassCard>

      {/* Incident banner */}
      <GlassCard
        tone="danger"
        style={{
          position: 'absolute',
          left: 940,
          top: 690,
          width: 860,
          padding: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          ...fadeUp(frame, ALERT_AT, 30, 14),
        }}
      >
        <div style={{ width: 64, height: 64, borderRadius: RADIUS.md, background: C.danger, display: 'grid', placeItems: 'center' }}>
          <svg width={36} height={36} viewBox="0 0 24 24">
            <path d="M12 3 L22 20 H2 Z" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
            <path d="M12 9 V14 M12 17 V17.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#9f1d22' }}>Incident opened · Bay 4</div>
          <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.dangerText, marginTop: 4 }}>
            7.67% vs 3.00% limit · tool T07 is scratching parts
          </div>
        </div>
      </GlassCard>

      <Subtitle text={caption} />
    </>
  );
};

export const DetectScene = Interactive.create({
  Component: DetectSceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: {
      type: 'string',
      default: 'Gemma 3 at the edge catches the first scratch in under 50 ms.',
      description: 'Subtitle',
    },
  },
});
