// TelemetryPreview: Embedded live telemetry sparkline and sensor gauge for TopologyNodeDrawer (TKT-061 #246)
import React, { useMemo } from 'react';
import type { IncidentState, TopologyNodeDefinition, TopologyNodeState } from '../../../types';

interface TelemetryPreviewProps {
  node: TopologyNodeDefinition;
  state: TopologyNodeState;
  incident: IncidentState | null;
}

export default function TelemetryPreview({
  node: _node,
  state: _state,
  incident,
}: TelemetryPreviewProps): React.ReactElement {
  const machineId = incident?.suspect_machine ?? 'CNC-02';
  const toolId = incident?.suspect_tool ?? 'T07-CARBIDE';
  const anomalyScore = incident?.defect_rate ?? 0.12;
  const spcUcl = incident?.spc_ucl ?? 0.03;
  const rpm = 3200;
  const isElevated = anomalyScore >= spcUcl;

  // Generate 24 sparkline points representing live high-frequency vibration telemetry
  const sparkPoints = useMemo(() => {
    const base = isElevated ? 2.3 : 1.25;
    const points: number[] = [];
    for (let i = 0; i < 24; i++) {
      const noise = ((i * 17 + 7) % 11) / 25 - 0.2;
      const spike = isElevated && i > 16 ? 0.9 : 0;
      points.push(Math.max(0.4, Number((base + noise + spike).toFixed(2))));
    }
    return points;
  }, [isElevated]);

  const minVal = 0;
  const maxVal = 3.5;
  const svgWidth = 320;
  const svgHeight = 64;

  const pathD = useMemo(() => {
    const coords = sparkPoints.map((val, idx) => {
      const x = (idx / (sparkPoints.length - 1)) * svgWidth;
      const y = svgHeight - ((val - minVal) / (maxVal - minVal)) * (svgHeight - 12) - 6;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return coords.join(' ');
  }, [sparkPoints]);

  return (
    <div
      className="glass"
      style={{
        padding: '1rem',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%)',
        border: '1px solid rgba(99,102,241,0.22)',
      }}
      aria-label="Embedded Live Sensor Telemetry"
    >
      <div className="row between" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>
            sensors
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            {machineId} Spindle Telemetry Stream
          </span>
        </div>
        <span
          className={`chip chip-sm ${isElevated ? 'chip-red' : 'chip-green'}`}
          style={{ fontSize: '0.7rem' }}
        >
          <span className={`status-dot ${isElevated ? 'red' : 'green'}`} />
          {isElevated ? 'Spike Detected' : 'Nominal Vibration'}
        </span>
      </div>

      {/* Sensor KPI Strip */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Spindle RPM</div>
          <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
            {rpm.toLocaleString()}
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Vibration RMS</div>
          <div
            className="mono"
            style={{
              fontSize: '0.88rem',
              fontWeight: 700,
              color: isElevated ? '#dc2626' : '#16a34a',
            }}
          >
            {sparkPoints[sparkPoints.length - 1]} mm/s
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Tool Insert</div>
          <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)' }}>
            {toolId}
          </div>
        </div>
        <div style={{ background: 'rgba(15,23,42,0.03)', padding: '6px 8px', borderRadius: 8 }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>Defect Rate</div>
          <div
            className="mono"
            style={{
              fontSize: '0.88rem',
              fontWeight: 700,
              color: isElevated ? '#dc2626' : '#16a34a',
            }}
          >
            {(anomalyScore * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* SVG Realtime Sparkline */}
      <div style={{ position: 'relative', width: '100%', height: svgHeight, overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        >
          {/* Threshold alert line (2.5 mm/s) */}
          <line
            x1="0"
            y1={svgHeight - ((2.5 - minVal) / (maxVal - minVal)) * (svgHeight - 12) - 6}
            x2={svgWidth}
            y2={svgHeight - ((2.5 - minVal) / (maxVal - minVal)) * (svgHeight - 12) - 6}
            stroke="#ef4444"
            strokeDasharray="4 3"
            strokeWidth="1"
            opacity="0.6"
          />
          {/* Sparkline curve */}
          <path
            d={pathD}
            fill="none"
            stroke={isElevated ? '#dc2626' : '#4f46e5'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="row between" style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--muted)' }}>
        <span>Sampling: 100 Hz OPC-UA stream</span>
        <span>Alarm limit: 2.5 mm/s RMS</span>
      </div>
    </div>
  );
}
