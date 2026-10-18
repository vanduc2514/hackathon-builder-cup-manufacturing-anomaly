import React from 'react';
import { Video } from '@remotion/media';
import { Interactive, staticFile } from 'remotion';
import { INTRO } from '../intro/introTimeline';
import { FPS } from './timeline';
import Voiceover from './Voiceover';

/** Where the film's own "KAIZEN AGENT" title card begins; the film is used only up to here. */
const FILM_END_SECONDS = 26.83;

/** Opening film (problem story), retimed to the re-voiced Gemini TTS lines; ends on the notebook shot. */
const IntroSceneInner = (): React.ReactElement => (
  <>
    {/* The film's own audio mixes its old voice-over with the music, so it is muted. */}
    <Video
      src={staticFile('footage/clips/intro.mp4')}
      muted
      trimBefore={0}
      playbackRate={FILM_END_SECONDS / (INTRO.totalFrames / FPS)}
      objectFit="cover"
      style={{ width: '100%', height: '100%' }}
    />
    <Voiceover lines={Object.values(INTRO.lines)} />
  </>
);

export const IntroScene = Interactive.create({
  Component: IntroSceneInner,
  layout: 'absolute-fill',
});
