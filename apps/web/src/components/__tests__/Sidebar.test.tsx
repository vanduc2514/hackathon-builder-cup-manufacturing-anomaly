// Sidebar regression tests for Architecture navigation realignment (TKT-056 #241 & TKT-062 #247)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Sidebar Navigation Hierarchy (TKT-056 #241)', () => {
  const defaultProps = {
    currentTab: 'overview' as const,
    onSelectTab: vi.fn(),
    incidentTabs: [],
    activeIncidentId: null,
    openIncidentCount: 2,
    link: { ok: true, latencyMs: 25 },
    onOpenIncidents: vi.fn(),
    onSelectIncident: vi.fn(),
    onCloseIncident: vi.fn(),
  };

  it('renders System Topology under Architecture section preceding Operational Loop', () => {
    const { container } = render(<Sidebar {...defaultProps} />);

    // Check eyebrow sections
    const eyebrows = screen.getAllByText(/(Architecture|Operational Loop|Knowledge Loop)/i);
    expect(eyebrows.length).toBeGreaterThanOrEqual(3);
    expect(eyebrows[0].textContent).toBe('Architecture');
    expect(eyebrows[1].textContent).toBe('Operational Loop');
    expect(eyebrows[2].textContent).toBe('Knowledge Loop');

    // System Topology button
    const topologyBtn = screen.getByRole('button', { name: /system topology/i });
    expect(topologyBtn).toBeDefined();
    expect(topologyBtn.id).toBe('nav-topology');

    // Verify nav-topology comes before Operational Loop in DOM
    const navTopology = container.querySelector('#nav-topology');
    const operationalEyebrow = screen.getByText('Operational Loop');
    expect(navTopology!.compareDocumentPosition(operationalEyebrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Line Overview and Incidents belong to Operational Loop
    const navOverview = container.querySelector('#nav-overview');
    const navIncidents = container.querySelector('#nav-incidents');
    expect(operationalEyebrow.compareDocumentPosition(navOverview!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(operationalEyebrow.compareDocumentPosition(navIncidents!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('handles tab selection callback when System Topology is clicked', () => {
    const onSelectTab = vi.fn();
    render(<Sidebar {...defaultProps} onSelectTab={onSelectTab} />);

    const topologyBtn = screen.getByRole('button', { name: /system topology/i });
    fireEvent.click(topologyBtn);
    expect(onSelectTab).toHaveBeenCalledWith('topology');
  });

  it('sets active styling and aria-current when topology tab is active', () => {
    render(<Sidebar {...defaultProps} currentTab="topology" />);

    const topologyBtn = screen.getByRole('button', { name: /system topology/i });
    expect(topologyBtn.getAttribute('aria-current')).toBe('page');
  });
});
