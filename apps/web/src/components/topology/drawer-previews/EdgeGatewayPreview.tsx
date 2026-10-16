// EdgeGatewayPreview: On-premises edge classifier telemetry & pneumatic diverter indicator for TopologyNodeDrawer (TKT-061 #246)
import React from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

interface EdgeGatewayPreviewProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident: IncidentState | null;
}

export default function EdgeGatewayPreview({
  node: _node,
  state: _state,
  incident,
}: EdgeGatewayPreviewProps): React.ReactElement {
  const isAnomaly = incident && !['normal', 'closed', 'dismissed'].includes(incident.status);
  const filterRatio = 95.8;

  return (
    <div
      className="glass"
      style={{
        padding: '1rem',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%)',
        border: '1px solid rgba(99,102,241,0.22)',
      }}
      aria-label="Embedded Edge Gateway Telemetry"
    >
      <div className="row between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--amber)' }}>
            memory
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            Gemma 3 2B On-Prem Inference &amp; Edge Gateway
          </span>
        </div>
        <span className="chip chip-sm chip-amber" style={{ fontSize: '0.7rem' }}>
          &lt; 50ms Hard Realtime
        </span>
      </div>

      {/* Frame Pre-filter Progress Bar */}
      <div style={{ marginBottom: 12 }}>
        <div className="row between" style={{ fontSize: '0.74rem', marginBottom: 4 }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Edge Frame Reduction Ratio</span>
          <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>
            {filterRatio}% On-Prem Filtered
          </span>
        </div>
        <div
          style={{
            height: 10,
            background: 'rgba(15,23,42,0.08)',
            borderRadius: 9999,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              width: `${filterRatio}%`,
              background: 'linear-gradient(90deg, #10b981, #059669)',
              borderRadius: '9999px 0 0 9999px',
            }}
            title="95.8% Clean frames dropped locally"
          />
          <div
            style={{
              width: `${100 - filterRatio}%`,
              background: '#ef4444',
            }}
            title="4.2% Anomaly candidates forwarded to Cloud Pub/Sub"
          />
        </div>
        <div className="row between" style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 4 }}>
          <span>17,748 Clean frames suppressed</span>
          <span>702 Candidate anomalies routed</span>
        </div>
      </div>

      {/* Gateway Hardware & Diverter Status */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Inference Latency</div>
          <div className="mono" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#16a34a' }}>
            41.2 ms
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Edge Model</div>
          <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            Gemma 3 2B (INT4)
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Protocol Bridge</div>
          <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            MQTT / IPC
          </div>
        </div>
      </div>

      {/* Diverter Pneumatic Gate Interlock Pill */}
      <div
        className="row between"
        style={{
          padding: '6px 10px',
          borderRadius: 8,
          background: isAnomaly ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: `1px solid ${isAnomaly ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
          alignItems: 'center',
        }}
      >
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, color: isAnomaly ? '#dc2626' : '#16a34a' }}
          >
            {isAnomaly ? 'call_split' : 'check_circle'}
          </span>
          <span style={{ fontSize: '0.74rem', fontWeight: 650, color: 'var(--ink)' }}>
            Pneumatic Diverter Gate (24V IO)
          </span>
        </div>
        <span
          className={`chip chip-sm ${isAnomaly ? 'chip-red' : 'chip-green'}`}
          style={{ fontSize: '0.66rem', padding: '1px 6px' }}
        >
          {isAnomaly ? 'TRIGGERED (DEFECT DIVERT)' : 'ARMED / PASSING'}
        </span>
      </div>
    </div>
  );
}
