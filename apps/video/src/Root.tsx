import React from 'react';
import { Composition, Folder } from 'remotion';
import KaizenTeaser from './KaizenTeaser';
import KaizenDemo from './demo/KaizenDemo';
import { DEMO } from './demo/demoTimeline';
import KaizenEvidence, { EVIDENCE } from './evidence/KaizenEvidence';
import { DetectScene } from './scenes/DetectScene';
import { OutroScene } from './scenes/OutroScene';
import { ProblemScene } from './scenes/ProblemScene';
import { ResolveScene } from './scenes/ResolveScene';
import { TraceScene } from './scenes/TraceScene';
import { VerifyScene } from './scenes/VerifyScene';

export default function Root(): React.ReactElement {
  return (
    <>
      <Composition id="KaizenDemo" component={KaizenDemo} durationInFrames={DEMO.totalFrames} fps={30} width={1920} height={1080} />
      <Composition id="KaizenEvidence" component={KaizenEvidence} durationInFrames={EVIDENCE.totalFrames} fps={30} width={1920} height={1080} />
      <Composition id="KaizenTeaser" component={KaizenTeaser} durationInFrames={900} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition
          id="Problem"
          component={ProblemScene}
          durationInFrames={132}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ caption: "Machines don't stop. They silently make scrap." }}
        />
        <Composition
          id="Detect"
          component={DetectScene}
          durationInFrames={162}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ caption: 'Gemma 3 at the edge catches the first scratch in under 50 ms.' }}
        />
        <Composition
          id="Trace"
          component={TraceScene}
          durationInFrames={192}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            caption: 'AI agents trace it back to CNC-02 and tool T07.',
            captionRootCause: 'Spindle vibration +154%. Root cause: worn tool, 95% confident.',
          }}
        />
        <Composition
          id="Resolve"
          component={ResolveScene}
          durationInFrames={192}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ caption: "A Gemini Live copilot guides the fix in the technician's own language." }}
        />
        <Composition
          id="Verify"
          component={VerifyScene}
          durationInFrames={132}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ caption: 'Closed only when 50 good parts in a row prove it.' }}
        />
        <Composition
          id="Outro"
          component={OutroScene}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ caption: '240 parts saved. 45 min downtime avoided. Every fix becomes knowledge.' }}
        />
      </Folder>
    </>
  );
}
