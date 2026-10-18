import type { CSSProperties } from 'react';
import { Easing, interpolate } from 'remotion';
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Lumina Slate tokens (docs/DESIGN.md §2.3–2.7), scaled for a 1920×1080 frame.

const inter = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'vietnamese'] });
const geist = loadGeist('normal', { weights: ['600', '700'], subsets: ['latin'] });
const mono = loadMono('normal', { weights: ['500', '700'], subsets: ['latin'] });

export const FONT = {
  main: inter.fontFamily,
  display: geist.fontFamily,
  mono: mono.fontFamily,
};

export const C = {
  bgApp: '#eef1fb',
  ink: '#0b1220',
  ink2: '#1e2638',
  text: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  hair: 'rgba(15, 23, 42, .07)',
  hairStrong: 'rgba(15, 23, 42, .12)',
  accent: '#5b5bf0',
  accent2: '#7c6cff',
  accentSoft: 'rgba(91, 91, 240, .1)',
  accentRing: 'rgba(91, 91, 240, .28)',
  danger: '#e5484d',
  dangerSoft: 'rgba(229, 72, 77, .1)',
  dangerText: '#c9343a',
  warning: '#f5a524',
  warningSoft: 'rgba(245, 165, 36, .12)',
  warningText: '#b4710a',
  success: '#12a150',
  successSoft: 'rgba(18, 161, 80, .1)',
  successText: '#0e8a43',
  streak: '#22b573',
  glassBg: 'rgba(255, 255, 255, .58)',
  glassBgStrong: 'rgba(255, 255, 255, .78)',
  glassBorder: 'rgba(255, 255, 255, .75)',
  inset: 'rgba(244, 246, 255, .7)',
};

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };

export const GLASS_SHADOW =
  '0 1px 1px rgba(15,23,42,.03), 0 8px 24px -6px rgba(30,41,90,.1), 0 24px 48px -24px rgba(30,41,90,.12), inset 0 1px 0 rgba(255,255,255,.8)';

export const DARK_GLASS = 'linear-gradient(160deg, rgba(17,24,39,.92), rgba(30,27,75,.9))';

export const INK_BUTTON = 'linear-gradient(180deg, #1f2937, #0b1220)';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Eased 0→1 progress between two frames, clamped. */
export function progress(frame: number, start: number, end: number): number {
  return interpolate(frame, [start, end], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** fadeUp entrance (DESIGN.md §2.7) as an inline style. */
export function fadeUp(frame: number, start: number, distance = 24, duration = 18): CSSProperties {
  const p = progress(frame, start, start + duration);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
}

export const eyebrow: CSSProperties = {
  fontFamily: FONT.main,
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.faint,
};
