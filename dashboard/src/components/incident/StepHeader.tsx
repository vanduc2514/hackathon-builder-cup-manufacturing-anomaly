// StepHeader: numbered incident-step pill with subtitle and an optional trailing status chip.
import React from 'react';

interface StepHeaderProps {
  step: number;
  title: string;
  subtitle: React.ReactNode;
  tone?: 'dark' | 'accent' | 'green';
  trailing?: React.ReactNode;
  emphasis?: boolean;
}

const PILL: Record<NonNullable<StepHeaderProps['tone']>, React.CSSProperties> = {
  dark: { background: 'var(--ink)', color: '#fff' },
  accent: { background: 'var(--accent)', color: '#fff' },
  green: { background: 'var(--green-soft)', color: '#0e8a43', border: '1px solid rgba(18,161,80,0.25)' },
};

export default function StepHeader({
  step,
  title,
  subtitle,
  tone = 'dark',
  trailing,
  emphasis = false,
}: StepHeaderProps): React.ReactElement {
  return (
    <div className="row between wrap" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <span
          className="mono"
          style={{ ...PILL[tone], padding: '5px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.02em' }}
        >
          STEP {step}: {title}
        </span>
        <span
          style={{
            fontSize: emphasis ? '1.1rem' : '0.8rem',
            fontWeight: emphasis ? 700 : 600,
            color: emphasis ? 'var(--ink)' : 'var(--text)',
            textTransform: emphasis ? 'none' : 'uppercase',
            letterSpacing: emphasis ? '-0.01em' : '0.02em',
          }}
        >
          {subtitle}
        </span>
      </div>
      {trailing}
    </div>
  );
}
