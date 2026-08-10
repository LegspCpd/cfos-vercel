import DocLayout from '@/components/docs/DocLayout';
import Markdown from '@/components/docs/Markdown';
import { getEnDocContent } from '@/lib/docs';

// /en/docs — English documentation home (renders docs/en/index.md).
export default function EnDocsPage() {
  const content = getEnDocContent('index');
  return (
    <DocLayout lang="en">
      {content ? <Markdown content={content} /> : <p>Documentation not found.</p>}
    </DocLayout>
  );
}
