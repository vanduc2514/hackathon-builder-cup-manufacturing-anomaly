import React from 'react';
import { AbsoluteFill, Img, Interactive, interpolate, staticFile, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import Subtitle from '../components/Subtitle';
import { fadeUp, progress } from '../theme';
import type { Caption } from './timeline';

interface MeetSceneProps {
  captions: Caption[];
}

/** "Meet kAIzen": the team logo and the problem Kaizen Agent was built to solve. */
const MeetSceneInner = ({ captions }: MeetSceneProps): React.ReactElement => {
  const frame = useCurrentFrame();
  const logo = progress(frame, 0, 24);
  return (
    <>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36, paddingBottom: 120 }}>
        <Img
          src={staticFile('brand/team-logo.png')}
          style={{ width: 560, height: 'auto', opacity: logo, scale: `${interpolate(logo, [0, 1], [0.9, 1])}` }}
        />
        <div style={{ display: 'flex', gap: 16, ...fadeUp(frame, 20) }}>
          <Chip tone="accent" style={{ fontSize: 24 }}>
            Team kAIzen
          </Chip>
          <Chip tone="accent" style={{ fontSize: 24 }}>
            Manufacturing · Intelligent Operations &amp; Industrial Efficiency
          </Chip>
        </div>
      </AbsoluteFill>
      {captions.map((c) => (
        <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
      ))}
    </>
  );
};

export const MeetScene = Interactive.create({
  Component: MeetSceneInner,
  layout: 'absolute-fill',
});
