import DocLayout from '@/components/docs/DocLayout';
import Markdown from '@/components/docs/Markdown';
import { getDocContent } from '@/lib/docs';

// /docs — documentation home (renders index.md).
export default function DocsPage() {
  const content = getDocContent('index');
  return (
    <DocLayout>
      {content ? <Markdown content={content} /> : <p>文档未找到。</p>}
    </DocLayout>
  );
}
