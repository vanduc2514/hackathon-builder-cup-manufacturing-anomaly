import React from 'react';
import { Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, eyebrow, fadeUp } from '../theme';
import ShotChrome from './ShotChrome';
import type { Caption } from './timeline';

// Objects the approval of INC-1028C4 wrote on prod (gcloud storage ls gs://kaizen-lab-kb/...).
const DOCS: [string, string, string][] = [
  ['report_8d.md', '8D report', '2.8 KB'],
  ['work_order.md', 'Work order', '1.5 KB'],
  ['sop_proposal.md', 'SOP proposal', '1.7 KB'],
  ['impact_card.md', 'Impact card', '0.5 KB'],
];

interface LearnSceneProps {
  incidentId: string;
  captions: Caption[];
}

/** Continuous improvement: the approved incident's documents in Cloud Storage and its learned entry in Vertex AI Search. */
const LearnSceneInner = ({ incidentId, captions }: LearnSceneProps): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <ShotChrome step="5 · Learn" title="The fix becomes knowledge" services={['Cloud Storage', 'Vertex AI Search', 'Gemini']} />
      <div style={{ position: 'absolute', left: 120, top: 150, width: 1420, display: 'flex', gap: 36 }}>
        <GlassCard style={{ flex: 1.25, ...fadeUp(frame, 6, 30) }}>
          <div style={eyebrow}>Cloud Storage · documents</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 24, color: C.ink2, marginTop: 10 }}>gs://kaizen-lab-kb/incidents/{incidentId}/</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
            {DOCS.map(([file, label, size], i) => (
              <div
                key={file}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  padding: '16px 22px',
                  borderRadius: 16,
                  background: C.inset,
                  border: '1.5px solid rgba(255,255,255,.9)',
                  ...fadeUp(frame, 20 + i * 10, 18, 12),
                }}
              >
                <svg width={30} height={36} viewBox="0 0 30 36">
                  <path d="M3 2 H20 L27 9 V34 H3 Z" fill="#fff" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" />
                  <path d="M20 2 V9 H27" fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" />
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, color: C.ink }}>{label}</div>
                  <div style={{ fontFamily: FONT.mono, fontSize: 20, color: C.muted }}>{file}</div>
                </div>
                <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.muted }}>{size}</span>
                <Chip tone="success" dot style={{ fontSize: 18 }}>
                  saved
                </Chip>
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard tone="accent" style={{ flex: 1, ...fadeUp(frame, 70, 30) }}>
          <div style={eyebrow}>Vertex AI Search · knowledge store</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 24, color: C.ink2, marginTop: 10 }}>kb/learned__{incidentId}.txt</div>
          <div style={{ fontFamily: FONT.display, fontSize: 34, fontWeight: 700, color: C.ink, marginTop: 28, lineHeight: 1.25 }}>
            Defect → root cause → verified fix
          </div>
          <div style={{ fontFamily: FONT.main, fontSize: 24, color: C.text, marginTop: 14, lineHeight: 1.45 }}>
            Imported into the RAG index the Root Cause agent and the Copilot search, so the next scratch on CNC-02 starts from this proven fix.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 26, ...fadeUp(frame, 100, 12, 12) }}>
            <Chip tone="accent" dot style={{ fontSize: 18 }}>
              indexed
            </Chip>
            <Chip tone="neutral" style={{ fontSize: 18 }}>
              proven on 50/50 parts
            </Chip>
          </div>
        </GlassCard>
      </div>
      {captions.map((c) => (
        <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
      ))}
    </>
  );
};

export const LearnScene = Interactive.create({
  Component: LearnSceneInner,
  layout: 'absolute-fill',
});
