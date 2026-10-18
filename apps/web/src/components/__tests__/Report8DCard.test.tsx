// Report8DCard tests: approval shows the recorded approver identity, and pending_approval enables sign-off.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Report8DCard from '../Report8DCard';
import type { IncidentState } from '../../types';

vi.mock('../../lib/auth', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: true })),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseIncident = {
  incident_id: 'INC-0412',
  defect_type: 'scratch_vertical',
  defect_rate: 0.077,
  spc_ucl: 0.03,
  suspect_machine: 'CNC-02',
  suspect_tool: 'T07',
  root_cause: 'Insert flank wear on T07',
  verification_count: 50,
  verification_target: 50,
  repair_done: true,
  approved: true,
  approved_by: 'kaizen-lead',
  approved_at: '2026-10-18T09:30:00+00:00',
  findings: [],
  documents: {},
  impact: null,
  updated_at: '09:31:02',
} as unknown as IncidentState;

describe('Report8DCard approval identity', () => {
  it('shows the recorded approver username after sign-off', () => {
    render(<Report8DCard incident={baseIncident} isLive onNotify={() => undefined} />);
    expect(screen.getByText('kaizen-lead')).toBeDefined();
    expect(screen.queryByText('Devon Vance')).toBeNull();
    expect(screen.getByText('LINE RELEASED & SIGNED')).toBeDefined();
  });

  it('falls back to a generic label when the approver is unknown', () => {
    const incident = { ...baseIncident, approved_by: null } as IncidentState;
    render(<Report8DCard incident={incident} isLive onNotify={() => undefined} />);
    expect(screen.getByText('Shift Leader')).toBeDefined();
  });

  it('treats pending_approval as awaiting sign-off and enables the approve button', () => {
    const incident = {
      ...baseIncident,
      status: 'pending_approval',
      approved: false,
      approved_by: null,
      approved_at: null,
    } as IncidentState;
    render(<Report8DCard incident={incident} isLive onNotify={() => undefined} />);
    expect(screen.getByText('Awaiting sign-off')).toBeDefined();
    const button = document.getElementById('approve-incident') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);
  });
});
