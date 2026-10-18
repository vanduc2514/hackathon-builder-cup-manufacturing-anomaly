// RootCauseCard: 5-level Why chain and 6M Ishikawa fishbone, grounded by the Root Cause agent finding.
import React, { useState } from 'react';
import type { AgentFinding, FiveWhysStep } from '../types';
import { isIshikawaCategoryCausal, matchesAgentRole } from '../lib/incident';

interface RootCauseCardProps {
  findings: AgentFinding[];
  rootCause: string | null;
  defectLabel?: string;
  status?: string;
  isActive?: boolean;
}

type View = 'whys' | 'fishbone';

const SIX_M = ['Machine', 'Method', 'Material', 'Man', 'Measurement', 'Mother Nature'];

function normaliseIshikawa(raw: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  SIX_M.forEach((m) => {
    const key = Object.keys(raw).find((k) => k.toLowerCase().startsWith(m.toLowerCase().split(' ')[0]) || (m === 'Mother Nature' && /milieu|environment/i.test(k)));
    out[m] = key ? raw[key] : [];
  });
  return out;
}

export default function RootCauseCard({ findings, rootCause, defectLabel = 'Surface scratch', status, isActive }: RootCauseCardProps): React.ReactElement {
  const [view, setView] = useState<View>('whys');
  const rca = [...findings].reverse().find((f) => f.five_whys?.length || matchesAgentRole(f, 'root_cause') || /root/i.test(f.agent_name));
  const whys: FiveWhysStep[] = rca?.five_whys?.length ? rca.five_whys : [];
  const rawIshikawa = rca?.ishikawa ?? findings.slice().reverse().find((f) => f.ishikawa && Object.keys(f.ishikawa).length > 0)?.ishikawa ?? null;
  const ishikawa = rawIshikawa ? normaliseIshikawa(rawIshikawa) : null;
  const hasCategories = Boolean(ishikawa && Object.values(ishikawa).some((items) => items.length > 0));
  const isCausal = (cat: string) => (ishikawa ? isIshikawaCategoryCausal(cat, ishikawa[cat], rca?.finding) : false);
  const confidence = rca?.confidence;
  const conclusion = rootCause ?? rca?.finding ?? (whys.length > 0 ? whys[whys.length - 1]?.answer : null);
  const isAnalyzing = isActive ?? (status ? !['normal', 'closed', 'dismissed'].includes(status) : !conclusion);

  return (
    <section className="glass card-pad" aria-label="Root cause analysis">
      <div className="row between wrap" style={{ gap: 10, marginBottom: 12 }}>
        <div>
          <h2 className="card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>
              account_tree
            </span>
            Root Cause Analysis
          </h2>
          <p className="card-sub">5-Whys causal chain &amp; 6M Ishikawa · grounded in OEM manuals and past 8D reports</p>
        </div>
        <div className="seg">
          <button id="rca-view-whys" type="button" className={view === 'whys' ? 'active' : ''} onClick={() => setView('whys')}>
            5-Whys
          </button>
          <button id="rca-view-fishbone" type="button" className={view === 'fishbone' ? 'active' : ''} onClick={() => setView('fishbone')}>
            Ishikawa 6M
          </button>
        </div>
      </div>

      <div className="glass-inset tone-accent row between" style={{ padding: '0.6rem 0.85rem', marginBottom: 12, gap: 10 }}>
        <span className="row" style={{ gap: 8, fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18 }}>
            {conclusion ? 'verified' : 'hourglass_top'}
          </span>
          {conclusion ? 'Concluded root cause' : 'Root cause analysis pending'}
        </span>
        {confidence != null ? (
          <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: confidence >= 0.7 ? 'var(--accent)' : '#b4710a' }}>
            {(confidence * 100).toFixed(1)}% confidence {confidence < 0.7 ? '· field evidence requested' : ''}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
            {isAnalyzing ? 'Analysis in progress…' : 'No conclusion yet'}
          </span>
        )}
      </div>

      {view === 'whys' ? (
        whys.length > 0 ? (
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }} className="stagger">
            {whys.map((w, i) => {
              const last = i === whys.length - 1;
              return (
                <li
                  key={w.level}
                  className={last ? 'glass-dark' : 'glass-inset'}
                  style={{
                    padding: '0.75rem 0.9rem',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    marginLeft: last ? 0 : Math.min(i, 3) * 6,
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: last ? '#fff' : 'rgba(91,91,240,0.12)',
                      color: last ? 'var(--ink)' : 'var(--accent)',
                    }}
                  >
                    {w.level}
                  </span>
                  <span className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                    <span className="eyebrow" style={{ color: last ? '#a5b4fc' : 'var(--faint)' }}>
                      {last ? 'Level 5 · Root cause conclusion' : w.why}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: last ? '#fff' : 'var(--ink-2)' }}>
                      {last && conclusion ? conclusion : w.answer}
                    </span>
                    {(w.evidence || w.citation) && (
                      <span className="row wrap" style={{ gap: 6, marginTop: 2 }}>
                        {w.evidence && (
                          <span className="chip mono" style={{ fontSize: '0.62rem', background: last ? 'rgba(255,255,255,0.1)' : undefined, color: last ? '#e2e8f0' : undefined, borderColor: last ? 'rgba(255,255,255,0.15)' : undefined }}>
                            Ev: {w.evidence}
                          </span>
                        )}
                        {w.citation && (
                          <span className="chip chip-accent mono" style={{ fontSize: '0.62rem', background: last ? 'rgba(165,180,252,0.18)' : undefined, color: last ? '#c7d2fe' : undefined }}>
                            Ref: {w.citation}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="glass-inset col" style={{ alignItems: 'center', padding: '2rem 1rem', gap: 6, textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--faint)' }}>
              {isAnalyzing ? 'hourglass_top' : 'account_tree'}
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              {isAnalyzing ? 'Root-cause analysis in progress...' : 'No 5-Whys chain yet'}
            </span>
            <span className="muted" style={{ fontSize: '0.74rem' }}>
              {isAnalyzing
                ? 'The 5-Whys chain will appear once the Root Cause agent finishes its analysis.'
                : 'No 5-Whys data for this incident.'}
            </span>
          </div>
        )
      ) : hasCategories && ishikawa ? (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) 150px', gridTemplateRows: 'auto 46px auto', gap: '0 12px' }}>
            {[0, 1, 2].map((i) => (
              <FishboneCard key={SIX_M[i]} index={i} name={SIX_M[i]} items={ishikawa[SIX_M[i]]} causal={isCausal(SIX_M[i])} />
            ))}
            <div style={{ gridRow: '1 / span 3', gridColumn: 4, display: 'flex', alignItems: 'center' }}>
              <div className="glass-dark" style={{ padding: '0.8rem', width: '100%', textAlign: 'center' }}>
                <div className="eyebrow" style={{ color: '#fca5a5' }}>
                  Effect
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 2 }}>{defectLabel}</div>
                <div className="mono" style={{ fontSize: '0.64rem', opacity: 0.7, marginTop: 2 }}>
                  CAM-LINE01-EOL
                </div>
              </div>
            </div>
            <svg aria-hidden="true" style={{ gridColumn: '1 / span 3', gridRow: 2, width: '100%', height: 46, overflow: 'visible' }} preserveAspectRatio="none" viewBox="0 0 300 46">
              <line x1="0" y1="23" x2="300" y2="23" stroke="#0b1220" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M294 17 L304 23 L294 29" fill="none" stroke="#0b1220" strokeWidth="2.5" strokeLinejoin="round" />
              {[50, 150, 250].map((cx) => (
                <g key={cx}>
                  <line x1={cx - 22} y1="0" x2={cx} y2="23" stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={cx - 22} y1="46" x2={cx} y2="23" stroke="#94a3b8" strokeWidth="1.5" />
                </g>
              ))}
            </svg>
            {[3, 4, 5].map((i) => (
              <FishboneCard key={SIX_M[i]} index={i} name={SIX_M[i]} items={ishikawa[SIX_M[i]]} causal={isCausal(SIX_M[i])} />
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-inset col" style={{ alignItems: 'center', padding: '2rem 1rem', gap: 6, textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--faint)' }}>
            {isAnalyzing ? 'hourglass_top' : 'schema'}
          </span>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            {isAnalyzing ? 'Root-cause analysis in progress...' : 'No Ishikawa diagram yet'}
          </span>
          <span className="muted" style={{ fontSize: '0.74rem' }}>
            {isAnalyzing
              ? 'The Ishikawa 6M diagram will appear once the Root Cause agent identifies the causal factors.'
              : 'No Ishikawa 6M data for this incident.'}
          </span>
        </div>
      )}
    </section>
  );
}

interface FishboneCardProps {
  index: number;
  name: string;
  items: string[];
  causal: boolean;
}

function FishboneCard({ index, name, items, causal }: FishboneCardProps): React.ReactElement {
  return (
    <div className={`glass-inset ${causal ? 'tone-red' : ''}`} style={{ padding: '0.65rem 0.75rem' }}>
      <div className="row between">
        <span className="eyebrow" style={{ color: causal ? '#c9343a' : 'var(--accent)' }}>
          {index + 1}. {name}
        </span>
        {causal && <span className="chip chip-red" style={{ fontSize: '0.58rem', padding: '1px 6px' }}>Causal</span>}
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text)', marginTop: 4, lineHeight: 1.4 }}>
        {items.length ? items.join('; ') : <span className="muted">No contributing factor</span>}
      </div>
    </div>
  );
}
