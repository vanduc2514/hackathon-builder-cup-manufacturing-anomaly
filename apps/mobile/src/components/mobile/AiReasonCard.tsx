import React from 'react';
import type { AiReason } from '../../types/mobile';

interface AiReasonCardProps {
  title: string;
  reason: AiReason;
}

/** An agent finding from the incident board: what it concluded, the evidence, its citation and 5-Whys. */
export default function AiReasonCard({ title, reason }: AiReasonCardProps): React.ReactElement {
  return (
    <details className="m-glass m-details">
      <summary>
        <span className="m-row" style={{ gap: 6 }}>
          <span className="material-symbols-outlined ms-fill" style={{ fontSize: 18, color: 'var(--accent)' }}>
            psychology
          </span>
          {title}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>expand_more</span>
      </summary>
      <div className="m-col" style={{ gap: 8, marginTop: 10 }}>
        <p className="m-body" style={{ fontSize: 13 }}>{reason.finding}</p>
        <p className="m-sub" style={{ lineHeight: 1.45 }}>{reason.evidence}</p>
        {reason.fiveWhys && reason.fiveWhys.length > 0 && (
          <ul className="m-why" style={{ padding: 0, margin: 0 }}>
            {reason.fiveWhys.map((w) => (
              <li key={w.level}>
                <b>Why {w.level}?</b>
                {w.why} — {w.answer}
              </li>
            ))}
          </ul>
        )}
        <span className="m-cite">
          <span className="material-symbols-outlined">menu_book</span>
          {reason.citation} · {reason.agentName} · {reason.timestamp}
        </span>
      </div>
    </details>
  );
}
