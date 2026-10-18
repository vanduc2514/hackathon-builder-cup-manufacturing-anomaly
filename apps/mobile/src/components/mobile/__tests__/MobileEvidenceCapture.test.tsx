import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import MobileEvidenceCapture from '../MobileEvidenceCapture';
import { authFetch } from '../../../api/auth';
import { readFileAsDataUrl } from '../../../hooks/useCamera';
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
  const imageFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ presets: mockPresets }),
    }) as unknown as Response);
    imageFetch.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['jpg']) });
    vi.stubGlobal('fetch', imageFetch);
    vi.mocked(readFileAsDataUrl).mockResolvedValue('data:image/jpeg;base64,AAA');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function pickCrackPreset(order: WorkOrder): Promise<void> {
    render(<MobileEvidenceCapture order={order} item={mockItem} onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose sample image' }));
    await waitFor(() => expect(screen.getByTestId('preset-select-btn-preset-im05-crack')).toBeDefined());
    fireEvent.click(screen.getByTestId('preset-select-btn-preset-im05-crack'));
  }

  it.each([
    ['live awaiting evidence', buildMockOrder({ canSubmitEvidence: true, status: 'awaiting_evidence' })],
    ['demo', buildMockOrder(null)],
  ])('%s order: a picked sample goes to review and is saved only on Use photo', async (_label, order) => {
    await pickCrackPreset(order);

    const review = (await screen.findByAltText(`Captured ${mockItem.label}`)) as HTMLImageElement;
    expect(imageFetch).toHaveBeenCalledWith('/presets/evidence/preset_im05_crack.jpg');
    expect(review.getAttribute('src')).toBe('data:image/jpeg;base64,AAA');
    expect(screen.queryByTestId('preset-gallery-sheet')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(mockAuthFetch).not.toHaveBeenCalledWith('/api/incidents/evidence/preset', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: /Use photo/ }));
    expect(onSave).toHaveBeenCalledWith('shot-1', 'data:image/jpeg;base64,AAA');
  });

  it('stays on the camera with an error when the sample image cannot be loaded', async () => {
    imageFetch.mockResolvedValue({ ok: false, status: 404 });
    await pickCrackPreset(buildMockOrder(null));

    await waitFor(() => expect(screen.getByText(/Could not load the sample image \(HTTP 404\)/)).toBeDefined());
    expect(screen.queryByRole('button', { name: /Use photo/ })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
