// Sidebar tests for the Operational Loop + Knowledge Loop hierarchy.
// The previous Architecture group (System Topology) has moved to a standalone demo app.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Sidebar Navigation Hierarchy', () => {
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

  it('renders Operational Loop and Knowledge Loop sections in order', () => {
    const { container } = render(<Sidebar {...defaultProps} />);

    const eyebrows = screen.getAllByText(/(Operational Loop|Knowledge Loop)/i);
    expect(eyebrows.length).toBeGreaterThanOrEqual(2);
    expect(eyebrows[0].textContent).toBe('Operational Loop');
    expect(eyebrows[1].textContent).toBe('Knowledge Loop');

    // No System Topology button in the sidebar (moved to standalone demo)
    expect(screen.queryByRole('button', { name: /system topology/i })).toBeNull();

    // Line Overview and Incidents belong to Operational Loop
    const navOverview = container.querySelector('#nav-overview');
    const navIncidents = container.querySelector('#nav-incidents');
    expect(navOverview).toBeDefined();
    expect(navIncidents).toBeDefined();
  });

  it('handles Line Overview click', () => {
    const onSelectTab = vi.fn();
    render(<Sidebar {...defaultProps} onSelectTab={onSelectTab} />);

    const overviewBtn = screen.getByRole('button', { name: /line overview/i });
    fireEvent.click(overviewBtn);
    expect(onSelectTab).toHaveBeenCalledWith('overview');
  });

  it('marks the active tab with aria-current', () => {
    render(<Sidebar {...defaultProps} currentTab="walkthroughs" />);

    const walkthroughsBtn = screen.getByRole('button', { name: /tech walkthroughs/i });
    expect(walkthroughsBtn.getAttribute('aria-current')).toBe('page');
  });
});