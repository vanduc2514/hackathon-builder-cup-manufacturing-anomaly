import { useState, useEffect, useCallback } from 'react';
import type { FactoryTickPacket, MachineTelemetry } from './types';

const BASE_MACHINES: MachineTelemetry[] = [
  { machine_id: 'CNC-01', tool_id: 'T01', spindle_vibration: 1.18, motor_current: 13.8, spindle_temp: 41.5, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'CNC-02', tool_id: 'T07', spindle_vibration: 1.25, motor_current: 14.2, spindle_temp: 42.0, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'CNC-03', tool_id: 'T03', spindle_vibration: 1.15, motor_current: 13.5, spindle_temp: 40.8, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'IM-05', tool_id: 'MOLD-03', spindle_vibration: 0.08, motor_current: 28.5, spindle_temp: 78.0, rpm: 0, operating_status: 'NORMAL', dryer_dew_point: -40.0 },
];

export function useFactoryStream() {
  const [packet, setPacket] = useState<FactoryTickPacket>({
    tick_index: 0,
    machines: BASE_MACHINES,
    recent_parts: [],
    edge_stats: { total_frames_evaluated: 0, pass_frames_dropped: 0, defect_frames_forwarded: 0, estimated_bandwidth_saved_mb: 0, cloud_bandwidth_reduction_pct: 95.0 },
    active_anomaly: null,
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number;
    const connect = () => {
      es = new EventSource('/api/factory/stream');
      es.onopen = () => setConnected(true);
      const handlePacket = (e: MessageEvent) => {
        try { setPacket(JSON.parse(e.data)); } catch { /* ignore non-json */ }
      };
      es.onmessage = handlePacket;
      es.addEventListener('factory_tick', handlePacket);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        timer = window.setTimeout(connect, 2000);
      };
    };
    connect();
    return () => { es?.close(); clearTimeout(timer); };
  }, []);

  const injectAnomaly = useCallback(async (scenario: string, machine_id?: string, severity = 1.0, mode = 'demo') => {
    try {
      const res = await fetch('/api/factory/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, machine_id, severity, mode }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const resetFactory = useCallback(async () => {
    try {
      const res = await fetch('/api/factory/reset', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { packet, connected, injectAnomaly, resetFactory };
}
