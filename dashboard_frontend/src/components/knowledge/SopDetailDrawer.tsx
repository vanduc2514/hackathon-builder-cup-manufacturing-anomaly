// SopDetailDrawer: one SOP's summary, key figures, tags and revision diff log, opened from the SOP table.
import React from 'react';
import type { Sop, SopMetric } from '../../lib/knowledge';
import SideDrawer from '../SideDrawer';
import TagChip from './TagChip';

interface SopDetailDrawerProps {
  sop: Sop;
  onClose: () => void;
  onOpenWalkthrough: (id: string) => void;
  onSideLink: (sop: Sop) => void;
}

const METRIC_COLOR: Record<NonNullable<SopMetric['tone']>, string> = {
  accent: 'var(--accent)',
  red: '#c9343a',
  green: '#0e8a43',
  ink: 'var(--ink)',
};

export const sopCode = (code: number): string => `SOP #${String(code).padStart(3, '0')}`;

export default function SopDetailDrawer({ sop, onClose, onOpenWalkthrough, onSideLink }: SopDetailDrawerProps): React.ReactElement {
  return (
    <SideDrawer
      onClose={onClose}
      eyebrow={
        <>
          <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>
            {sopCode(sop.code)}
          </span>
          <span className={`chip ${sop.safety ? 'chip-red' : ''}`}>Rev {sop.rev}</span>
          <span className="chip">{sop.station}</span>
        </>
      }
      title={sop.title}
      footer={
        <>
          {sop.walkthroughId && (
            <button type="button" className="btn btn-dark" onClick={() => onOpenWalkthrough(sop.walkthroughId as string)}>
              <span className="material-symbols-outlined">play_circle</span>
              Watch video walkthrough
            </button>
          )}
          <button type="button" className="btn" onClick={() => onSideLink(sop)}>
            <span className="material-symbols-outlined">{sop.sideLink.icon}</span>
            {sop.sideLink.label}
          </button>
        </>
      }
    >
      {sop.safety && (
        <div className="glass-inset tone-red row" style={{ gap: 10, padding: '0.7rem 0.9rem' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--red)' }}>
            lock
          </span>
          <span style={{ fontSize: '0.84rem', color: '#9f1d22', fontWeight: 600 }}>
            Safety-critical procedure — {sop.note}. Line lead authorization required.
          </span>
        </div>
      )}

      <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.55 }}>{sop.summary}</p>

      <div className="drawer-facts">
        {sop.metrics.map((m) => (
          <div key={m.label} className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
            <div className="eyebrow">{m.label}</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: '0.95rem', color: m.tone ? METRIC_COLOR[m.tone] : 'var(--ink)' }}>
              {m.value}
            </div>
          </div>
        ))}
        {!sop.safety && (
          <div className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
            <div className="eyebrow">Key spec</div>
            <div style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--ink)' }}>{sop.note}</div>
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {sop.tags.map((t) => (
          <TagChip key={t.label} {...t} />
        ))}
      </div>

      <section className="col" style={{ gap: 10 }}>
        <h3 className="card-title">
          <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--accent)' }}>
            history
          </span>
          Change log
        </h3>
        {sop.changes.map((c, i) => (
          <details key={c.rev} className="glass-inset change-entry" open={i === 0}>
            <summary className="row between" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 8 }}>
                <span className="chip chip-accent">Rev {c.rev}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>{c.date}</span>
              </span>
              <span className="material-symbols-outlined change-chevron" style={{ fontSize: 18, color: 'var(--faint)' }}>
                expand_more
              </span>
            </summary>
            <p style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: 8 }}>{c.reason}</p>
            <pre className="mono diff-block">
              {c.lines.map((l) => (
                <span key={`${l.op}${l.text}`} className={l.op === '+' ? 'diff-add' : 'diff-del'}>
                  {l.op} {l.text}
                  {'\n'}
                </span>
              ))}
            </pre>
            <div className="kpi-hint" style={{ marginTop: 6 }}>
              {c.author}
            </div>
          </details>
        ))}
      </section>
    </SideDrawer>
  );
}
