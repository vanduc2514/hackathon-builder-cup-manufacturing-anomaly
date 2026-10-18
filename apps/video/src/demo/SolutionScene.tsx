import React from 'react';
import { AbsoluteFill, Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';
import type { Caption } from './timeline';

// Each step lights up when the narration reaches its verb.
const STEPS: { title: string; caption: string; cue: string }[] = [
  { title: 'Detect', caption: 'on the product', cue: 'spots' },
  { title: 'Trace', caption: 'to the cause', cue: 'traces' },
  { title: 'Fix', caption: 'voice + camera copilot', cue: 'guides' },
  { title: 'Prove', caption: '50 good parts in a row', cue: 'closes' },
];

const AGENTS = [
  'Quality Inspector',
  'Traceability',
  'Process Analyst',
  'Root Cause',
  'Technician Copilot',
  'Incident Scribe',
  'Continuous Learning',
];

interface SolutionSceneProps {
  captions: Caption[];
  /** Speech start and length (frames, scene-relative) of the line, and its text, to time the step cues. */
  speechAt: number;
  speech: number;
  text: string;
}

/** The solution in one loop: Detect → Trace → Fix → Prove, run by seven Gemini agents. */
const SolutionSceneInner = ({ captions, speechAt, speech, text }: SolutionSceneProps): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40, paddingBottom: 140 }}>
        <div style={{ ...eyebrow, fontSize: 22, ...fadeUp(frame, 0) }}>One closed incident loop</div>
        <div style={{ display: 'flex', gap: 28 }}>
          {STEPS.map((s, i) => {
            const on = frame >= speechAt + Math.round((speech * text.indexOf(s.cue)) / text.length);
            return (
              <GlassCard key={s.title} tone={on ? 'accent' : 'neutral'} style={{ width: 380, ...fadeUp(frame, 4 + i * 4) }}>
                <div style={{ fontFamily: FONT.display, fontSize: 44, fontWeight: 700, color: on ? C.accent : C.ink }}>{s.title}</div>
                <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.text, marginTop: 8 }}>{s.caption}</div>
              </GlassCard>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...fadeUp(frame, 30) }}>
          <div style={{ ...eyebrow, fontSize: 20 }}>Seven Gemini agents · one Google ADK orchestrator</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, maxWidth: 1600 }}>
            {AGENTS.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        </div>
      </AbsoluteFill>
      {captions.map((c) => (
        <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
      ))}
    </>
  );
};

export const SolutionScene = Interactive.create({
  Component: SolutionSceneInner,
  layout: 'absolute-fill',
});
