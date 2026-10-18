// EsgCard tests: the ESG impact card must label its figures as benchmark-based estimates.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EsgCard from '../overview/EsgCard';
import { authFetch } from '../../lib/auth';
import type { EsgLedgerEntry } from '../../lib/fleet';

vi.mock('../../lib/auth', () => ({
  authFetch: vi.fn(() => Promise.resolve({ ok: false })),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const entry: EsgLedgerEntry = {
  incidentId: 'INC-01',
  impact: {
    scrap_avoided: 240,
    downtime_minutes: 45,
    energy_kwh: 38,
    co2_kg: 25,
    energy_co2_kg: 15.2,
    material_co2_kg: 9.8,
    cost_savings_usd: 3600,
  },
};

describe('EsgCard benchmark basis label', () => {
  it('renders the visible benchmark-based estimate label', () => {
    render(<EsgCard ledger={[entry]} factoryType="aluminum_cnc" onOpenHub={() => undefined} />);
    expect(screen.getByText('Benchmark-based estimate')).toBeDefined();
  });

  it('carries the benchmark-inputs tooltip on the label', () => {
    render(<EsgCard ledger={[entry]} factoryType="aluminum_cnc" onOpenHub={() => undefined} />);
    const label = screen.getByText('Benchmark-based estimate');
    expect(label.getAttribute('title')).toContain('manufacturing benchmarks');
    expect(label.getAttribute('title')).toContain('not measured production data');
  });

  it('shows the label even before any incident is booked', () => {
    render(<EsgCard ledger={[]} factoryType="aluminum_cnc" onOpenHub={() => undefined} />);
    expect(screen.getByText('Benchmark-based estimate')).toBeDefined();
  });

  it('does not call authFetch for the ledger basis label', () => {
    render(<EsgCard ledger={[entry]} factoryType="aluminum_cnc" onOpenHub={() => undefined} />);
    expect(authFetch).toHaveBeenCalledWith(
      '/api/impact/calculate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
