/**
 * Loads the sample evidence image catalog once; samples of `machine` come first so the
 * gallery button preview and the picker show the relevant photos on top.
 */
import { useEffect, useState } from 'react';
import { authFetch } from '../api/auth';
import type { VisualEvidencePreset, VisualEvidencePresetListResponse } from '../types';

export interface EvidencePresets {
  presets: VisualEvidencePreset[];
  loading: boolean;
  error: string | null;
}

export function useEvidencePresets(machine: string): EvidencePresets {
  const [presets, setPresets] = useState<VisualEvidencePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authFetch('/api/presets/evidence')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load the sample list (HTTP ${res.status})`);
        const data = (await res.json()) as VisualEvidencePresetListResponse;
        const list = data.presets || [];
        // Stable sort: this machine's samples first, catalog order otherwise.
        if (active) setPresets([...list].sort((a, b) => Number(b.machine_id === machine) - Number(a.machine_id === machine)));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Connection error while loading the sample list');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [machine]);

  return { presets, loading, error };
}
