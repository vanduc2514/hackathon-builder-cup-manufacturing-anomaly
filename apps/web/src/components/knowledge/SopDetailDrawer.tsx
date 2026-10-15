// SopDetailDrawer: curated engineering document details, sections, and critical citations.
import React from 'react';
import type { KnowledgeDocumentMeta } from '../../types';
import SideDrawer from '../SideDrawer';
import TagChip from './TagChip';
import { CATEGORY_LABELS } from '../../lib/knowledge';

interface SopDetailDrawerProps {
  document: KnowledgeDocumentMeta;
  onClose: () => void;
  onOpenWalkthrough?: (id: string) => void;
}

export default function SopDetailDrawer({
  document,
  onClose,
  onOpenWalkthrough,
}: SopDetailDrawerProps): React.ReactElement {
  return (
    <SideDrawer
      onClose={onClose}
      eyebrow={
        <>
          <span
            className="mono"
            style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}
          >
            {document.document_id}
          </span>
          <span className="chip chip-accent">
            {CATEGORY_LABELS[document.category] ?? document.category}
          </span>
          {document.revision && <span className="chip">{document.revision}</span>}
          {document.machines.length > 0 && (
            <span className="chip">{document.machines.join(', ')}</span>
          )}
        </>
      }
      title={document.title}
      footer={
        <>
          {onOpenWalkthrough && (
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => onOpenWalkthrough('walkthroughs')}
            >
              <span className="material-symbols-outlined">smart_display</span>
              Walkthroughs
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
            Close
          </button>
        </>
      }
    >
      {document.summary && (
        <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.55 }}>
          {document.summary}
        </p>
      )}

      <div className="drawer-facts">
        <div className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
          <div className="eyebrow">Category</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--ink)' }}>
            {CATEGORY_LABELS[document.category] ?? document.category}
          </div>
        </div>
        <div className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
          <div className="eyebrow">Total Pages</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent)' }}>
            {document.pages} {document.pages === 1 ? 'page' : 'pages'}
          </div>
        </div>
        {(document.last_revised || document.effective_date) && (
          <div className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
            <div className="eyebrow">Effective / Revised</div>
            <div className="mono" style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--ink)' }}>
              {document.last_revised ?? document.effective_date}
            </div>
          </div>
        )}
        {document.machines.length > 0 && (
          <div className="glass-inset" style={{ padding: '0.7rem 0.85rem' }}>
            <div className="eyebrow">Target Machines</div>
            <div className="mono" style={{ fontWeight: 650, fontSize: '0.86rem', color: 'var(--ink)' }}>
              {document.machines.join(', ')}
            </div>
          </div>
        )}
      </div>

      {document.linked_sops.length > 0 && (
        <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
          <span className="kpi-hint" style={{ fontWeight: 600 }}>Linked SOPs:</span>
          {document.linked_sops.map((sop) => (
            <span key={sop} className="chip chip-accent" style={{ fontFamily: 'var(--font-mono)' }}>
              {sop}
            </span>
          ))}
        </div>
      )}

      {document.tags.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {document.tags.map((t) => (
            <TagChip key={t} label={t} tone="neutral" />
          ))}
        </div>
      )}

      {document.sections.length > 0 && (
        <section className="col" style={{ gap: 10 }}>
          <h3 className="card-title">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 19, color: 'var(--accent)' }}
            >
              menu_book
            </span>
            Document Sections
          </h3>
          <div className="col" style={{ gap: 6 }}>
            {document.sections.map((s) => (
              <div
                key={`${s.page}-${s.title}`}
                className="glass-inset row between"
                style={{ padding: '0.6rem 0.85rem', alignItems: 'center' }}
              >
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {s.title}
                </span>
                <span
                  className="mono chip"
                  style={{ fontSize: '0.72rem', color: 'var(--muted)', flexShrink: 0 }}
                >
                  p. {s.page}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {document.key_citations.length > 0 && (
        <section className="col" style={{ gap: 10 }}>
          <h3 className="card-title">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 19, color: 'var(--accent)' }}
            >
              format_quote
            </span>
            Key Citations & Guidance
          </h3>
          <div className="col" style={{ gap: 8 }}>
            {document.key_citations.map((c, i) => (
              <div
                key={`${c.document_id}-${c.page_number}-${i}`}
                className="glass-inset col"
                style={{ padding: '0.75rem 0.9rem', gap: 6 }}
              >
                <div className="row between" style={{ gap: 8 }}>
                  <span
                    className="mono"
                    style={{ fontSize: '0.74rem', color: 'var(--accent)', fontWeight: 650 }}
                  >
                    {c.section ?? `Section p.${c.page_number}`}
                  </span>
                  {c.page_number && (
                    <span className="mono chip" style={{ fontSize: '0.7rem' }}>
                      p. {c.page_number}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.5 }}>
                  {c.snippet}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </SideDrawer>
  );
}
