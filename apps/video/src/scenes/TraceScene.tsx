import React from 'react';
import { Interactive, interpolate, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, RADIUS, eyebrow, fadeUp, progress } from '../theme';

const CARD_W = 520;
const TRACE_AT = 14;
const PROCESS_AT = 62;
const ROOT_AT = 110;
const CAPTION_SPLIT = 100;

const SUSPECTS = ['CNC-01', 'CNC-02 · T07', 'CNC-03', 'Lot A-112'];
const KEEP = 1;

// Spindle vibration (mm/s): steady baseline then the T07 wear spike.
const VIB = [2.1, 2.3, 2.0, 2.2, 2.4, 2.1, 2.3, 2.6, 3.4, 4.3, 5.1, 5.6];

function AgentHeader({ name, tool }: { name: string; tool: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: RADIUS.md,
          background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg width={28} height={28} viewBox="0 0 24 24">
          <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" fill="#fff" />
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: C.ink }}>{name}</div>
        <div style={{ fontFamily: FONT.main, fontSize: 20, color: C.muted }}>{tool}</div>
      </div>
    </div>
  );
}

const TraceSceneInner = ({ caption, captionRootCause }: { caption: string; captionRootCause: string }): React.ReactElement => {
  const frame = useCurrentFrame();

  const vibDrawn = progress(frame, PROCESS_AT + 8, PROCESS_AT + 44);
  const vibW = CARD_W - 72;
  const vibH = 170;
  const vibPts = VIB.map((v, i) => `${(i / (VIB.length - 1)) * vibW},${vibH - (v / 6) * vibH}`);
  const vibLen = 900;

  const conf = interpolate(frame, [ROOT_AT + 10, ROOT_AT + 50], [0, 95], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ringR = 62;
  const ringC = 2 * Math.PI * ringR;

  return (
    <>
      <Backdrop />
      <div style={{ position: 'absolute', left: 120, top: 80, ...fadeUp(frame, 0) }}>
        <div style={eyebrow}>2 · Trace &amp; diagnose · Google ADK orchestrator</div>
        <div style={{ fontFamily: FONT.display, fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', color: C.ink, marginTop: 8 }}>
          Agents trace it back to the cause
        </div>
      </div>

      <div style={{ position: 'absolute', left: 120, right: 120, top: 270, display: 'flex', gap: 40 }}>
        {/* Traceability */}
        <GlassCard style={{ width: CARD_W, ...fadeUp(frame, TRACE_AT, 40) }}>
          <AgentHeader name="Traceability" tool="BigQuery part genealogy" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {SUSPECTS.map((s, i) => {
              const ruledOut = i !== KEEP && progress(frame, TRACE_AT + 18 + i * 6, TRACE_AT + 28 + i * 6) > 0.5;
              const kept = i === KEEP && frame > TRACE_AT + 44;
              return (
                <div
                  key={s}
                  style={{
                    padding: '14px 20px',
                    borderRadius: RADIUS.lg,
                    background: kept ? C.dangerSoft : C.inset,
                    border: `1.5px solid ${kept ? 'rgba(229,72,77,.4)' : 'rgba(255,255,255,.9)'}`,
                    fontFamily: FONT.mono,
                    fontSize: 26,
                    fontWeight: kept ? 700 : 500,
                    color: kept ? C.dangerText : ruledOut ? C.faint : C.text,
                    textDecoration: ruledOut ? 'line-through' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{s}</span>
                  {kept ? <span>suspect</span> : ruledOut ? <span style={{ textDecoration: 'none' }}>ruled out</span> : null}
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Process Analyst */}
        <GlassCard style={{ width: CARD_W, ...fadeUp(frame, PROCESS_AT, 40) }}>
          <AgentHeader name="Process Analyst" tool="CNC-02 sensors, that window only" />
          <div style={{ fontFamily: FONT.main, fontSize: 22, color: C.muted }}>Spindle vibration</div>
          <svg width={vibW} height={vibH + 10} style={{ marginTop: 12, overflow: 'visible' }}>
            <line x1={0} x2={vibW} y1={vibH - (2.2 / 6) * vibH} y2={vibH - (2.2 / 6) * vibH} stroke={C.faint} strokeWidth={2} strokeDasharray="6 6" />
            <polyline
              points={vibPts.join(' ')}
              fill="none"
              stroke={C.warning}
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={vibLen}
              strokeDashoffset={vibLen * (1 - vibDrawn)}
            />
          </svg>
          <div style={{ marginTop: 20, opacity: progress(frame, PROCESS_AT + 40, PROCESS_AT + 52) }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 56, fontWeight: 700, color: C.warningText }}>+154%</span>
            <span style={{ fontFamily: FONT.main, fontSize: 22, color: C.muted, marginLeft: 12 }}>above baseline</span>
          </div>
        </GlassCard>

        {/* Root Cause */}
        <GlassCard tone={frame > ROOT_AT + 50 ? 'accent' : 'neutral'} style={{ width: CARD_W, ...fadeUp(frame, ROOT_AT, 40) }}>
          <AgentHeader name="Root Cause" tool="Gemini + Vertex AI Search" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <svg width={150} height={150} viewBox="0 0 150 150">
              <circle cx={75} cy={75} r={ringR} fill="none" stroke={C.accentSoft} strokeWidth={14} />
              <circle
                cx={75}
                cy={75}
                r={ringR}
                fill="none"
                stroke={C.accent}
                strokeWidth={14}
                strokeLinecap="round"
                strokeDasharray={ringC}
                strokeDashoffset={ringC * (1 - conf / 100)}
                transform="rotate(-90 75 75)"
              />
              <text x={75} y={86} textAnchor="middle" fontFamily={FONT.mono} fontSize={34} fontWeight={700} fill={C.ink}>
                {Math.round(conf)}%
              </text>
            </svg>
            <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>
              Worn insert T07, run past tool life
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', opacity: progress(frame, ROOT_AT + 40, ROOT_AT + 54) }}>
            <Chip tone="accent">OEM manual §4.2</Chip>
            <Chip tone="accent">Past 8D report</Chip>
          </div>
        </GlassCard>
      </div>

      <Subtitle text={caption} to={CAPTION_SPLIT} />
      <Subtitle text={captionRootCause} from={CAPTION_SPLIT} />
    </>
  );
};

export const TraceScene = Interactive.create({
  Component: TraceSceneInner,
  layout: 'absolute-fill',
  schema: {
    caption: { type: 'string', default: 'AI agents trace it back to CNC-02 and tool T07.', description: 'Subtitle 1' },
    captionRootCause: {
      type: 'string',
      default: 'Spindle vibration +154%. Root cause: worn tool, 95% confident.',
      description: 'Subtitle 2',
    },
  },
});
