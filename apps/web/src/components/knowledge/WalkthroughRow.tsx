// WalkthroughRow: touch-sized list row — thumbnail, short title, asset/author/duration and a watchlist toggle.
import React from 'react';
import type { Walkthrough } from '../../lib/knowledge';
import { formatDuration } from '../../lib/knowledge';

interface WalkthroughRowProps {
  item: Walkthrough;
  saved: boolean;
  onOpen: (id: string) => void;
  onToggleSave: (id: string) => void;
}

export default function WalkthroughRow({ item, saved, onOpen, onToggleSave }: WalkthroughRowProps): React.ReactElement {
  return (
    <div className="wt-row">
      <button type="button" className="wt-row-main" onClick={() => onOpen(item.id)} aria-label={`Play ${item.title}`}>
        <span className="wt-thumb">
          <img src={item.image} alt="" loading="lazy" />
          <span className="material-symbols-outlined icon-fill wt-thumb-play">play_arrow</span>
        </span>
        <span className="col" style={{ minWidth: 0, gap: 3, flex: 1 }}>
          <span className="row wrap" style={{ gap: 6 }}>
            <span className="wt-title">{item.shortTitle}</span>
            {item.required && <span className="chip chip-red">Required</span>}
          </span>
          <span className="kpi-hint wt-meta">
            <span className="mono">{item.asset}</span> · {item.author.name.replace(/\s*\(.*\)$/, '')}
          </span>
        </span>
        <span className="mono wt-duration">{formatDuration(item.durationSec)}</span>
      </button>
      <button
        type="button"
        className="wt-save"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${item.shortTitle} from watchlist` : `Add ${item.shortTitle} to watchlist`}
        onClick={() => onToggleSave(item.id)}
        style={{ color: saved ? 'var(--accent)' : 'var(--faint)' }}
      >
        <span className={`material-symbols-outlined ${saved ? 'icon-fill' : ''}`}>{saved ? 'bookmark' : 'bookmark_add'}</span>
      </button>
    </div>
  );
}
