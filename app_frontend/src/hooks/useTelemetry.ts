/**
 * Loads sensor thresholds (`/api/telemetry/baseline`) once and the recent history
 * (`/api/telemetry/history`) for the suspect machine, used for real sensor tiles.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchTelemetryBaseline, fetchTelemetryHistory } from '../api/kaizenApi';
import type { TelemetryBaselineResponse, TelemetryPoint } from '../types';

export interface TelemetryContext {
  baseline: TelemetryBaselineResponse | null;
  history: TelemetryPoint[];
}

export function useTelemetry(machineId: string | null | undefined): TelemetryContext {
  const [baseline, setBaseline] = useState<TelemetryBaselineResponse | null>(null);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);

  // Retried when the suspect machine changes, in case the backend was down on first load.
  useEffect(() => {
    if (baseline) return undefined;
    let cancelled = false;
    fetchTelemetryBaseline()
      .then((b) => {
        if (!cancelled) setBaseline(b);
      })
      .catch((err: unknown) => console.warn('Telemetry baseline unavailable:', err));
    return () => {
      cancelled = true;
    };
  }, [baseline, machineId]);

  useEffect(() => {
    if (!machineId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    fetchTelemetryHistory(machineId)
      .then((res) => {
        if (cancelled) return;
        const points = res.series[machineId] ?? [];
        setHistory([...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
      })
      .catch((err: unknown) => {
        console.warn('Telemetry history unavailable:', err);
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  return useMemo(() => ({ baseline, history }), [baseline, history]);
}
