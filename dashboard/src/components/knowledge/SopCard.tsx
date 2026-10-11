// SopCard: SOP runbook card — code/revision, tags, run metrics, a footnote and launch actions.
import React from 'react';
import type { Sop, SopMetric } from '../../lib/knowledge';
import TagChip from './TagChip';

interface SopCardProps {
  sop: Sop;
  onLaunch: (sop: Sop) => void;
  onSideLink: (sop: Sop) => void;
}

const METRIC_COLOR: Record<NonNullable<SopMetric['tone']>, string> = {
  accent: 'var(--accent)',
  red: '#c9343a',
  green: '#0e8a43',
  ink: 'var(--ink)',
};

const SPARK = 'M0 10 L10 10 L14 4 L18 15 L22 7 L26 12 L30 9 L40 10 L46 3 L50 14 L56 9 L70 9';

export default function SopCard({ sop, onLaunch, onSideLink }: SopCardProps): React.ReactElement {
  return (
    <article className={`glass glass-hover col ${sop.safety ? 'sop-card-safety' : ''}`} style={{ flex: 1, padding: '1.15rem 1.2rem', gap: 10 }}>
      <div className="row between">
        <span className="row" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>
            SOP #{String(sop.code).padStart(3, '0')}
          </span>
          <span className={`chip ${sop.safety ? 'chip-red' : ''}`} style={{ borderRadius: 6, padding: '1px 7px', fontSize: '0.66rem' }}>
            Rev {sop.rev}
          </span>
        </span>
        <span className="row" style={{ gap: 4, fontSize: '0.72rem', color: 'var(--muted)', fontWeight: sop.safety ? 700 : 500 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            {sop.safety ? 'lock' : 'history'}
          </span>
          {sop.updated}
        </span>
      </div>

      <div className="row wrap" style={{ gap: 5 }}>
        {sop.tags.map((t) => (
          <TagChip key={t.label} {...t} />
        ))}
      </div>

      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.08rem', fontWeight: 650, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{sop.title}</h3>
        <p className="clamp-2" style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: 4, lineHeight: 1.45 }}>
          {sop.summary}
        </p>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${sop.metrics.length}, minmax(0, 1fr))`,
          gap: 8,
          padding: '0.7rem 0.8rem',
          borderRadius: 12,
          background: sop.safety ? 'rgba(255,241,242,0.7)' : 'rgba(240,242,255,0.75)',
        }}
      >
        {sop.metrics.map((m) => (
          <div key={m.label} className="col" style={{ minWidth: 0 }}>
            <span className="eyebrow" style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>
              {m.label}
            </span>
            <span className="mono" style={{ fontSize: '0.86rem', fontWeight: 700, color: m.tone ? METRIC_COLOR[m.tone] : 'var(--ink)' }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="row between" style={{ gap: 10, minHeight: 26 }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink-2)' }}>{sop.note}</span>
        {sop.noteTrail.kind === 'spark' && (
          <svg width="70" height="18" viewBox="0 0 70 18" aria-hidden="true">
            <path d={SPARK} fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        )}
        {sop.noteTrail.kind === 'status' && (
          <span className="row" style={{ gap: 5, fontSize: '0.72rem', color: 'var(--text)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
            {sop.noteTrail.value}
          </span>
        )}
        {sop.noteTrail.kind === 'text' && (
          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            {sop.noteTrail.value}
          </span>
        )}
      </div>

      <div className="row between" style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--hair)' }}>
        <button type="button" className="link-btn muted" onClick={() => onSideLink(sop)}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {sop.sideLink.icon}
          </span>
          {sop.sideLink.label}
        </button>
        <button type="button" className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => onLaunch(sop)}>
          {sop.action}
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            arrow_forward
          </span>
        </button>
      </div>
    </article>
  );
}
