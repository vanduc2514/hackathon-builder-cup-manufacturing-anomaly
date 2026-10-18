import React, { useEffect, useRef, useState } from 'react';
import type { IncidentState, IncidentSummary } from '../../types';
import MobileApp from './MobileApp';

const PHONE_W = 396;
const PHONE_H = 852;

function fitScale(top: number): number {
  const available = window.innerHeight - top - 56;
  return Math.max(0.55, Math.min(1, available / PHONE_H));
}

/** Viewports at or below this width are real phones: render the app without the demo chassis. */
const PHONE_VIEWPORT_QUERY = '(max-width: 520px)';

function useIsPhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState<boolean>(() => window.matchMedia(PHONE_VIEWPORT_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(PHONE_VIEWPORT_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsPhone(event.matches);
    setIsPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isPhone;
}

interface MobileDeviceFrameProps {
  incident?: IncidentState | null;
  history?: IncidentSummary[];
  /** Screen content; defaults to the technician app (the login screen passes its own). */
  children?: React.ReactNode;
}

/**
 * Presents the technician app full-screen on a phone viewport, or inside an iPhone-style
 * chassis on the desktop demo page.
 */
export default function MobileDeviceFrame({
  incident,
  history,
  children,
}: MobileDeviceFrameProps): React.ReactElement {
  const isPhone = useIsPhoneViewport();
  const content = children ?? <MobileApp incident={incident} history={history} />;

  if (isPhone) {
    return (
      <div className="m-bare" style={{ position: 'fixed', inset: 0, background: '#eef1f8' }}>
        {content}
      </div>
    );
  }
  return <DeviceChassis>{content}</DeviceChassis>;
}

/** Desktop demo chassis: notch, home bar and caption, scaled to fit the window height. */
function DeviceChassis({ children }: { children: React.ReactNode }): React.ReactElement {
  const [scale, setScale] = useState<number>(0.8);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => {
      const top = (holderRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
      setScale(fitScale(top));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '0.75rem',
        padding: '1.25rem 1rem 1.5rem',
        background:
          'radial-gradient(60% 50% at 30% 20%, rgba(91,76,245,0.22), transparent 70%), radial-gradient(50% 40% at 75% 75%, rgba(50,173,230,0.16), transparent 70%), #090D16',
      }}
    >
      <div ref={holderRef} style={{ width: PHONE_W * scale, height: PHONE_H * scale, flexShrink: 0 }}>
      <div
        style={{
          position: 'relative',
          width: PHONE_W,
          height: PHONE_H,
          padding: 10,
          borderRadius: 58,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: 'linear-gradient(145deg, #2a2f3d, #12151e)',
          boxShadow:
            '0 40px 90px -30px rgba(0,0,0,0.85), 0 0 0 1.5px rgba(255,255,255,0.14), inset 0 0 0 2px rgba(0,0,0,0.9)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 48,
            overflow: 'hidden',
            background: '#eef1f8',
            transform: 'translateZ(0)',
          }}
        >
          {children}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 11,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 112,
              height: 32,
              borderRadius: 999,
              background: '#000',
              zIndex: 100,
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 128,
              height: 5,
              borderRadius: 999,
              background: 'rgba(11,18,32,0.55)',
              zIndex: 100,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
      </div>
      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.78rem', textAlign: 'center', maxWidth: 420 }}>
        Technician app · Work List → Collect evidence or Repair → Processing (lead verifies) → Completed
      </p>
    </div>
  );
}
