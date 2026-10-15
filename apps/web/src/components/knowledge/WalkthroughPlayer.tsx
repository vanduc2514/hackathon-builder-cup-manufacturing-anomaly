// WalkthroughPlayer: simulated playback with chapters and key procedural steps.
import React, { useEffect, useRef, useState } from 'react';
import { formatClockTime } from '../../lib/knowledge';
import type { WalkthroughMeta } from '../../types';

interface WalkthroughPlayerProps {
  item: WalkthroughMeta;
  autoPlay?: boolean;
  embedded?: boolean;
  onOpenSop?: (code: number | string) => void;
}

export default function WalkthroughPlayer({
  item,
  autoPlay = false,
  embedded = false,
  onOpenSop,
}: WalkthroughPlayerProps): React.ReactElement {
  const [time, setTime] = useState<number>(autoPlay ? 0 : item.chapters?.[1]?.at ?? 0);
  const [playing, setPlaying] = useState<boolean>(autoPlay);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const stageRef = useRef<HTMLDivElement | null>(null);

  const duration = Math.max(1, item.duration_sec);
  const chapters = item.chapters ?? [];
  const pct = (time / duration) * 100;
  const currentChapter = chapters.reduce((acc, c, i) => (time >= c.at ? i : acc), -1);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setTime((t) => Math.min(t + 1, duration)), 1000);
    return () => window.clearInterval(id);
  }, [playing, duration]);

  useEffect(() => {
    if (playing && time >= duration) setPlaying(false);
  }, [playing, time, duration]);

  const togglePlay = () => {
    if (time >= duration) setTime(0);
    setPlaying((p) => !p);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTime(Math.round(((e.clientX - r.left) / r.width) * duration));
  };

  const toggleCheck = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <section
      className={embedded ? 'grid' : 'glass grid'}
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        padding: embedded ? 0 : '1.4rem',
        gap: '1.6rem',
        alignItems: 'start',
      }}
    >
      <div className="col" style={{ gap: 10 }}>
        <div ref={stageRef} className="player-stage">
          <img src={item.thumbnail_url || '/knowledge/wt-hero.jpg'} alt="" />
          <div className="player-shade" />
          <span className="player-tag">
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14 }}>
              smart_display
            </span>
            {item.category ?? 'Walkthrough'}
          </span>
          <button
            type="button"
            className="player-play"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 34 }}>
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <div className="player-bar">
            <div className="row between mono" style={{ fontSize: '0.72rem', color: '#fff' }}>
              <span>
                <span style={{ color: '#a5b4fc' }}>{formatClockTime(time)}</span> /{' '}
                {formatClockTime(duration)}
              </span>
              <span style={{ opacity: 0.85 }}>Floor Capture</span>
            </div>
            <div
              className="player-track"
              onClick={seek}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={time}
              tabIndex={0}
            >
              <span className="player-fill" style={{ width: `${pct}%` }} />
              {chapters.map((c) => (
                <span
                  key={c.at}
                  className="player-tick"
                  style={{ left: `${(c.at / duration) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        {chapters.length > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))`,
              gap: 8,
            }}
          >
            {chapters.map((c, i) => (
              <button
                key={c.at}
                type="button"
                className={`chapter-btn ${i === currentChapter ? 'chapter-btn-on' : ''}`}
                onClick={() => setTime(c.at)}
              >
                <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--accent)' }}>
                  {formatClockTime(c.at).replace(/^0/, '')} Phase {i + 1}
                  {i === currentChapter ? ' [Current]' : ''}
                </span>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          {item.category && (
            <span
              className="chip chip-accent"
              style={{
                borderRadius: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.64rem',
              }}
            >
              {item.category}
            </span>
          )}
          {item.asset && (
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Asset: {item.asset}
            </span>
          )}
        </div>
        {!embedded && (
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}
          >
            {item.title}
          </h2>
        )}
        {item.description && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5 }}>
            {item.description}
          </p>
        )}

        {item.key_steps && item.key_steps.length > 0 && (
          <div className="col" style={{ gap: 8 }}>
            <span className="eyebrow" style={{ color: 'var(--text)' }}>
              Key Procedural Steps
            </span>
            {item.key_steps.map((step, idx) => (
              <div
                key={step}
                className="glass-inset row"
                style={{ padding: '0.6rem 0.8rem', gap: 10, alignItems: 'center' }}
              >
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => toggleCheck(idx)}
                  style={{ color: checked.has(idx) ? 'var(--green)' : 'var(--muted)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {checked.has(idx) ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                </button>
                <span
                  style={{
                    fontSize: '0.84rem',
                    color: checked.has(idx) ? 'var(--muted)' : 'var(--ink)',
                    textDecoration: checked.has(idx) ? 'line-through' : 'none',
                  }}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}

        {item.linked_sop && onOpenSop && (
          <button
            type="button"
            className="btn"
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
            onClick={() => onOpenSop(item.linked_sop as string)}
          >
            <span className="material-symbols-outlined">description</span>
            Open Linked SOP ({item.linked_sop})
          </button>
        )}
      </div>
    </section>
  );
}
