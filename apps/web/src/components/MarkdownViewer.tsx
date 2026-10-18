// MarkdownViewer: renders Markdown source (GFM tables/lists) as formatted HTML; raw HTML is never rendered.
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MarkdownViewerProps {
  source: string;
  className?: string;
}

export default function MarkdownViewer({ source, className }: MarkdownViewerProps): React.ReactElement {
  return (
    <div className={`md-viewer ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
