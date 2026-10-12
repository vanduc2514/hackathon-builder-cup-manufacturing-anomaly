// WalkthroughPlayer: featured walkthrough — simulated playback with chapters, quality gates and SOP link.
import React, { useEffect, useRef, useState } from 'react';
import type { Walkthrough } from '../../lib/knowledge';
import { formatClockTime } from '../../lib/knowledge';

interface WalkthroughPlayerProps {
  item: Walkthrough;
  autoPlay?: boolean;
  /** Inside a drawer: no glass frame, and the drawer header already shows the title. */
  embedded?: boolean;
  onOpenSop: (code: number) => void;
}

export default function WalkthroughPlayer({ item, autoPlay = false, embedded = false, onOpenSop }: WalkthroughPlayerProps): React.ReactElement {
  const [time, setTime] = useState<number>(autoPlay ? 0 : item.chapters?.[1]?.at ?? 0);
  const [playing, setPlaying] = useState<boolean>(autoPlay);
  const [checklist, setChecklist] = useState<boolean>(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const chapters = item.chapters ?? [];
  const gates = item.gates ?? [];
  const pct = (time / item.durationSec) * 100;
  const currentChapter = chapters.reduce((acc, c, i) => (time >= c.at ? i : acc), -1);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setTime((t) => Math.min(t + 1, item.durationSec)), 1000);
    return () => window.clearInterval(id);
  }, [playing, item.durationSec]);

  useEffect(() => {
    if (playing && time >= item.durationSec) setPlaying(false);
  }, [playing, time, item.durationSec]);

  const togglePlay = () => {
    if (time >= item.durationSec) setTime(0);
    setPlaying((p) => !p);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTime(Math.round(((e.clientX - r.left) / r.width) * item.durationSec));
  };

  return (
    <section
      className={embedded ? 'grid' : 'glass grid'}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', padding: embedded ? 0 : '1.4rem', gap: '1.6rem', alignItems: 'start' }}
    >
      <div className="col" style={{ gap: 10 }}>
        <div ref={stageRef} className="player-stage">
          <img src={item.image} alt="" />
          <div className="player-shade" />
          <span className="player-tag">
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14 }}>
              {item.badge.icon ?? 'smart_display'}
            </span>
            {item.badge.label}
          </span>
          <button type="button" className="player-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize: 34 }}>
              {playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <div className="player-bar">
            <div className="row between mono" style={{ fontSize: '0.72rem', color: '#fff' }}>
              <span>
                <span style={{ color: '#a5b4fc' }}>{formatClockTime(time)}</span> / {formatClockTime(item.durationSec)}
              </span>
              <span style={{ opacity: 0.85 }}>1080p 60fps • {item.views.toLocaleString('en-US')} Plant Views</span>
            </div>
            <div className="player-track" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={item.durationSec} aria-valuenow={time} tabIndex={0}>
              <span className="player-fill" style={{ width: `${pct}%` }} />
              {chapters.map((c) => (
                <span key={c.at} className="player-tick" style={{ left: `${(c.at / item.durationSec) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
        {chapters.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))`, gap: 8 }}>
            {chapters.map((c, i) => (
              <button key={c.at} type="button" className={`chapter-btn ${i === currentChapter ? 'chapter-btn-on' : ''}`} onClick={() => setTime(c.at)}>
                <span className="mono" style={{ fontSize: '0.66rem', color: 'var(--accent)' }}>
                  {formatClockTime(c.at).replace(/^0/, '')} Phase {i + 1}
                  {i === currentChapter ? ' [Current]' : ''}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="chip chip-accent" style={{ borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.64rem' }}>
            {item.category}
          </span>
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Asset: {item.asset}
          </span>
        </div>
        {!embedded && (
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{item.title}</h2>
        )}
        <div className="row" style={{ gap: 12, padding: '0.7rem 0.9rem', borderRadius: 14, background: 'rgba(240,242,255,0.8)' }}>
          <span className="mono" style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
            {item.author.initials}
          </span>
          <div className="col" style={{ minWidth: 0 }}>
            <span className="row" style={{ gap: 5, fontWeight: 650 }}>
              {item.author.name}
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>
                verified
              </span>
            </span>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{item.author.role}</span>
          </div>
        </div>

        {gates.length > 0 ? (
          <div className="col" style={{ gap: 8 }}>
            <span className="eyebrow" style={{ color: 'var(--text)' }}>
              Critical quality gates in this video
            </span>
            {gates.map((g, i) => {
              const done = checklist ? checked.has(i) : time >= g.at;
              const body = (
                <>
                  <span className={`material-symbols-outlined ${done ? 'icon-fill' : ''}`} style={{ fontSize: 18, color: done ? 'var(--green)' : 'var(--accent)' }}>
                    {checklist ? (done ? 'check_box' : 'check_box_outline_blank') : 'check_circle'}
                  </span>
                  <span style={{ fontSize: '0.84rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>
                    <strong className="mono">{formatClockTime(g.at).replace(/^0/, '')}</strong> {g.text}
                  </span>
                </>
              );
              return checklist ? (
                <button
                  key={g.at}
                  type="button"
                  className="row gate-row"
                  aria-pressed={done}
                  onClick={() =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                >
                  {body}
                </button>
              ) : (
                <div key={g.at} className="row gate-row">
                  {body}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.55 }}>{item.description}</p>
        )}

        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
          <button id="wt-fullscreen" type="button" className="btn btn-dark" onClick={() => stageRef.current?.requestFullscreen?.()}>
            <span className="material-symbols-outlined">fullscreen</span>
            Watch in Fullscreen
          </button>
          {gates.length > 0 && (
            <button id="wt-checklist" type="button" className="btn" aria-pressed={checklist} onClick={() => setChecklist((v) => !v)}>
              <span className="material-symbols-outlined">checklist</span>
              {checklist ? 'Exit Checklist' : 'Step Checklist'}
            </button>
          )}
          {item.sop !== undefined && (
            <button id="wt-link-sop" type="button" className="btn" style={{ color: 'var(--accent)' }} onClick={() => onOpenSop(item.sop as number)}>
              <span className="material-symbols-outlined">link</span>
              Link to SOP #{String(item.sop).padStart(3, '0')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
