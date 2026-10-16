import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import MobileEvidenceCapture from '../MobileEvidenceCapture';
import { authFetch } from '../../../api/auth';
import type { EvidenceItem, WorkOrder } from '../../../types/mobile';
import type { VisualEvidencePreset } from '../../../types';

vi.mock('../../../hooks/useCamera', () => ({
  useCamera: vi.fn(() => ({
    videoRef: { current: null },
    ready: true,
    error: null,
    grab: vi.fn(),
    setTorch: vi.fn(),
  })),
  readFileAsDataUrl: vi.fn(),
}));

vi.mock('../../../api/auth', () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = vi.mocked(authFetch);

const mockPresets: VisualEvidencePreset[] = [
  {
    id: 'preset-im05-crack',
    title: 'IM-05 Structural Crack',
    category: 'crack',
    machine_id: 'IM-05',
    tool_id: 'MOLD-03',
    description: 'Wall crack detected',
    analysis: 'Part structural compromise',
    thumbnail_url: '/presets/evidence/preset_im05_crack.jpg',
    image_url: '/presets/evidence/preset_im05_crack.jpg',
    expected_defect_detected: true,
    expected_wear_mm: null,
    suggested_sop_code: 209,
  },
];

const mockItem: EvidenceItem = {
  id: 'shot-1',
  label: 'Cavity 3 Macro View',
  hint: 'Focus on sidewall crack',
  mediaType: 'photo',
  captured: false,
};

function buildMockOrder(liveOverride?: Partial<NonNullable<WorkOrder['live']>> | null): WorkOrder {
  return {
    id: 'WO-DEMO-01',
    kind: 'evidence',
    stage: 'active',
    priority: 'P1',
    title: 'Demo Work Order',
    machine: 'IM-05',
    location: 'Bay 4',
    summary: 'Inspection order',
    image: '/test.jpg',
    aiConfidence: 92,
    createdAt: '2026-10-16T10:00:00Z',
    sensors: [],
    evidence: [mockItem],
    steps: [],
    partsNeeded: [],
    live: liveOverride === null ? undefined : (liveOverride ? {
      status: 'awaiting_evidence',
      canSubmitEvidence: true,
      repairDone: false,
      approved: false,
      defectRate: 0.12,
      verificationCount: 0,
      verificationTarget: 10,
      spcUcl: 0.05,
      sensorSource: 'stream',
      ...liveOverride,
    } : undefined),
  };
}

describe('MobileEvidenceCapture Preset Handling', () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onPresetAttached = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockImplementation(async (url: string) => {
      if (url === '/api/presets/evidence') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ status: 'success' }) } as unknown as Response;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('demo order (non-live) saves preset locally and DOES NOT call POST API or onPresetAttached', async () => {
    const demoOrder = buildMockOrder(null);

    render(
      <MobileEvidenceCapture
        order={demoOrder}
        item={mockItem}
        onClose={onClose}
        onSave={onSave}
        onPresetAttached={onPresetAttached}
      />
    );

    // Open preset gallery sheet
    const openBtn = screen.getByRole('button', { name: /Chọn ảnh mẫu/i });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByTestId('preset-select-btn-preset-im05-crack')).toBeDefined();
    });

    // Select the preset
    const selectBtn = screen.getByTestId('preset-select-btn-preset-im05-crack');
    fireEvent.click(selectBtn);

    // Verify authFetch was called only for GET catalog, NEVER for POST evidence
    expect(mockAuthFetch).not.toHaveBeenCalledWith(
      '/api/incidents/evidence/preset',
      expect.anything()
    );

    // Verify onSave was called with local thumbnail URL
    expect(onSave).toHaveBeenCalledWith('shot-1', '/presets/evidence/preset_im05_crack.jpg');

    // Verify onPresetAttached was NOT called
    expect(onPresetAttached).not.toHaveBeenCalled();
  });

  it('live order with canSubmitEvidence calls POST API and onPresetAttached, NOT onSave', async () => {
    const liveOrder = buildMockOrder({
      canSubmitEvidence: true,
      status: 'awaiting_evidence',
    });

    mockAuthFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/presets/evidence') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ presets: mockPresets }),
        } as unknown as Response;
      }
      if (url === '/api/incidents/evidence/preset' && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success', incident_status: 'analyzing' }),
        } as unknown as Response;
      }
      return { ok: false, status: 400 } as unknown as Response;
    });

    render(
      <MobileEvidenceCapture
        order={liveOrder}
        item={mockItem}
        onClose={onClose}
        onSave={onSave}
        onPresetAttached={onPresetAttached}
      />
    );

    // Open preset gallery sheet
    const openBtn = screen.getByRole('button', { name: /Chọn ảnh mẫu/i });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByTestId('preset-select-btn-preset-im05-crack')).toBeDefined();
    });

    // Select the preset
    const selectBtn = screen.getByTestId('preset-select-btn-preset-im05-crack');
    fireEvent.click(selectBtn);

    await waitFor(() => {
      // Verify POST API was called
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/incidents/evidence/preset',
        expect.objectContaining({ method: 'POST' })
      );
      // Verify onPresetAttached was called with live order and preset
      expect(onPresetAttached).toHaveBeenCalledWith(liveOrder, mockPresets[0]);
    });

    // Verify onSave was NOT called for live order
    expect(onSave).not.toHaveBeenCalled();
  });
});
