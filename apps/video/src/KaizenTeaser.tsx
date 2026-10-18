import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { DetectScene } from './scenes/DetectScene';
import { OutroScene } from './scenes/OutroScene';
import { ProblemScene } from './scenes/ProblemScene';
import { ResolveScene } from './scenes/ResolveScene';
import { TraceScene } from './scenes/TraceScene';
import { VerifyScene } from './scenes/VerifyScene';

/** 30 s animated teaser: 960 scene frames − 5 × 12 fade frames = 900 frames @ 30 fps. */
export default function KaizenTeaser(): React.ReactElement {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Problem" durationInFrames={132}>
        <ProblemScene name="Problem" caption="Machines don't stop. They silently make scrap." />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Detect" durationInFrames={162}>
        <DetectScene name="Detect" caption="Gemma 3 at the edge catches the first scratch in under 50 ms." />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Trace" durationInFrames={192}>
        <TraceScene
          name="Trace"
          caption="AI agents trace it back to CNC-02 and tool T07."
          captionRootCause="Spindle vibration +154%. Root cause: worn tool, 95% confident."
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Resolve" durationInFrames={192}>
        <ResolveScene name="Resolve" caption="A Gemini Live copilot guides the fix in the technician's own language." />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Verify" durationInFrames={132}>
        <VerifyScene name="Verify" caption="Closed only when 50 good parts in a row prove it." />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={150}>
        <OutroScene name="Outro" caption="240 parts saved. 45 min downtime avoided. Every fix becomes knowledge." />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
}
