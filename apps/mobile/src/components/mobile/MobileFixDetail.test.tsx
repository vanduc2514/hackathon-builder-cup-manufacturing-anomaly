import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MobileFixDetail from './MobileFixDetail';
import { useOemManual } from '../../hooks/useOemManual';
import type { RepairStep, WorkOrder } from '../../types/mobile';

vi.mock('../../hooks/useOemManual', () => ({
  useOemManual: vi.fn(),
}));

const mockUseOemManual = vi.mocked(useOemManual);

const sampleStep: RepairStep = {
  id: 1,
  title: 'Replace spindle insert',
  instruction: 'Tighten fastener to 3.5 Nm',
  instructionVi: 'Siết bu lông đến 3.5 Nm',
  target: '3.5 Nm',
  tolerance: '±0.2 Nm',
  reference: 'SOP-SPINDLE-02',
};

const dynamicStep: RepairStep = {
  id: 101,
  title: 'OEM Calibrate spindle head',
  instruction: 'Check runout with dial gauge',
  instructionVi: 'Kiểm tra độ đảo bằng đồng hồ so',
  target: '≤ 0.02 mm',
  tolerance: 'Xác nhận bằng mắt',
  reference: 'OEM-MANUAL-SEC-4',
};

function createMockWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'WO-101',
    kind: 'fix',
    stage: 'active',
    priority: 'P1',
    title: 'Spindle vibration anomaly',
    machine: 'CNC-02',
    location: 'Line 02 · Bay C',
    summary: 'Spindle vibration exceeds control limit.',
    image: '/mobile/lathe.jpg',
    aiConfidence: 95,
    createdAt: '2026-10-16T05:00:00Z',
    sensors: [
      { label: 'Vibration', value: '4.2', unit: 'mm/s', trend: 'up', alert: true },
    ],
    evidence: [],
    steps: [],
    partsNeeded: [],
    ...overrides,
  };
}

describe('MobileFixDetail', () => {
  const onBack = vi.fn();
  const onStart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOemManual.mockReturnValue({
      manual: null,
      steps: [],
      parts: [],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('enables Start guided repair and invokes onStart when order.steps has >= 1 step', () => {
    const order = createMockWorkOrder({ steps: [sampleStep] });

    render(<MobileFixDetail order={order} onBack={onBack} onStart={onStart} />);

    const button = document.getElementById('m-start-repair') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);

    expect(screen.getByText('Replace spindle insert')).toBeDefined();

    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders dynamic steps and enables Start guided repair when order.steps=[] and OEM hook returns >= 1 step', () => {
    mockUseOemManual.mockReturnValue({
      manual: null,
      steps: [dynamicStep],
      parts: ['Part-ABC'],
      loading: false,
      error: null,
    });

    const order = createMockWorkOrder({ steps: [] });

    render(<MobileFixDetail order={order} onBack={onBack} onStart={onStart} />);

    expect(screen.getByText('OEM Calibrate spindle head')).toBeDefined();
    expect(screen.getByText(/OEM-MANUAL-SEC-4/)).toBeDefined();

    const button = document.getElementById('m-start-repair') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows no procedure message and disables button when order.steps=[] and OEM hook returns []', () => {
    mockUseOemManual.mockReturnValue({
      manual: null,
      steps: [],
      parts: [],
      loading: false,
      error: null,
    });

    const order = createMockWorkOrder({ steps: [] });

    render(<MobileFixDetail order={order} onBack={onBack} onStart={onStart} />);

    expect(screen.getByText(`No OEM repair procedure for ${order.machine}.`)).toBeDefined();

    const button = document.getElementById('m-start-repair') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });
});
