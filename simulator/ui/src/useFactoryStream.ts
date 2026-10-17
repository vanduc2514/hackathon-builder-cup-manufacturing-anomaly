import { useState, useEffect, useCallback } from 'react';
import type { FactoryTickPacket, InjectionResponse, MachineTelemetry, PubSubDeliveryReport } from './types';
import { authFetch } from './lib/auth';

const BASE_MACHINES: MachineTelemetry[] = [
  { machine_id: 'CNC-01', tool_id: 'T01', spindle_vibration: 1.18, motor_current: 13.8, spindle_temp: 41.5, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'CNC-02', tool_id: 'T07', spindle_vibration: 1.25, motor_current: 14.2, spindle_temp: 42.0, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'CNC-03', tool_id: 'T03', spindle_vibration: 1.15, motor_current: 13.5, spindle_temp: 40.8, rpm: 8000, operating_status: 'NORMAL' },
  { machine_id: 'IM-05', tool_id: 'MOLD-03', spindle_vibration: 0.08, motor_current: 28.5, spindle_temp: 78.0, rpm: 0, operating_status: 'NORMAL', dryer_dew_point: -40.0 },
];

const STORAGE_KEY = 'factory_operator_key';

export function useFactoryStream() {
  const [packet, setPacket] = useState<FactoryTickPacket>({
    tick_index: 0,
    machines: BASE_MACHINES,
    recent_parts: [],
    edge_stats: { total_frames_evaluated: 0, pass_frames_dropped: 0, defect_frames_forwarded: 0, estimated_bandwidth_saved_mb: 0, cloud_bandwidth_reduction_pct: 95.0 },
    active_anomaly: null,
  });
  const [deliveryReports, setDeliveryReports] = useState<PubSubDeliveryReport[]>([]);
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKeyState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const streamOrigin = (import.meta.env.VITE_STREAM_ORIGIN ?? '').replace(/\/$/, '');

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    setAuthError(null);
    try {
      if (key) {
        sessionStorage.setItem(STORAGE_KEY, key);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // sessionStorage unavailable or restricted
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number;
    const connect = () => {
      const streamUrl = `${streamOrigin}/api/factory/stream`;
      es = new EventSource(streamUrl);
      es.onopen = () => setConnected(true);
      const handlePacket = (e: MessageEvent) => {
        try {
          const data: FactoryTickPacket = JSON.parse(e.data);
          setPacket(data);
          if (data.pubsub_delivery && data.pubsub_delivery.length > 0) {
            setDeliveryReports(data.pubsub_delivery);
          }
        } catch {
          /* ignore non-json */
        }
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
  }, [streamOrigin]);

  const injectAnomaly = useCallback(async (scenario: string, machine_id?: string, severity = 1.0, mode = 'demo') => {
    try {
      setAuthError(null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }
      const res = await authFetch(`${streamOrigin}/api/factory/inject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ scenario, machine_id, severity, mode }),
      });
      if (res.status === 401) {
        setAuthError('Unauthorized: Missing or invalid Operator Key or Session (401)');
        return false;
      }
      if (res.status === 503) {
        setAuthError('Service Unavailable: Factory API Key unconfigured in production (503)');
        return false;
      }
      if (res.ok) {
        try {
          const resJson: InjectionResponse = await res.json();
          if (resJson.delivery_reports && resJson.delivery_reports.length > 0) {
            setDeliveryReports(resJson.delivery_reports);
          }
        } catch {
          // ignore non-json
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [apiKey, streamOrigin]);

  const resetFactory = useCallback(async () => {
    try {
      setAuthError(null);
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }
      const res = await authFetch(`${streamOrigin}/api/factory/reset`, { method: 'POST', headers });
      if (res.status === 401) {
        setAuthError('Unauthorized: Missing or invalid Operator Key or Session (401)');
        return false;
      }
      if (res.status === 503) {
        setAuthError('Service Unavailable: Factory API Key unconfigured in production (503)');
        return false;
      }
      if (res.ok) {
        setDeliveryReports([]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [apiKey, streamOrigin]);

  return { packet, connected, injectAnomaly, resetFactory, apiKey, setApiKey, authError, deliveryReports };
}

