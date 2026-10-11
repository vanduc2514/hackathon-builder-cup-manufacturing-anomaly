// TagChip: small rounded-rect label used on SOP and walkthrough cards.
import React from 'react';
import type { Tag } from '../../lib/knowledge';

const TONE_CLASS: Record<Tag['tone'], string> = {
  neutral: '',
  accent: 'chip-accent',
  red: 'chip-red',
  green: 'chip-green',
};

export default function TagChip({ label, tone, icon }: Tag): React.ReactElement {
  return (
    <span className={`chip ${TONE_CLASS[tone]}`} style={{ borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem' }}>
      {icon && (
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
          {icon}
        </span>
      )}
      {label}
    </span>
  );
}
