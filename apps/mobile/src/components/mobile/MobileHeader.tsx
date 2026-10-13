import React, { useContext } from 'react';
import type { StreamStatus } from '../../types';
import { StreamStatusContext } from './streamStatusContext';

const STREAM_LABEL: Record<StreamStatus, { text: string; color: string }> = {
  live: { text: 'Live', color: '#30c25a' },
  connecting: { text: 'Connecting…', color: '#ff9500' },
  reconnecting: { text: 'Reconnecting…', color: '#ff9500' },
  offline: { text: 'Offline · retrying', color: '#ff3b30' },
};

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

/** Root-level header: brand row + iOS large title. */
export default function MobileHeader({
  title,
  subtitle,
  trailing,
}: MobileHeaderProps): React.ReactElement {
  const stream = STREAM_LABEL[useContext(StreamStatusContext)];
  return (
    <>
      <header className="m-topbar">
        <div className="m-brand">
          <div className="m-brand-logo">
            <span className="material-symbols-outlined ms-fill">precision_manufacturing</span>
          </div>
          <div>
            <div className="m-brand-name">kAIgen</div>
            <div className="m-live" role="status" aria-label={`Backend stream: ${stream.text}`} style={{ color: stream.color }}>
              <span className="m-dot pulse" style={{ color: stream.color }} />
              {stream.text}
            </div>
          </div>
        </div>
        <div className="m-avatar" aria-label="Your profile">
          <span className="material-symbols-outlined">engineering</span>
        </div>
      </header>
      <div className="m-screen" style={{ gap: 0, paddingBottom: 12 }}>
        <div className="m-largetitle">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {trailing}
        </div>
      </div>
    </>
  );
}
