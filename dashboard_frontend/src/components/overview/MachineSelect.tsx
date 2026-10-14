// MachineSelect: dropdown that scopes the OEE chart to the line or one machine, listing each one's current OEE.
import React, { useEffect, useRef, useState } from 'react';
import type { FleetRow } from '../../lib/fleet';
import { LINE_NAME } from '../../lib/fleet';
import { BAND_COLOR, oeeBand, type MachineOee } from '../../lib/oee';

interface MachineSelectProps {
  rows: FleetRow[];
  machines: MachineOee[];
  lineOee: number | null;
  scope: string | null;
  onScope: (machineId: string | null) => void;
}

interface Option {
  id: string | null;
  title: string;
  sub: string;
  oee: number | null;
  tone: string;
  hot: boolean;
}

export default function MachineSelect({ rows, machines, lineOee, scope, onScope }: MachineSelectProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options: Option[] = [
    {
      id: null,
      title: 'Whole line',
      sub: `${LINE_NAME} · all stations`,
      oee: lineOee,
      tone: lineOee !== null ? BAND_COLOR[oeeBand(lineOee)] : 'var(--faint)',
      hot: false,
    },
    ...rows.map((r, i): Option => {
      const m = machines.find((x) => x.id === r.id);
      const down = m?.down ?? false;
      const hot = down || r.status === 'critical';
      return {
        id: r.id,
        title: r.id,
        sub: `Step ${i + 1}${r.op ? ` · ${r.op}` : ''}`,
        oee: r.status === 'offline' || !m ? null : m.oee,
        tone: r.status === 'offline' ? 'var(--faint)' : hot ? 'var(--red)' : m ? BAND_COLOR[oeeBand(m.oee)] : 'var(--faint)',
        hot,
      };
    }),
  ];
  const current = options.find((o) => o.id === scope) ?? options[0];

  const pick = (id: string | null) => {
    onScope(id);
    setOpen(false);
  };

  return (
    <div ref={box} className="machine-select">
      <button type="button" className="machine-select-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="legend-dot" style={{ background: current.tone }} />
        <span className="col" style={{ minWidth: 0, textAlign: 'left' }}>
          <b>{current.title}</b>
          <span className="kpi-hint">{current.sub}</span>
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <ul className="glass-strong machine-select-menu" role="listbox" aria-label="Choose line or machine">
          {options.map((o) => (
            <li key={o.id ?? 'line'}>
              <button
                type="button"
                role="option"
                aria-selected={o.id === scope}
                className={`machine-option ${o.id === scope ? 'machine-option-on' : ''} ${o.hot ? 'machine-option-hot' : ''}`}
                onClick={() => pick(o.id)}
              >
                <span className="legend-dot" style={{ background: o.tone }} />
                <span className="col" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <b>{o.title}</b>
                  <span className="kpi-hint">{o.sub}</span>
                </span>
                <span className="mono machine-option-oee">{o.oee !== null ? `${(o.oee * 100).toFixed(1)}%` : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
