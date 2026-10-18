import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EightDSteps from '../incident/EightDSteps';

afterEach(() => cleanup());

describe('EightDSteps', () => {
  it('renders markdown bodies (bold, lists) instead of raw text', () => {
    const steps = [
      {
        d: 'D3',
        title: 'How bad parts were stopped',
        term: 'Containment',
        body: '**WO-2026-X**\n- Replace insert\n- Verify runout',
        done: true,
      },
      { d: 'D7', title: 'How we stop it coming back', term: 'Prevent recurrence', body: null, done: false },
    ];
    const { container } = render(<EightDSteps steps={steps} />);
    expect(container.querySelector('strong')?.textContent).toBe('WO-2026-X');
    expect(container.querySelectorAll('.md-viewer li')).toHaveLength(2);
    expect(container.textContent).toContain('Not filled in yet.');
  });
});
