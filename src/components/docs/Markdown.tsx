'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders markdown with the docs styling (prose).
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
