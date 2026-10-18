import React from 'react';
import { Audio, Video } from '@remotion/media';
import { AbsoluteFill, Img, Interactive, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import Backdrop from '../components/Backdrop';
import { C, FONT, eyebrow, fadeUp, progress } from '../theme';
import durations from '../intro/voiceover-durations.json';

/** Intro length: the film up to its own title card, then our kAIzen card held until the last line ends. */
export const INTRO_SECONDS = 33.6;
/** Where the film's own title card starts (covered by the kAIzen card); the film is used up to here. */
const TITLE_AT_SECONDS = 26.83;

// Start (seconds) of each re-voiced intro line, following the film's original narration beats.
const VOICE_AT: Record<keyof typeof durations, number> = {
  'intro-1': 0.3,
  'intro-2': 3.2,
  'intro-3': 6.2,
  'intro-4': 12.0,
  'intro-5': 20.8,
  'intro-6': 24.6,
};

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

/** Opening film (problem story), re-voiced with the demo's Gemini TTS voice; its title card is replaced by the kAIzen card. */
const IntroSceneInner = (): React.ReactElement => {
  const { fps } = useVideoConfig();
  const titleAt = Math.round(TITLE_AT_SECONDS * fps);
  return (
    <>
      {/* The film's own audio mixes its old voice-over with the music, so it is muted. */}
      <Video src={staticFile('footage/clips/intro.mp4')} trimAfter={titleAt + 6} muted objectFit="cover" style={{ width: '100%', height: '100%' }} />
      <Sequence name="kAIzen title card" from={titleAt}>
        <TitleCard />
      </Sequence>
      {Object.entries(VOICE_AT).map(([id, at]) => (
        <Sequence key={id} name={id} from={Math.round(at * fps)} durationInFrames={Math.round((durations[id as keyof typeof durations] + 0.2) * fps)}>
          <Audio src={staticFile(`voiceover/${id}.mp3`)} />
        </Sequence>
      ))}
    </>
  );
};

export const IntroScene = Interactive.create({
  Component: IntroSceneInner,
  layout: 'absolute-fill',
});
