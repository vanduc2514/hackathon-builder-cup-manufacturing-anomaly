import React from 'react';
import { Interactive } from 'remotion';
import Backdrop from '../components/Backdrop';
import Chip from '../components/Chip';
import Subtitle from '../components/Subtitle';
import { C, FONT, GLASS_SHADOW, RADIUS } from '../theme';
import ShotChrome from './ShotChrome';
import type { Caption } from './timeline';
import ZoomVideo, { type FootageProps } from './ZoomVideo';

const WIN_W = 1280;
const WIN_H = 720;
const BAR_H = 48;

interface BrowserShotProps {
  /** Live host shown in the address bar; omit to show `windowTitle` instead. */
  url?: string;
  windowTitle?: string;
  step: string;
  title: string;
  services: string[];
  footage: FootageProps;
  captions: Caption[];
}

/** Screen recording inside a glass browser window, with its live URL when given. */
const BrowserShotInner = ({ url, windowTitle, step, title, services, footage, captions }: BrowserShotProps): React.ReactElement => (
  <>
    <Backdrop />
    <ShotChrome step={step} title={title} services={services} start={footage.start} end={footage.end} />
    <div
      style={{
        position: 'absolute',
        left: 320,
        top: 112,
        width: WIN_W,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        border: `1.5px solid ${C.glassBorder}`,
        boxShadow: `${GLASS_SHADOW}, 0 30px 60px -30px rgba(30,41,90,.35)`,
        background: C.glassBgStrong,
      }}
    >
      <div style={{ height: BAR_H, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            height: 32,
            borderRadius: RADIUS.full,
            background: 'rgba(15,23,42,.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            fontFamily: FONT.mono,
            fontSize: 18,
            color: C.text,
          }}
        >
          {url ? (
            <>
              <svg width={14} height={16} viewBox="0 0 14 16">
                <rect x={1} y={7} width={12} height={8} rx={2} fill={C.successText} />
                <path d="M4 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke={C.successText} strokeWidth={1.8} />
              </svg>
              https://{url}
            </>
          ) : (
            <span style={{ fontFamily: FONT.main, fontWeight: 600 }}>{windowTitle}</span>
          )}
        </div>
        {url ? (
          <Chip tone="success" dot style={{ fontSize: 16, padding: '4px 12px' }}>
            Live on Google Cloud
          </Chip>
        ) : null}
      </div>
      <ZoomVideo {...footage} width={WIN_W} height={WIN_H} />
    </div>
    {captions.map((c) => (
      <Subtitle key={c.from} text={c.text} from={c.from} to={c.to} />
    ))}
  </>
);

export const BrowserShot = Interactive.create({
  Component: BrowserShotInner,
  layout: 'absolute-fill',
});
