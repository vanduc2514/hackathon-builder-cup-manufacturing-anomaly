import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import IncidentListView from '../IncidentListView';
import { authFetch } from '../../../lib/auth';
import type { IncidentState, IncidentSummary } from '../../../types';

vi.mock('../../../lib/auth', () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = vi.mocked(authFetch);

const summary = (overrides: Partial<IncidentSummary>): IncidentSummary => ({
  incident_id: 'INC-X',
  status: 'closed',
  severity: 'medium',
  defect_rate: 0.07,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  defect_type: 'scratch_vertical',
  repair_done: true,
  approved: true,
  archived: false,
  verification_count: 50,
  verification_target: 50,
  ...overrides,
});

const HISTORY: IncidentSummary[] = [
  summary({ incident_id: 'INC-1' }),
  summary({ incident_id: 'INC-2', archived: true, archived_by: 'lead' }),
];

const liveIncident = (status: IncidentState['status']): IncidentState => ({
  incident_id: 'INC-1',
  status,
  status_reason: null,
  defect_type: 'scratch_vertical',
  defect_rate: 0.07,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: null,
  verification_count: 0,
  verification_target: 50,
  approved: false,
  findings: [],
  impact: null,
  documents: {},
  updated_at: new Date().toISOString(),
});

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function routeFetch(archiveResponse: Response): void {
  mockAuthFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return archiveResponse;
    if (url.startsWith('/api/incidents/history')) return jsonResponse(200, HISTORY);
    throw new Error(`unexpected request ${url}`);
  });
}

describe('IncidentListView', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows only unarchived incidents by default and archived ones under the Archived filter', async () => {
    routeFetch(jsonResponse(200, {}));
    render(<IncidentListView incident={null} onNavigateHome={vi.fn()} onOpenIncident={vi.fn()} onNotify={vi.fn()} />);

    expect(await screen.findByText('INC-1')).toBeTruthy();
    expect(screen.queryByText('INC-2')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Archived/ }));
    expect(await screen.findByText('INC-2')).toBeTruthy();
    expect(screen.queryByText('INC-1')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  });

  it('archives an incident through the API and confirms with a toast', async () => {
    routeFetch(jsonResponse(200, { ...HISTORY[0], archived: true }));
    const onNotify = vi.fn();
    render(<IncidentListView incident={null} onNavigateHome={vi.fn()} onOpenIncident={vi.fn()} onNotify={onNotify} />);

    await screen.findByText('INC-1');
    fireEvent.click(document.getElementById('archive-btn-INC-1') as HTMLButtonElement);

    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Incident INC-1 archived', 'success'));
    expect(mockAuthFetch).toHaveBeenCalledWith('/api/incidents/INC-1/archive', { method: 'POST' });
  });

  it('disables Archive while the live incident is still being worked', async () => {
    routeFetch(jsonResponse(200, {}));
    render(
      <IncidentListView
        incident={liveIncident('repairing')}
        onNavigateHome={vi.fn()}
        onOpenIncident={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    await screen.findByText('INC-1');
    const button = document.getElementById('archive-btn-INC-1') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('opens the live incident from its View button', async () => {
    routeFetch(jsonResponse(200, {}));
    const onOpenIncident = vi.fn();
    render(
      <IncidentListView
        incident={liveIncident('repairing')}
        onNavigateHome={vi.fn()}
        onOpenIncident={onOpenIncident}
        onNotify={vi.fn()}
      />,
    );

    await screen.findByText('INC-1');
    fireEvent.click(document.getElementById('view-btn-INC-1') as HTMLButtonElement);
    expect(onOpenIncident).toHaveBeenCalledWith('INC-1');
  });

  it('offers no View button for incidents without a live detail view', async () => {
    routeFetch(jsonResponse(200, {}));
    render(<IncidentListView incident={null} onNavigateHome={vi.fn()} onOpenIncident={vi.fn()} onNotify={vi.fn()} />);

    await screen.findByText('INC-1');
    expect(document.getElementById('view-btn-INC-1')).toBeNull();
  });

  it('surfaces the backend conflict detail when archiving is refused', async () => {
    routeFetch(jsonResponse(409, { detail: 'Incident INC-1 is still in progress (verifying)' }));
    const onNotify = vi.fn();
    render(<IncidentListView incident={null} onNavigateHome={vi.fn()} onOpenIncident={vi.fn()} onNotify={onNotify} />);

    await screen.findByText('INC-1');
    fireEvent.click(document.getElementById('archive-btn-INC-1') as HTMLButtonElement);

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith('Incident INC-1 is still in progress (verifying)', 'error'),
    );
  });
});
