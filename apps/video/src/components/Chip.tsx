import React from 'react';
import { C, FONT, RADIUS } from '../theme';

type Tone = 'neutral' | 'danger' | 'success' | 'accent' | 'warning' | 'inverse';

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'rgba(255,255,255,.7)', fg: C.text, border: C.hairStrong },
  danger: { bg: C.dangerSoft, fg: C.dangerText, border: 'rgba(229,72,77,.3)' },
  success: { bg: C.successSoft, fg: C.successText, border: 'rgba(18,161,80,.3)' },
  accent: { bg: C.accentSoft, fg: C.accent, border: C.accentRing },
  warning: { bg: C.warningSoft, fg: C.warningText, border: 'rgba(245,165,36,.35)' },
  inverse: { bg: C.ink, fg: '#fff', border: C.ink },
};

interface ChipProps {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  mono?: boolean;
  style?: React.CSSProperties;
}

/** Chip pill (DESIGN.md §3.1) with optional leading StatusDot. */
export default function Chip({ children, tone = 'neutral', dot = false, mono = false, style }: ChipProps): React.ReactElement {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 18px',
        borderRadius: RADIUS.full,
        background: t.bg,
        color: t.fg,
        border: `1.5px solid ${t.border}`,
        fontFamily: mono ? FONT.mono : FONT.main,
        fontSize: 22,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot ? <span style={{ width: 10, height: 10, borderRadius: 5, background: t.fg }} /> : null}
      {children}
    </span>
  );
}
