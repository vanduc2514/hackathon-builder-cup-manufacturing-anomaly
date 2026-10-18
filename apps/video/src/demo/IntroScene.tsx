import React from 'react';
import { Video } from '@remotion/media';
import { AbsoluteFill, Img, Interactive, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import Backdrop from '../components/Backdrop';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp, progress } from '../theme';

/** Length of the intro film used, and where its own title card starts (it is replaced by the kAIzen card). */
export const INTRO_SECONDS = 31.3;
const TITLE_AT_SECONDS = 26.83;

// Narration of the intro film (Gemini transcript), timed to its voice track.
const CAPTIONS: [from: number, to: number, text: string][] = [
  [0.2, 2.8, 'The machine never stopped.'],
  [3.0, 5.8, 'No alarm went off.'],
  [6.0, 12.6, 'But for two hours, it quietly made scrap.'],
  [13.0, 20.6, 'In small and mid-sized factories, defects are found at the end of the shift or by the customer.'],
  [21.0, 24.7, 'Finding the cause takes hours.'],
  [25.0, 31.3, 'The one expert who knows is on another shift, and the manuals are in English or Japanese.'],
];

/** kAIzen title card in the Lumina Slate style: app logo tile + wordmark over the pastel backdrop. */
function TitleCard(): React.ReactElement {
  const frame = useCurrentFrame();
  const logo = progress(frame, 2, 22);
  return (
    <AbsoluteFill style={{ opacity: progress(frame, 0, 8) }}>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Img
            src={staticFile('brand/logo.png')}
            style={{
              width: 168,
              height: 168,
              borderRadius: 44,
              background: '#000',
              boxShadow: `0 30px 60px -20px rgba(11,18,32,.55), 0 0 ${interpolate(logo, [0, 1], [0, 80])}px rgba(91,91,240,.35)`,
              scale: `${interpolate(logo, [0, 1], [0.6, 1])}`,
              opacity: logo,
            }}
          />
          <span style={{ fontFamily: FONT.display, fontSize: 176, fontWeight: 800, letterSpacing: '-0.04em', color: C.ink, ...fadeUp(frame, 10, 30, 20) }}>
            k
            <span
              style={{
                background: `linear-gradient(120deg, ${C.accent}, ${C.accent2})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              AI
            </span>
            zen
          </span>
        </div>
        <div style={{ ...eyebrow, fontSize: 22, color: C.muted, ...fadeUp(frame, 24, 16, 16) }}>Kaizen Agent · AI Builder Cup 2026</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Opening film (problem story, with its own narration and music); its title card is replaced by the kAIzen card. */
const IntroSceneInner = (): React.ReactElement => {
  const { fps, durationInFrames } = useVideoConfig();
  return (
    <>
      <Video
        src={staticFile('footage/clips/intro.mp4')}
        trimAfter={durationInFrames}
        objectFit="cover"
        style={{ width: '100%', height: '100%' }}
        // Fade the music out over the last 0.6 s so the cut into the demo is clean.
        volume={(f) => interpolate(f, [durationInFrames - 18, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
      <Sequence name="kAIzen title card" from={Math.round(TITLE_AT_SECONDS * fps)}>
        <TitleCard />
      </Sequence>
      {CAPTIONS.map(([from, to, text]) => (
        <Subtitle key={from} text={text} from={Math.round(from * fps)} to={Math.round(to * fps)} />
      ))}
    </>
  );
};

export const IntroScene = Interactive.create({
  Component: IntroSceneInner,
  layout: 'absolute-fill',
});
