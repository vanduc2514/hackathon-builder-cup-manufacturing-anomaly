import React from 'react';
import type { MachineTelemetry } from '../types';

export default function MachineBay({ machines = [] }: { machines?: MachineTelemetry[] }): React.ReactElement {
  const map = new Map(machines.map((m) => [m.machine_id, m]));
  const bays = ['CNC-01', 'CNC-02', 'CNC-03', 'IM-05'];

  return (
    <div className="section-wrap">
      <div className="section-head">
        <span className="section-title"><span className="material-symbols-outlined accent-icon">precision_manufacturing</span>Physical Machine Bays</span>
        <span className="section-meta">4 Monitored Workcells • 1s Telemetry Loop</span>
      </div>
      <div className="bay-grid">
        {bays.map((id) => {
          const isIm = id === 'IM-05';
          const m = map.get(id) || { machine_id: id, tool_id: isIm ? 'MOLD-03' : 'T01', spindle_vibration: isIm ? 0.08 : 1.2, motor_current: isIm ? 28.5 : 14.0, spindle_temp: isIm ? 78 : 42, rpm: isIm ? 0 : 8000, operating_status: 'NORMAL', dryer_dew_point: isIm ? -40.0 : null };
          const isAlarm = m.operating_status === 'ALARM' || m.spindle_vibration > 2.5;
          const isWarn = m.operating_status === 'WARNING' || (m.dryer_dew_point != null && m.dryer_dew_point > -25);
          const dew = m.dryer_dew_point ?? -40;
          return (
            <div key={id} className={`glass-card bay-card ${isAlarm ? 'alarm' : isWarn ? 'warn' : ''}`}>
              <div className="card-row">
                <div>
                  <div className="bay-name">{id} {id === 'CNC-02' && <span className="chip chip-accent">Target S1</span>}{id === 'IM-05' && <span className="chip chip-accent">Target S2</span>}</div>
                  <div className="bay-sub">Tool: <code className="mono">{m.tool_id}</code> • {isIm ? 'Injection Mold' : '5-Axis CNC'}</div>
                </div>
                <span className={`pill ${isAlarm ? 'pill-alarm' : isWarn ? 'pill-warn' : 'pill-ok'}`}>{isAlarm ? 'ALARM' : isWarn ? 'WARNING' : 'NOMINAL'}</span>
              </div>
              <div className="gauge-group">
                {!isIm ? (
                  <>
                    <div className="gauge-row"><span>Vibration (UCL 2.50)</span><span className={m.spindle_vibration > 2.5 ? 'red' : ''}>{m.spindle_vibration.toFixed(2)} mm/s</span></div>
                    <div className="bar-bg"><div className={`bar-fill ${m.spindle_vibration > 2.5 ? 'fill-red' : 'fill-accent'}`} style={{ width: `${Math.min(100, (m.spindle_vibration / 4) * 100)}%` }} /></div>
                    <div className="gauge-row"><span>Motor Current</span><span>{m.motor_current.toFixed(1)} A</span></div>
                    <div className="bar-bg"><div className="bar-fill fill-accent" style={{ width: `${Math.min(100, (m.motor_current / 25) * 100)}%` }} /></div>
                  </>
                ) : (
                  <>
                    <div className="gauge-row"><span>Dryer Dew Point (Lim -25°C)</span><span className={dew > -25 ? 'red' : ''}>{dew.toFixed(1)} °C</span></div>
                    <div className="bar-bg"><div className={`bar-fill ${dew > -25 ? 'fill-red' : 'fill-accent'}`} style={{ width: `${Math.min(100, Math.max(0, ((dew + 50) / 50) * 100))}%` }} /></div>
                    <div className="gauge-row"><span>Hydraulic Current</span><span>{m.motor_current.toFixed(1)} A</span></div>
                    <div className="bar-bg"><div className="bar-fill fill-accent" style={{ width: `${Math.min(100, (m.motor_current / 35) * 100)}%` }} /></div>
                  </>
                )}
                <div className="metric-cols">
                  <div><span className="faint">Temp:</span> <b>{m.spindle_temp.toFixed(1)}°C</b></div>
                  <div><span className="faint">{isIm ? 'Mold:' : 'Speed:'}</span> <b>{isIm ? '4 Cavities' : `${m.rpm} RPM`}</b></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
