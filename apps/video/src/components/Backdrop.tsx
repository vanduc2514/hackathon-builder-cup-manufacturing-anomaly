import React from 'react';
import { AbsoluteFill } from 'remotion';

/** AppBackdrop (DESIGN.md §2.4): pastel washes + faded 24px dot grid. */
export default function Backdrop(): React.ReactElement {
  return (
    <AbsoluteFill
      style={{
        background: [
          'radial-gradient(900px 700px at 12% 8%, rgba(139,132,255,.28), transparent 70%)',
          'radial-gradient(800px 640px at 92% 14%, rgba(96,165,250,.22), transparent 70%)',
          'radial-gradient(900px 700px at 80% 96%, rgba(244,170,210,.2), transparent 70%)',
          'radial-gradient(760px 600px at 6% 92%, rgba(125,211,252,.18), transparent 70%)',
          'linear-gradient(180deg, #f4f6fd, #eceffa)',
        ].join(','),
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,.07) 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
    </AbsoluteFill>
  );
}
