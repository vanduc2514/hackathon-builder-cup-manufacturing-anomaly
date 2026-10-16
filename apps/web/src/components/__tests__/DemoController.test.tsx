import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DemoController from '../DemoController';
import { authFetch } from '../../lib/auth';
import type { IncidentState, SimulationStatusResponse } from '../../types';

vi.mock('../../lib/auth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('../../hooks/useFactoryStream', () => ({
  useFactoryStream: vi.fn(() => ({
    packet: {
      tick_index: 142,
      machines: [],
      recent_parts: [],
      edge_stats: {
        total_frames_evaluated: 1000,
        pass_frames_dropped: 950,
        defect_frames_forwarded: 50,
        estimated_bandwidth_saved_mb: 45.2,
        cloud_bandwidth_reduction_pct: 95.0,
      },
      active_anomaly: null,
    },
    connected: true,
    isStale: false,
    hasReceivedData: true,
    error: null,
    lastTickAt: 1700000000000,
    reconnect: vi.fn(),
  })),
}));

vi.mock('../../lib/api', () => ({
  useApi: vi.fn((path: string | null) => {
    if (path === '/health') {
      return {
        data: {
          status: 'ok',
          app: 'kaizen-agent-backend',
          version: '0.1.0',
          gcp_project: 'kaizen-anomaly-prod',
        },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    if (path === '/api/gemini-live/status') {
      return {
        data: {
          status: 'ready',
          simulation_mode: true,
          active_sessions: 0,
          default_model: 'gemini-2.0-flash',
          default_voice: 'Puck',
          default_language: 'vi-VN',
        },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    if (path === '/api/telemetry/baseline') {
      return {
        data: {
          line_id: 'Line-01',
          description: 'Aluminum CNC cell baseline nominal parameters',
        },
        error: null,
        loading: false,
        reload: vi.fn(),
      };
    }
    return { data: null, error: null, loading: false, reload: vi.fn() };
  }),
}));

const mockAuthFetch = vi.mocked(authFetch);

const mockIncidentActive: IncidentState = {
  incident_id: 'inc-999',
  status: 'repairing',
  status_reason: 'Spindle chatter vibration spike detected',
  defect_type: 'scratch_vertical',
  defect_rate: 0.048,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Worn insert flank',
  verification_count: 0,
  verification_target: 30,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  opened_at: new Date(Date.now() - 35000).toISOString(),
  updated_at: new Date().toISOString(),
};

const mockSimStatus: SimulationStatusResponse = {
  status: 'running',
  active_scenario: 'cnc_tool_wear',
  mode: 'demo',
  target_machine: 'CNC-02',
  target_tool: 'T07',
  elapsed_seconds: 35,
  total_seconds: 90,
};

describe('DemoController (Passive Incident & Factory Stream Monitor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render any direct anomaly injection button or calls to /api/simulation/inject', () => {
    render(
      <DemoController
        open={true}
        onClose={vi.fn()}
        incident={mockIncidentActive}
        simStatus={mockSimStatus}
        onStatusChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    // Verify #sim-inject does NOT exist
    const injectBtn = document.getElementById('sim-inject');
    expect(injectBtn).toBeNull();

    // Verify no button triggers /api/simulation/inject
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.textContent).not.toMatch(/inject defect/i);
      expect(btn.textContent).not.toMatch(/trigger scenario/i);
    });
  });

  it('renders active incident progress, target machine, defect type, and timing', () => {
    render(
      <DemoController
        open={true}
        onClose={vi.fn()}
        incident={mockIncidentActive}
        simStatus={mockSimStatus}
        onStatusChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    // Active status and machine
    expect(screen.getByText(/Active · Repairing · CNC-02/i)).toBeTruthy();
    expect(screen.getByText(/35s \/ 90s/i)).toBeTruthy();
    expect(screen.getByText(/ID: #inc-999/i)).toBeTruthy();
    expect(screen.getByText(/Station: CNC-02/i)).toBeTruthy();
    expect(screen.getByText(/Defect: Vertical Scratch/i)).toBeTruthy();
  });

  it('renders a prominent deep link to the Factory Floor UI (Window 1)', () => {
    render(
      <DemoController
        open={true}
        onClose={vi.fn()}
        incident={mockIncidentActive}
        simStatus={mockSimStatus}
        onStatusChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    const floorLink = document.getElementById('open-factory-floor-btn') as HTMLAnchorElement;
    expect(floorLink).not.toBeNull();
    expect(floorLink.tagName.toLowerCase()).toBe('a');
    expect(floorLink.href).toMatch(/:3002/);
    expect(floorLink.target).toBe('_blank');
    expect(screen.getByText(/Window 1: Factory Floor Client/i)).toBeTruthy();
    expect(screen.getByText(/decoupled architecture/i)).toBeTruthy();
  });

  it('renders factory stream SSE connection status and edge statistics', () => {
    render(
      <DemoController
        open={true}
        onClose={vi.fn()}
        incident={mockIncidentActive}
        simStatus={mockSimStatus}
        onStatusChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getByText(/Live Stream Active/i)).toBeTruthy();
    expect(screen.getByText(/#142/i)).toBeTruthy();
    expect(screen.getByText(/Gemma 3 Reduction: 95.0%/i)).toBeTruthy();
  });

  it('executes blackboard reset and notifies on success', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        message: 'Blackboard state cleared and reset to nominal baseline',
        state: { status: 'normal', incident_id: 'inc-0' },
        bigquery: { status: 'ok', message: 'Seeded nominal data' },
      }),
    } as Response);

    const onNotify = vi.fn();
    const onStatusChange = vi.fn();

    render(
      <DemoController
        open={true}
        onClose={vi.fn()}
        incident={mockIncidentActive}
        simStatus={mockSimStatus}
        onStatusChange={onStatusChange}
        onNotify={onNotify}
      />,
    );

    const resetBtn = document.getElementById('sim-reset') as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    expect(resetBtn.textContent).toContain('Reset Blackboard');

    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/simulation/reset', { method: 'POST' });
      expect(onNotify).toHaveBeenCalledWith('Blackboard state cleared and reset to nominal baseline');
      expect(onStatusChange).toHaveBeenCalled();
    });

    // Check last reset card is rendered
    expect(screen.getByText(/Last reset/i)).toBeTruthy();
    expect(screen.getByText(/Blackboard → normal/i)).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DemoController
        open={true}
        onClose={onClose}
        incident={null}
        simStatus={null}
        onStatusChange={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    const closeBtn = screen.getByLabelText(/close monitor panel/i);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
