import React from 'react';
import { Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';

const STACK: [string, string][] = [
  ['Gemma 3', 'edge vision'],
  ['Gemini', '7 agents + Copilot'],
  ['Google ADK', 'graph workflow'],
  ['Vertex AI Search', 'manuals & 8D RAG'],
  ['BigQuery', 'part genealogy'],
  ['Cloud Pub/Sub', 'edge → cloud events'],
  ['Firestore', 'incident board'],
  ['Cloud Storage', '8D & SOP documents'],
  ['Cloud Run', 'agents & API'],
  ['Firebase Hosting', 'web & mobile apps'],
  ['Gemini TTS', 'this voiceover'],
];

const EndSceneInner = ({ caption, captionFrom }: { caption: string; captionFrom: number }): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 150 }}>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 132,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            background: `linear-gradient(120deg, ${C.ink} 30%, ${C.accent} 70%, ${C.accent2})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            ...fadeUp(frame, 0, 30, 20),
          }}
        >
          Kaizen Agent
        </div>
        <div style={{ fontFamily: FONT.display, fontSize: 48, fontWeight: 600, color: C.ink2, ...fadeUp(frame, 8) }}>
          The product tells the truth. AI traces it back.
        </div>
        <div style={{ ...eyebrow, marginTop: 56, ...fadeUp(frame, 16) }}>Built on Google Cloud</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, auto)', gap: 16, marginTop: 20 }}>
          {STACK.map(([name, role], i) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...fadeUp(frame, 18 + i * 3) }}>
              <Chip tone="accent" style={{ fontSize: 24, padding: '10px 22px' }}>
                {name}
              </Chip>
              <span style={{ fontFamily: FONT.main, fontSize: 19, color: C.muted }}>{role}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, marginTop: 40, ...fadeUp(frame, 50) }}>
          {[
            ['Live demo', 'kaizen-lab-demo.web.app'],
            ['Source', 'github.com/vanduc2514/hackathon-builder-cup-manufacturing-anomaly'],
          ].map(([label, link]) => (
            <div key={link} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ ...eyebrow, fontSize: 16 }}>{label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 700, color: C.accent }}>{link}</span>
            </div>
          ))}
        </div>
      </div>
      <Subtitle text={caption} from={captionFrom} />
    </>
  );
};

export const EndScene = Interactive.create({
  Component: EndSceneInner,
  layout: 'absolute-fill',
});
