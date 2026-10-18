// MobileMarkdown: renders Markdown source (GFM tables/lists) as formatted HTML; raw HTML is never rendered.
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MobileMarkdownProps {
  source: string;
}

export default function MobileMarkdown({ source }: MobileMarkdownProps): React.ReactElement {
  return (
    <div className="m-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{source}</ReactMarkdown>
    </div>
  );
}
