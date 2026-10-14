// OeeLossCard: splits the gap between 100% and line OEE into planned, downtime, speed and quality losses, naming the machine behind each.
import React from 'react';
import type { LossKind, OeeLoss } from '../../lib/oee';
import { OEE_TARGET } from '../../lib/fleet';

interface OeeLossCardProps {
  losses: OeeLoss[];
  oee: number | null;
  onSelectMachine: (machineId: string) => void;
}

const LOSS_ICON: Record<LossKind, string> = {
  planned: 'schedule',
  downtime: 'build',
  speed: 'speed',
  quality: 'report',
};

const pts = (v: number) => `${(v * 100).toFixed(1)} pts`;

export default function OeeLossCard({ losses, oee, onSelectMachine }: OeeLossCardProps): React.ReactElement {
  return (
    <section className="glass card-pad col loss-card">
      <div className="row between" style={{ gap: 8, alignItems: 'baseline' }}>
        <h2 className="card-title">Where OEE Is Lost</h2>
        <span className="kpi-hint">100% − losses = OEE</span>
      </div>

      {oee !== null && (
        <div className="loss-stack" role="img" aria-label={`OEE ${(oee * 100).toFixed(1)}% plus ${losses.length} loss categories, target ${(OEE_TARGET * 100).toFixed(0)}%`}>
          <span className="loss-seg loss-oee" style={{ flexGrow: oee }} title={`OEE ${(oee * 100).toFixed(1)}%`} />
          {losses
            .filter((l) => l.value > 0.0005)
            .map((l) => (
              <span key={l.kind} className={`loss-seg loss-${l.kind} ${l.incidentId ? 'loss-hot' : ''}`} style={{ flexGrow: l.value }} title={`${l.label}: ${pts(l.value)}`} />
            ))}
          <i style={{ left: `${OEE_TARGET * 100}%` }} title={`Target ${(OEE_TARGET * 100).toFixed(0)}%`} />
        </div>
      )}

      <ul className="col loss-list">
        {losses.map((l) => {
          const hot = l.incidentId !== null;
          const zero = l.value < 0.0005;
          const clickable = l.machine !== null && !zero;
          const body = (
            <>
              <span className={`loss-icon loss-icon-${l.kind}`}>
                <span className="material-symbols-outlined">{LOSS_ICON[l.kind]}</span>
              </span>
              <span className="col" style={{ minWidth: 0, flex: 1 }}>
                <b className="loss-label">{l.label}</b>
                <span className="kpi-hint loss-detail" title={l.detail}>
                  {l.detail}
                </span>
              </span>
              <span className="mono loss-value" style={{ color: hot ? '#c9343a' : zero ? 'var(--faint)' : 'var(--ink)' }}>
                {zero ? '0.0 pts' : `−${pts(l.value)}`}
              </span>
            </>
          );
          return (
            <li key={l.kind}>
              {clickable ? (
                <button
                  type="button"
                  className={`glass-inset loss-item ${hot ? 'loss-item-hot' : ''}`}
                  onClick={() => onSelectMachine(l.machine as string)}
                  title={`Show ${l.machine} in the OEE chart`}
                >
                  {body}
                </button>
              ) : (
                <div className="glass-inset loss-item">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
