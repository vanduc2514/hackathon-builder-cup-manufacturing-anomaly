// AcousticWaveformPreview: Live acoustic spectrogram & frequency waveform visualizer for TopologyNodeDrawer (TKT-061 #246)
import React, { useMemo } from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

interface AcousticWaveformPreviewProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident: IncidentState | null;
}

export default function AcousticWaveformPreview({
  node: _node,
  state: _state,
  incident,
}: AcousticWaveformPreviewProps): React.ReactElement {
  const isAnomaly = incident && incident.status !== 'normal' && incident.status !== 'closed';

  // 18 FFT frequency bins (from 2 kHz to 20 kHz)
  const freqBars = useMemo(() => {
    // Normal profile: taper off at high frequencies; Anomaly profile: chatter spike around 8.4 kHz (bins 7-9)
    return [32, 45, 58, 62, 70, 75, isAnomaly ? 96 : 64, isAnomaly ? 100 : 55, isAnomaly ? 88 : 42, 48, 38, 30, 25, 20, 18, 15, 12, 10];
  }, [isAnomaly]);

  return (
    <div
      className="glass"
      style={{
        padding: '1rem',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%)',
        border: '1px solid rgba(99,102,241,0.22)',
      }}
      aria-label="Embedded Acoustic Spectrogram"
    >
      <div className="row between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
            graphic_eq
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            High-Frequency Acoustic Microphones (MEMS)
          </span>
        </div>
        <span
          className={`chip chip-sm ${isAnomaly ? 'chip-amber' : 'chip-blue'}`}
          style={{ fontSize: '0.7rem' }}
        >
          <span className={`status-dot ${isAnomaly ? 'amber' : 'blue'}`} />
          {isAnomaly ? 'Chatter Signature' : 'Baseline Acoustic'}
        </span>
      </div>

      {/* FFT Spectrogram Bar Visualizer */}
      <div
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          padding: '4px 6px',
          background: 'rgba(15,23,42,0.04)',
          borderRadius: 8,
          marginBottom: 10,
        }}
        aria-label="FFT Spectrogram Bars"
      >
        {freqBars.map((heightPct, idx) => {
          const isChatterBin = idx >= 6 && idx <= 8;
          const barColor = isAnomaly && isChatterBin ? '#dc2626' : '#6366f1';
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                height: `${heightPct}%`,
                background: barColor,
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.3s ease',
              }}
              title={`${(2 + idx).toFixed(1)} kHz: ${heightPct}%`}
            />
          );
        })}
      </div>

      {/* Acoustic Parameters */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Peak Frequency</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: isAnomaly ? '#dc2626' : 'var(--ink)' }}>
            8.42 kHz
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Chatter Ratio</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: isAnomaly ? '#dc2626' : 'var(--green)' }}>
            {isAnomaly ? '0.34' : '0.08'}
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>SNR</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
            68.4 dB
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Sample Rate</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
            44.1 kHz
          </div>
        </div>
      </div>
    </div>
  );
}
