// EightDReportCard: collapsible 8D report in the Sign-off step — progress, D1–D8 in plain language, download and Scribe text.
import React, { useState } from 'react';
import type { VerifiedSolution } from '../../lib/eightD';
import { eightDMarkdown, eightDSteps, proofComplete } from '../../lib/eightD';
import EightDSteps from './EightDSteps';

interface EightDReportCardProps {
  solution: VerifiedSolution;
  defaultOpen: boolean;
}

export default function EightDReportCard({ solution: s, defaultOpen }: EightDReportCardProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const steps = eightDSteps(s);
  const done = steps.filter((x) => x.done).length;
  const ready = proofComplete(s);
  const status = s.approved
    ? { label: 'Approved', cls: 'chip-green', icon: 'verified' }
    : ready
      ? { label: 'Ready to sign', cls: 'chip-accent', icon: 'draw' }
      : { label: 'Draft', cls: 'chip-amber', icon: 'edit_note' };

  const download = () => {
    const blob = new Blob([eightDMarkdown(s)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `8D-${s.incidentId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="inset eightd-card" aria-label="8D report">
      <button type="button" className="eightd-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="eightd-card-body">
        <span className="eightd-card-icon material-symbols-outlined">assignment_turned_in</span>
        <span className="col" style={{ minWidth: 0, flex: 1, gap: 2, textAlign: 'left' }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="eightd-card-title">8D Report</span>
            <span className="mono kpi-hint">#8D-{s.incidentId}</span>
          </span>
          <span className="kpi-hint">
            {open ? 'What happened, why, what was fixed and how it was proven.' : `${done} of 8 sections filled in`}
          </span>
        </span>
        <span className="eightd-progress" aria-label={`${done} of 8 sections filled in`}>
          {steps.map((x) => (
            <span key={x.d} data-done={x.done} />
          ))}
        </span>
        <span className={`chip ${status.cls}`}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14 }}>
            {status.icon}
          </span>
          {status.label}
        </span>
        <span className="material-symbols-outlined step-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      {open && (
        <div id="eightd-card-body" className="col" style={{ gap: 10, marginTop: 12, animation: 'fadeUp 0.3s var(--ease) both' }}>
          {!s.approved && (
            <p className="eightd-hint">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                info
              </span>
              {ready
                ? 'Read each section. If it matches what happened on the floor, approve below to release the line.'
                : 'The agents fill this in as the incident moves on. It can be approved once the good-part streak is complete.'}
            </p>
          )}
          <EightDSteps steps={steps} />
          <div className="row wrap" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={download}>
              <span className="material-symbols-outlined">download</span>
              Download .md
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(eightDMarkdown(s))}>
              <span className="material-symbols-outlined">content_copy</span>
              Copy
            </button>
          </div>
          {s.report8d && (
            <details className="evidence">
              <summary>
                Original 8D text (Incident Scribe)
                <span className="material-symbols-outlined agent-trail-chevron" style={{ fontSize: 16 }}>
                  expand_more
                </span>
              </summary>
              <pre className="mono diff-block" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {s.report8d}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
