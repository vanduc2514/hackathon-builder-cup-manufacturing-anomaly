// WalkthroughCard: video tile with category, duration, asset badge, author and watchlist toggle.
import React from 'react';
import type { Walkthrough } from '../../lib/knowledge';
import { formatDuration } from '../../lib/knowledge';
import TagChip from './TagChip';

interface WalkthroughCardProps {
  item: Walkthrough;
  playing: boolean;
  saved: boolean;
  onPlay: (id: string) => void;
  onToggleSave: (id: string) => void;
}

export default function WalkthroughCard({ item, playing, saved, onPlay, onToggleSave }: WalkthroughCardProps): React.ReactElement {
  return (
    <article className={`glass glass-hover col ${playing ? 'card-playing' : ''}`} style={{ overflow: 'hidden', padding: 0 }}>
      <button type="button" className="video-thumb" onClick={() => onPlay(item.id)} aria-label={`Play ${item.title}`}>
        <img src={item.image} alt="" loading="lazy" />
        <span className="video-thumb-label">{item.category}</span>
        <span className="video-thumb-time mono">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            timer
          </span>
          {formatDuration(item.durationSec)}
        </span>
        <span className="video-thumb-play material-symbols-outlined icon-fill">{playing ? 'equalizer' : 'play_arrow'}</span>
      </button>
      <div className="col" style={{ padding: '0.9rem 1rem 0.8rem', gap: 6, flex: 1 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Asset: {item.asset}
          </span>
          <TagChip {...item.badge} />
        </div>
        <h3 title={item.title} style={{ fontFamily: 'var(--font-display)', fontSize: '1.02rem', fontWeight: 650, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </h3>
        <p className="clamp-2" style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.45 }}>
          {item.description}
        </p>
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          <span className="mono" style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}>
            {item.author.initials}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.author.name}</span>
        </div>
        <div className="row between" style={{ marginTop: 'auto', paddingTop: 8 }}>
          <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
            {item.views.toLocaleString('en-US')} views • <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{item.helpful}</span>
          </span>
          <button
            type="button"
            className="link-btn"
            aria-pressed={saved}
            aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={() => onToggleSave(item.id)}
            style={{ color: saved ? 'var(--accent)' : 'var(--text)' }}
          >
            <span className={`material-symbols-outlined ${saved ? 'icon-fill' : ''}`} style={{ fontSize: 20 }}>
              {saved ? 'playlist_add_check' : 'playlist_add'}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
