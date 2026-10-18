import React from 'react';
import { C, GLASS_SHADOW, RADIUS } from '../theme';

type Tone = 'neutral' | 'danger' | 'success' | 'accent';

const TONE_FILL: Record<Tone, { background: string; border: string }> = {
  neutral: { background: C.glassBg, border: C.glassBorder },
  danger: {
    background: 'linear-gradient(160deg, rgba(255,241,242,.85), rgba(255,228,230,.7))',
    border: 'rgba(229,72,77,.28)',
  },
  success: {
    background: 'linear-gradient(160deg, rgba(236,253,243,.85), rgba(220,252,231,.7))',
    border: 'rgba(18,161,80,.28)',
  },
  accent: {
    background: 'linear-gradient(160deg, rgba(238,240,255,.88), rgba(226,229,255,.72))',
    border: 'rgba(91,91,240,.28)',
  },
};

interface GlassCardProps {
  children: React.ReactNode;
  tone?: Tone;
  style?: React.CSSProperties;
}

/** GlassCard surface (DESIGN.md §2.4) with optional tone tint. */
export default function GlassCard({ children, tone = 'neutral', style }: GlassCardProps): React.ReactElement {
  const fill = TONE_FILL[tone];
  return (
    <div
      style={{
        background: fill.background,
        border: `1.5px solid ${fill.border}`,
        borderRadius: RADIUS.xl,
        boxShadow: GLASS_SHADOW,
        backdropFilter: 'blur(28px) saturate(180%)',
        padding: 36,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
