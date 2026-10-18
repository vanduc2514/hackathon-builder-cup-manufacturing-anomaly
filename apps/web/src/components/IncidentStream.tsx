// IncidentStream: reverse-chronological multi-agent findings feed with confidence, evidence and SOP citations.
import React, { useState } from 'react';
import type { AgentFinding } from '../types';
import { agentIcon, formatLocalClock } from '../lib/incident';

interface IncidentStreamProps {
  findings: AgentFinding[];
  maxHeight?: number;
}

const PHASE_COLOR: Record<string, string> = { A: '#e5484d', B: '#f5a524', C: '#3b82f6', D: '#12a150' };

function phaseKey(phase: string): string {
  const p = phase.trim().toUpperCase();
  if (PHASE_COLOR[p]) return p;
  const m = p.match(/PHASE\s*([ABCD])/);
  return m ? m[1] : 'B';
}

export default function IncidentStream({ findings, maxHeight = 560 }: IncidentStreamProps): React.ReactElement {
  const [open, setOpen] = useState<number | null>(0);
  const ordered = [...findings].reverse();

  return (
    <section className="glass card-pad" aria-label="Multi-agent incident findings feed" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              forum
            </span>
            Agent Findings Feed
          </h2>
          <p className="card-sub">Newest first · every claim carries evidence and a citation</p>
        </div>
        <span className="chip chip-accent mono">{findings.length} findings</span>
      </div>

      {ordered.length === 0 ? (
        <div className="glass-inset col" style={{ alignItems: 'center', padding: '2rem 1rem', gap: 6, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--faint)' }}>
            hourglass_empty
          </span>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>No findings yet</span>
          <span className="muted" style={{ fontSize: '0.74rem' }}>
            Agents post here as soon as the Orchestrator opens an incident.
          </span>
        </div>
      ) : (
        <ol className="stagger" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight, paddingRight: 4 }}>
          {ordered.map((f, i) => {
            const pk = phaseKey(f.phase);
            const color = PHASE_COLOR[pk];
            const isOpen = open === i;
            return (
              <li key={`${f.agent_id}-${f.timestamp}-${i}`}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="glass-inset"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.8rem 0.9rem',
                    display: 'flex',
                    gap: 12,
                    borderLeft: `3px solid ${color}`,
                    background: i === 0 ? 'rgba(255,255,255,0.88)' : undefined,
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      background: `${color}18`,
                      color,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {agentIcon(f.agent_id, f.agent_name)}
                    </span>
                  </span>
                  <span className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                    <span className="row between" style={{ gap: 8 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <strong style={{ fontSize: '0.8rem' }}>{f.agent_name}</strong>
                        <span className="chip" style={{ fontSize: '0.6rem', padding: '1px 7px', color, borderColor: `${color}40` }}>
                          Phase {pk}
                        </span>
                      </span>
                      <span className="mono muted" style={{ fontSize: '0.66rem' }}>
                        {formatLocalClock(f.timestamp, true)}
                      </span>
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>{f.finding}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="progress" style={{ height: 4, flex: 1, maxWidth: 140 }}>
                        <span style={{ width: `${f.confidence * 100}%`, background: f.confidence >= 0.7 ? undefined : 'var(--amber)' }} />
                      </span>
                      <span className="mono" style={{ fontSize: '0.66rem', fontWeight: 700, color: f.confidence >= 0.7 ? 'var(--accent)' : '#b4710a' }}>
                        {(f.confidence * 100).toFixed(1)}%
                      </span>
                    </span>
                    {isOpen && (
                      <span className="col" style={{ gap: 6, marginTop: 4, animation: 'fadeUp 0.3s var(--ease) both' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text)', background: 'rgba(118,128,160,0.08)', padding: '6px 9px', borderRadius: 9 }}>
                          <strong>Evidence:</strong> {f.evidence}
                        </span>
                        {f.citation && (
                          <span className="chip chip-accent" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                              menu_book
                            </span>
                            {f.citation}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
