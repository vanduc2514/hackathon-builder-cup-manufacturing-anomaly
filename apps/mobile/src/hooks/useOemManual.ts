import { useEffect, useState } from 'react';
import { fetchOemManual } from '../api/kaizenApi';
import type { OemRepairManual, RepairCheckpoint } from '../types';
import type { RepairStep } from '../types/mobile';

const COMPARATOR_SYMBOL: Record<string, string> = { '<=': '≤', '>=': '≥', '<': '<', '>': '>' };

/** Maps a backend RepairCheckpoint onto the app's RepairStep card. */
export function checkpointToStep(cp: RepairCheckpoint): RepairStep {
  const hasMetric = cp.target_threshold !== null && cp.target_threshold !== undefined;
  const symbol = COMPARATOR_SYMBOL[cp.comparator ?? '<='] ?? cp.comparator ?? '';
  return {
    id: cp.step_number,
    title: cp.title,
    instruction: cp.instruction,
    target: hasMetric ? `${symbol} ${cp.target_threshold} ${cp.unit ?? ''}`.trim() : 'Complete',
    tolerance: cp.metric_name ?? 'Visual check',
    reference: cp.citation,
  };
}

export interface UseOemManualResult {
  manual: OemRepairManual | null;
  steps: RepairStep[];
  parts: string[];
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to retrieve OEM repair manual and structured checkpoints from the backend API.
 */
export function useOemManual(machineId?: string | null): UseOemManualResult {
  const [manual, setManual] = useState<OemRepairManual | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(machineId));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!machineId) {
      setManual(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchOemManual(machineId)
      .then((data) => {
        if (!active) return;
        setManual(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setManual(null);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [machineId]);

  const steps = manual ? manual.checkpoints.map(checkpointToStep) : [];
  const parts = manual ? manual.parts : [];

  return { manual, steps, parts, loading, error };
}
