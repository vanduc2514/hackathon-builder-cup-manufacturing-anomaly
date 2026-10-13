// ProductionLine: real-time machine flow CNC-01 → CNC-02 → CNC-03 → IM-05 → CAM-LINE01-EOL with suspect highlighting.
import React from 'react';
import type { IncidentState } from '../types';
import { isIncidentActive } from '../lib/incident';

interface ProductionLineProps {
  incident: IncidentState | null;
}

type NodeState = 'normal' | 'suspect' | 'repair' | 'verify' | 'flagged';

interface StationDef {
  id: string;
  role: string;
  icon: string;
  metricLabel: string;
  metric: (incident: IncidentState | null, suspect: boolean) => string;
}

const STATIONS: StationDef[] = [
  { id: 'CNC-01', role: 'Op-10 Roughing', icon: 'precision_manufacturing', metricLabel: 'Vib', metric: () => '1.46 mm/s' },
  {
    id: 'CNC-02',
    role: 'Op-20 Finishing · T07',
    icon: 'precision_manufacturing',
    metricLabel: 'Vib',
    metric: (inc, suspect) => {
      const v = inc?.latest_telemetry?.machine_id === 'CNC-02' ? inc.latest_telemetry.spindle_vibration : suspect ? 2.14 : 1.49;
      return `${v.toFixed(2)} mm/s`;
    },
  },
  { id: 'CNC-03', role: 'Op-30 Boring', icon: 'precision_manufacturing', metricLabel: 'Vib', metric: () => '1.51 mm/s' },
  {
    id: 'IM-05',
    role: 'Injection Molding',
    icon: 'heat_pump',
    metricLabel: 'Dew pt',
    metric: (inc, suspect) => {
      const d = inc?.latest_telemetry?.machine_id === 'IM-05' ? (inc.latest_telemetry as unknown as { dryer_dew_point?: number }).dryer_dew_point : undefined;
      return `${(d ?? (suspect ? -18 : -40)).toFixed(0)} °C`;
    },
  },
  {
    id: 'CAM-LINE01-EOL',
    role: 'Optical EOL Inspection',
    icon: 'photo_camera',
    metricLabel: 'Defect',
    metric: (inc) => `${((inc?.defect_rate ?? 0.0042) * 100).toFixed(2)}%`,
  },
];

const STATE_STYLE: Record<NodeState, { chip: string; label: string; tone?: string; color: string }> = {
  normal: { chip: 'chip-green', label: 'Normal', color: 'var(--green)' },
  suspect: { chip: 'chip-red', label: 'Suspect', tone: 'tone-red', color: 'var(--red)' },
  repair: { chip: 'chip-amber', label: 'Lockout · Repair', color: 'var(--amber)' },
  verify: { chip: 'chip-accent', label: 'Verifying', tone: 'tone-accent', color: 'var(--accent)' },
  flagged: { chip: 'chip-red', label: 'Breach', tone: 'tone-red', color: 'var(--red)' },
};

export default function ProductionLine({ incident }: ProductionLineProps): React.ReactElement {
  const active = isIncidentActive(incident);
  const status = incident?.status ?? 'normal';
  const suspectId = incident?.suspect_machine ?? null;
  const breached = (incident?.defect_rate ?? 0) >= (incident?.spc_ucl ?? 0.03);

  const stateFor = (id: string): NodeState => {
    if (id === 'CAM-LINE01-EOL') {
      if (status === 'verifying') return 'verify';
      return active && breached ? 'flagged' : 'normal';
    }
    if (!active || id !== suspectId) return 'normal';
    if (status === 'repairing') return 'repair';
    if (status === 'verifying') return 'verify';
    return 'suspect';
  };

  return (
    <section className="glass card-pad" aria-label="Production line visualizer">
      <div className="row between wrap" style={{ gap: 12, marginBottom: '1.1rem' }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              conveyor_belt
            </span>
            Production Line · Line-01
          </h2>
          <p className="card-sub">Live machine flow — serialized parts travel left to right into end-of-line optical QA.</p>
        </div>
        <span className="chip chip-accent">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            verified
          </span>
          SOP #209 · Closed-loop mitigation
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 28, position: 'relative' }}>
        {STATIONS.map((st, i) => {
          const s = stateFor(st.id);
          const style = STATE_STYLE[s];
          const isSuspect = s === 'suspect' || s === 'flagged';
          return (
            <div key={st.id} style={{ position: 'relative' }}>
              {i < STATIONS.length - 1 && (
                <svg
                  aria-hidden="true"
                  width="28"
                  height="12"
                  viewBox="0 0 28 12"
                  style={{ position: 'absolute', right: -28, top: '50%', transform: 'translateY(-50%)', overflow: 'visible' }}
                >
                  <line
                    x1="0"
                    y1="6"
                    x2="22"
                    y2="6"
                    stroke={active ? 'var(--red)' : 'var(--accent)'}
                    strokeOpacity="0.55"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    style={{ animation: 'flowDash 0.9s linear infinite' }}
                  />
                  <path d="M21 2 L27 6 L21 10" fill="none" stroke={active ? 'var(--red)' : 'var(--accent)'} strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <div
                className={`glass-inset ${style.tone ?? ''}`}
                style={{
                  padding: '0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  height: '100%',
                  borderRadius: 18,
                  animation: isSuspect ? 'shake 0.5s ease-in-out 2' : undefined,
                  boxShadow: isSuspect ? '0 10px 26px -12px rgba(229,72,77,0.55)' : undefined,
                }}
              >
                <div className="row between">
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      display: 'grid',
                      placeItems: 'center',
                      background: s === 'normal' ? 'rgba(255,255,255,0.9)' : style.color,
                      color: s === 'normal' ? 'var(--ink-2)' : '#fff',
                      boxShadow: '0 2px 6px rgba(15,23,42,0.08)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
                      {st.icon}
                    </span>
                  </span>
                  <span className={`chip ${style.chip}`} style={{ fontSize: '0.62rem' }}>
                    <span className={`dot ${s !== 'normal' ? 'animate-pulse-glow' : ''}`} />
                    {style.label}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{st.id}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{st.role}</div>
                </div>
                <div className="row between" style={{ fontSize: '0.72rem', paddingTop: 8, borderTop: '1px solid var(--hair)' }}>
                  <span className="muted">{st.metricLabel}</span>
                  <span className="mono" style={{ fontWeight: 650, color: isSuspect ? '#c9343a' : 'var(--ink)' }}>
                    {st.metric(incident, isSuspect)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
