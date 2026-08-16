import { notFound } from 'next/navigation';
import DocLayout from '@/components/docs/DocLayout';
import Markdown from '@/components/docs/Markdown';
import DocSearch from '@/components/docs/DocSearch';
import { getEnDocContent } from '@/lib/docs';
import { DOC_SLUGS_EN } from '@/content/docs/nav';

// Static generation for all English doc pages.
export function generateStaticParams() {
  return DOC_SLUGS_EN.filter((s) => s !== 'index').map((slug) => ({ slug }));
}

export default function EnDocPage({ params }: { params: { slug: string } }) {
  const content = getEnDocContent(params.slug);
  if (!content) notFound();
  return (
    <DocLayout lang="en">
      <DocSearch lang="en" />
      <Markdown content={content} />
    </DocLayout>
  );
}
