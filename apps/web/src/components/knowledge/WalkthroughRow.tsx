// WalkthroughRow: touch-sized list row — thumbnail, title, asset and duration.
import React from 'react';
import { formatDuration } from '../../lib/knowledge';
import type { WalkthroughMeta } from '../../types';

interface WalkthroughRowProps {
  item: WalkthroughMeta;
  saved: boolean;
  onOpen: (id: string) => void;
  onToggleSave: (id: string) => void;
}

export default function WalkthroughRow({
  item,
  saved,
  onOpen,
  onToggleSave,
}: WalkthroughRowProps): React.ReactElement {
  return (
    <div className="wt-row">
      <button
        type="button"
        className="wt-row-main"
        onClick={() => onOpen(item.id)}
        aria-label={`Play ${item.title}`}
      >
        <span className="wt-thumb">
          <img src={item.thumbnail_url || '/knowledge/wt-hero.jpg'} alt="" loading="lazy" />
          <span className="material-symbols-outlined icon-fill wt-thumb-play">play_arrow</span>
        </span>
        <span className="col" style={{ minWidth: 0, gap: 3, flex: 1, textAlign: 'left' }}>
          <span className="row wrap" style={{ gap: 6 }}>
            <span className="wt-title">{item.title}</span>
            {item.required && <span className="chip chip-red">Required</span>}
          </span>
          <span className="kpi-hint wt-meta">
            {item.asset && <span className="mono">{item.asset}</span>}
            {item.category && <span> · {item.category}</span>}
          </span>
        </span>
        <span className="mono wt-duration">{formatDuration(item.duration_sec)}</span>
      </button>
      <button
        type="button"
        className="wt-save"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${item.title} from watchlist` : `Add ${item.title} to watchlist`}
        onClick={() => onToggleSave(item.id)}
        style={{ color: saved ? 'var(--accent)' : 'var(--faint)' }}
      >
        <span className={`material-symbols-outlined ${saved ? 'icon-fill' : ''}`}>
          {saved ? 'bookmark' : 'bookmark_add'}
        </span>
      </button>
    </div>
  );
}
