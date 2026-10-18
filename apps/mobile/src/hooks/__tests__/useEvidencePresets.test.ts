import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEvidencePresets } from '../useEvidencePresets';
import { authFetch } from '../../api/auth';
import type { VisualEvidencePreset } from '../../types';

vi.mock('../../api/auth', () => ({ authFetch: vi.fn() }));

function preset(id: string, machine_id: string): VisualEvidencePreset {
  return { id, machine_id, title: id, thumbnail_url: `/${id}.jpg`, image_url: `/${id}.jpg` } as VisualEvidencePreset;
}

describe('useEvidencePresets', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset();
  });

  it('puts the machine samples first and keeps catalog order within each group', async () => {
    const list = [preset('im-a', 'IM-05'), preset('cnc-a', 'CNC-02'), preset('im-b', 'IM-05'), preset('cnc-b', 'CNC-02')];
    vi.mocked(authFetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ presets: list }) } as Response);

    const { result } = renderHook(() => useEvidencePresets('CNC-02'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets.map((p) => p.id)).toEqual(['cnc-a', 'cnc-b', 'im-a', 'im-b']);
    expect(result.current.error).toBeNull();
  });

  it('reports the HTTP status when the catalog cannot be loaded', async () => {
    vi.mocked(authFetch).mockResolvedValue({ ok: false, status: 503 } as Response);

    const { result } = renderHook(() => useEvidencePresets('CNC-02'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Could not load the sample list (HTTP 503)');
    expect(result.current.presets).toEqual([]);
  });
});
