import { getPublishedHtml } from '@/lib/static-publish';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// GET /p/:token — the published static site, served as a full HTML page.
// No auth required (the token is the capability). Rendered server-side so the site
// works even with JS disabled and is indexable.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const site = await getPublishedHtml(params.token);
  if (!site) return { title: 'Not Found' };
  return { title: site.title };
}

export default async function PublishedSitePage({ params }: { params: { token: string } }) {
  const site = await getPublishedHtml(params.token);
  if (!site) notFound();

  return (
    <div
      style={{ margin: 0 }}
      dangerouslySetInnerHTML={{ __html: site.html }}
      suppressHydrationWarning
    />
  );
}