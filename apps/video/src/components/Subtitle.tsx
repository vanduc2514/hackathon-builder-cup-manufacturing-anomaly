import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, GLASS_SHADOW, progress } from '../theme';

interface SubtitleProps {
  text: string;
  /** Frame (scene-relative) the line appears. */
  from?: number;
  /** Frame (scene-relative) the line leaves; defaults to scene end. */
  to?: number;
}

/** Burned-in English subtitle on a frosted glass strip, bottom-centred. */
export default function Subtitle({ text, from = 8, to }: SubtitleProps): React.ReactElement | null {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const end = to ?? durationInFrames;
  if (frame < from || frame >= end) return null;
  const opacity = Math.min(progress(frame, from, from + 10), 1 - progress(frame, end - 8, end));
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 64,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        translate: `0 ${(1 - progress(frame, from, from + 12)) * 16}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1760,
          padding: '18px 36px',
          borderRadius: 20,
          background: C.glassBgStrong,
          border: `1.5px solid ${C.glassBorder}`,
          boxShadow: GLASS_SHADOW,
          backdropFilter: 'blur(28px) saturate(180%)',
          fontFamily: FONT.main,
          fontSize: 42,
          fontWeight: 600,
          lineHeight: 1.25,
          color: C.ink,
          textAlign: 'center',
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </div>
    </div>
  );
}
