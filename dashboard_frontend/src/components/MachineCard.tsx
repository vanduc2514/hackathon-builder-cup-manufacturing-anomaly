// MachineCard: compact glass station card with two live readings, a footer note and an action.
import React from 'react';

interface MachineReading {
  label: string;
  value: string;
  unit: string;
}

interface MachineCardProps {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  tone: 'normal' | 'alert' | 'good';
  readings: [MachineReading, MachineReading];
  footer: string;
  actionLabel: string;
  actionIcon: string;
  onAction: () => void;
}

export default function MachineCard({
  id,
  title,
  subtitle,
  icon,
  badge,
  tone,
  readings,
  footer,
  actionLabel,
  actionIcon,
  onAction,
}: MachineCardProps): React.ReactElement {
  const alert = tone === 'alert';
  return (
    <article id={id} className={`glass glass-hover card-pad ${alert ? 'tone-red' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              display: 'grid',
              placeItems: 'center',
              background: alert ? 'var(--red)' : 'rgba(91,91,240,0.1)',
              color: alert ? '#fff' : 'var(--accent)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {icon}
            </span>
          </span>
          <div className="col">
            <span style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{subtitle}</span>
          </div>
        </div>
        <span className={`chip ${alert ? 'chip-red' : tone === 'good' ? 'chip-green' : 'chip-accent'}`}>{badge}</span>
      </div>
      <div className="glass-inset" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0.75rem 0.9rem', gap: 10 }}>
        {readings.map((r) => (
          <div key={r.label}>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>{r.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: alert ? '#c9343a' : 'var(--ink)' }}>
              {r.value}
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--muted)', marginLeft: 3 }}>{r.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="row between" style={{ gap: 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{footer}</span>
        <button type="button" className="btn btn-sm" onClick={onAction}>
          {actionLabel}
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            {actionIcon}
          </span>
        </button>
      </div>
    </article>
  );
}
