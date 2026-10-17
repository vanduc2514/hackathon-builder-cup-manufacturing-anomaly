// Static SVG schematic preview (TKT-076 / Issue #277 — AC-TOP-28b).
// Renders one of the 30 topology preview SVGs that the Designer shipped
// in `.stitch/previews/topology/` and that we copy verbatim into
// `apps/web/public/previews/topology/` at build time. The component is
// purely presentational: it never speaks to telemetry or the blackboard,
// so it is safe to mount in jsdom without faking any async source.
import React from 'react';

interface StaticPreviewSVGProps {
  /** Topology node id; used to look up `/previews/topology/${nodeId}.svg`. */
  nodeId: string;
  /** Optional alt text override; defaults to a stable descriptive label. */
  alt?: string;
  /** Optional extra className applied to the wrapper. */
  className?: string;
}

const StaticPreviewSVG = React.memo(function StaticPreviewSVG({
  nodeId,
  alt,
  className,
}: StaticPreviewSVGProps): React.ReactElement {
  const src = `/previews/topology/${nodeId}.svg`;
  const label = alt ?? `Topology node ${nodeId} schematic preview`;
  return (
    <div
      className={`static-preview-svg${className ? ` ${className}` : ''}`}
      data-testid={`static-preview-${nodeId}`}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0.5rem',
        background: 'rgba(244,246,255,0.6)',
        border: '1px solid var(--hair)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <img
        src={src}
        alt={label}
        loading="lazy"
        decoding="async"
        style={{
          maxWidth: '100%',
          maxHeight: 220,
          height: 'auto',
          display: 'block',
        }}
      />
    </div>
  );
});

export default StaticPreviewSVG;