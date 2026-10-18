// IncidentsEmptyView: nominal line state display when no active anomalies are being investigated.
import React from 'react';
import { LINE_LABEL } from '../../lib/fleet';

interface IncidentsEmptyViewProps {
  onOpenSimulation: () => void;
  onNavigateHome: () => void;
}

export default function IncidentsEmptyView({
  onOpenSimulation,
  onNavigateHome,
}: IncidentsEmptyViewProps): React.ReactElement {
  return (
    <div
      className="page"
      style={{
        gap: '1.5rem',
        maxWidth: 1040,
        margin: '0 auto',
        width: '100%',
        minWidth: 0,
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}
    >
      <header className="col" style={{ gap: 6 }}>
        <nav aria-label="Breadcrumb" className="row" style={{ gap: 8, fontSize: '0.84rem', color: 'var(--text)' }}>
          <button type="button" className="crumb" onClick={onNavigateHome}>
            Overview
          </button>
          <span>/</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Incidents</span>
        </nav>
      </header>

      <section
        className="glass glass-strong col"
        style={{
          borderRadius: 24,
          padding: '2.5rem 1.75rem',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--green-soft)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--green)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 44 }}>
            check_circle
          </span>
        </div>

        <div className="col" style={{ gap: 6, maxWidth: 560 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 750,
              color: 'var(--ink)',
              margin: 0,
              letterSpacing: '-0.02em',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            All systems nominal on {LINE_LABEL}
          </h1>
          <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.95rem' }}>
            No active anomalies
          </p>
        </div>

        <div className="row wrap" style={{ gap: '0.75rem', marginTop: '0.75rem', justifyContent: 'center' }}>
          <button
            id="incidents-empty-inject-btn"
            type="button"
            className="btn btn-dark"
            onClick={onOpenSimulation}
            style={{ minHeight: 44, padding: '0 1.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
              sensors
            </span>
            Incident &amp; Factory Monitor
          </button>
          <button
            id="incidents-empty-back-btn"
            type="button"
            className="btn glass"
            onClick={onNavigateHome}
            style={{ minHeight: 44, padding: '0 1.25rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
              arrow_back
            </span>
            Back to Line Overview
          </button>
        </div>
      </section>
    </div>
  );
}
