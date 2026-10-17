// Final-tier placeholder shown when a topology node has neither a custom
// React component preview nor a static SVG (TKT-076 / Issue #277 —
// AC-TOP-28c fallback hierarchy). Keeps the drawer layout stable.
import React from 'react';

interface NoPreviewPlaceholderProps {
  nodeId: string;
}

export default function NoPreviewPlaceholder({
  nodeId,
}: NoPreviewPlaceholderProps): React.ReactElement {
  return (
    <div
      data-testid={`no-preview-${nodeId}`}
      style={{
        padding: '1.25rem 1rem',
        borderRadius: 'var(--r-md)',
        border: '1px dashed var(--hair)',
        background: 'rgba(244,246,255,0.4)',
        color: 'var(--muted)',
        fontSize: '0.82rem',
        textAlign: 'center',
      }}
    >
      Schematic preview not yet published for{' '}
      <span className="mono" style={{ color: 'var(--ink-2)' }}>
        {nodeId}
      </span>
      .
    </div>
  );
}