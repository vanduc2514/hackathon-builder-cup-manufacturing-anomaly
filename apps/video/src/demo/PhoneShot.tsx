import React from 'react';
import { Interactive, useCurrentFrame } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import GlassCard from '../components/GlassCard';
import Subtitle from '../components/Subtitle';
import { C, FONT, fadeUp } from '../theme';
import type { Caption } from './timeline';
import ShotChrome from './ShotChrome';
import ZoomVideo, { type FootageProps } from './ZoomVideo';

const SCREEN_W = 368;
const SCREEN_H = 798;

export interface Callout {
  /** Frame (relative to the shot) the callout appears. */
  at: number;
  title: string;
  body: string;
}

interface PhoneShotProps {
  /** Live host shown above the callouts; omit to hide it. */
  url?: string;
  step: string;
  title: string;
  services: string[];
  footage: FootageProps;
  captions: Caption[];
  callouts: Callout[];
}

/** Technician app recording in a phone frame, with callouts explaining what the AI is doing. */
const PhoneShotInner = ({ url, step, title, services, footage, captions, callouts }: PhoneShotProps): React.ReactElement => {
  const frame = useCurrentFrame();
  return (
    <>
      <Backdrop />
      <ShotChrome step={step} title={title} services={services} start={footage.start} end={footage.end} />
      <div
        style={{
          position: 'absolute',
          left: 300,
          top: 112,
          padding: 12,
          borderRadius: 60,
          background: 'linear-gradient(160deg, #1f2937, #0b1220)',
          boxShadow: '0 40px 80px -30px rgba(30,41,90,.45)',
        }}
      >
        <div style={{ borderRadius: 48, overflow: 'hidden' }}>
          <ZoomVideo {...footage} width={SCREEN_W} height={SCREEN_H} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 800, top: 150, width: 780, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {url ? (
          <div>
            <Chip tone="success" dot style={{ fontSize: 18, padding: '6px 14px' }}>
              https://{url} · live on Google Cloud
            </Chip>
          </div>
        ) : null}
        {callouts
          .filter((c) => frame >= c.at)
          .map((c) => (
            <GlassCard key={c.at} style={{ padding: 28, ...fadeUp(frame, c.at, 24, 14) }}>
              <div style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: C.ink }}>{c.title}</div>
              <div style={{ fontFamily: FONT.main, fontSize: 25, color: C.text, marginTop: 8, lineHeight: 1.4 }}>{c.body}</div>
            </GlassCard>
          ))}
      </div>
      {captions.map((c) => (
        <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
      ))}
    </>
  );
};

export const PhoneShot = Interactive.create({
  Component: PhoneShotInner,
  layout: 'absolute-fill',
});
