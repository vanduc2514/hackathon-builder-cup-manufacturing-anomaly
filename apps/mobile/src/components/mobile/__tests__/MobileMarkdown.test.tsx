import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import MobileMarkdown from '../MobileMarkdown';

afterEach(() => cleanup());

describe('MobileMarkdown', () => {
  it('renders headings and lists from markdown source', () => {
    const { container } = render(<MobileMarkdown source={'# Title\n\n- a\n- b'} />);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders single newlines as line breaks', () => {
    const { container } = render(<MobileMarkdown source={'line1\nline2'} />);
    expect(container.querySelector('br')).not.toBeNull();
  });

  it('does not render raw script tags', () => {
    const { container } = render(<MobileMarkdown source={'hello <script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
