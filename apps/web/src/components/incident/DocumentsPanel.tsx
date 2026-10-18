// DocumentsPanel: work order and SOP proposal drafted by the Incident Scribe (the 8D lives in the Sign-off step).
import React, { useState } from 'react';
import type { IncidentState } from '../../types';
import MarkdownViewer from '../MarkdownViewer';

interface DocumentsPanelProps {
  incident: IncidentState;
  ready: boolean;
}

type DocKey = 'work_order' | 'sop_proposal';

const DOCS: { key: DocKey; label: string; icon: string; file: string }[] = [
  { key: 'work_order', label: 'Work Order', icon: 'construction', file: 'work-order' },
  { key: 'sop_proposal', label: 'SOP Proposal', icon: 'menu_book', file: 'sop-proposal' },
];

function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return JSON.stringify(v, null, 2);
}

export default function DocumentsPanel({ incident, ready }: DocumentsPanelProps): React.ReactElement {
  const [active, setActive] = useState<DocKey>('work_order');
  const current = DOCS.find((d) => d.key === active) ?? DOCS[0];
  const text = asText(incident.documents?.[active]);

  const download = () => {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.file}-${incident.incident_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="col" style={{ gap: 10 }} id="incident-documents">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="eyebrow">Incident Scribe documents</span>
        <div className="seg">
          {DOCS.map((d) => (
            <button key={d.key} type="button" className={active === d.key ? 'active' : ''} onClick={() => setActive(d.key)}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {d.icon}
              </span>
              {d.label}
              {asText(incident.documents?.[d.key]) ? '' : ' ·'}
            </button>
          ))}
        </div>
      </div>
      {text ? (
        <>
          <div
            style={{
              maxHeight: 320,
              overflow: 'auto',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid var(--hair)',
              borderRadius: 12,
              padding: '0.8rem 1rem',
            }}
          >
            <MarkdownViewer source={text} />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={download}>
              <span className="material-symbols-outlined">download</span>
              Download .md
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(text)}>
              <span className="material-symbols-outlined">content_copy</span>
              Copy
            </button>
          </div>
        </>
      ) : (
        <p style={{ fontSize: '0.86rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          {ready
            ? `${current.label} was not produced for this incident.`
            : `${current.label} is drafted by the Incident Scribe once the repair work order is issued.`}
        </p>
      )}
    </div>
  );
}
