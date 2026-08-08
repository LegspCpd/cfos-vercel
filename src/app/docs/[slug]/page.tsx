import { notFound } from 'next/navigation';
import DocLayout from '@/components/docs/DocLayout';
import Markdown from '@/components/docs/Markdown';
import { getDocContent } from '@/lib/docs';
import { DOC_SLUGS } from '@/content/docs/nav';

// Static generation for all doc pages.
export function generateStaticParams() {
  return DOC_SLUGS.filter((s) => s !== 'index').map((slug) => ({ slug }));
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const content = getDocContent(params.slug);
  if (!content) notFound();
  return (
    <DocLayout>
      <Markdown content={content} />
    </DocLayout>
  );
}
