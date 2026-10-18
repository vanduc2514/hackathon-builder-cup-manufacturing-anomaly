// EightDSteps: the D1–D8 list in plain language — done disciplines get a green tick, missing ones read "not filled in yet".
import React from 'react';
import type { EightDStep } from '../../lib/eightD';
import MarkdownViewer from '../MarkdownViewer';

interface EightDStepsProps {
  steps: EightDStep[];
}

export default function EightDSteps({ steps }: EightDStepsProps): React.ReactElement {
  return (
    <ol className="eightd">
      {steps.map((s) => (
        <li key={s.d} className={s.done ? 'eightd-done' : 'eightd-todo'}>
          <span className="eightd-d mono">{s.d}</span>
          <span className="col" style={{ minWidth: 0, flex: 1, gap: 3 }}>
            <span className="row between" style={{ gap: 8 }}>
              <span className="eightd-title">{s.title}</span>
              <span className="eightd-term">{s.term}</span>
            </span>
            {s.body ? (
              <MarkdownViewer source={s.body} className="eightd-body" />
            ) : (
              <span className="eightd-body eightd-empty">Not filled in yet.</span>
            )}
            {s.detail && <span className="kpi-hint">{s.detail}</span>}
          </span>
          <span
            className={`material-symbols-outlined ${s.done ? 'icon-fill' : ''}`}
            style={{ fontSize: 20, color: s.done ? 'var(--green)' : 'var(--faint)', flexShrink: 0 }}
            aria-label={s.done ? 'Done' : 'Not done yet'}
          >
            {s.done ? 'check_circle' : 'radio_button_unchecked'}
          </span>
        </li>
      ))}
    </ol>
  );
}
