import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import MarkdownViewer from '../MarkdownViewer';

afterEach(() => cleanup());

describe('MarkdownViewer', () => {
  it('renders headings, lists and GFM tables', () => {
    const { container } = render(
      <MarkdownViewer source={'# Title\n\n- a\n- b\n\n| k | v |\n|---|---|\n| x | 1 |'} />,
    );
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('td:last-child')?.textContent).toBe('1');
  });

  it('renders single newlines as line breaks', () => {
    const { container } = render(<MarkdownViewer source={'line1\nline2'} />);
    expect(container.querySelector('br')).not.toBeNull();
  });

  it('does not render raw script tags', () => {
    const { container } = render(<MarkdownViewer source={'hello <script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
