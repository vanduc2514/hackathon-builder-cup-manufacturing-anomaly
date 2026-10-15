import React from 'react';

interface ConfidenceRingProps {
  /** 0–100, or null when there is no value yet (renders an empty ring with "—"). */
  value: number | null;
  size?: number;
  color?: string;
  label?: string;
}

/** Circular progress ring used for AI confidence and verification progress. */
export default function ConfidenceRing({
  value,
  size = 54,
  color = '#5b4cf5',
  label,
}: ConfidenceRingProps): React.ReactElement {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="m-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(118,128,160,0.18)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="val">{label ?? (value === null ? '—' : `${Math.round(pct)}%`)}</div>
    </div>
  );
}
