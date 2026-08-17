import { getPublishedHtml } from '@/lib/static-publish';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// GET /p/:token — the published static site, served as a full HTML page.
// No auth required (the token is the capability). Rendered server-side so the site
// works even with JS disabled and is indexable.
export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const site = await getPublishedHtml(params.token);
  if (!site) return { title: 'Not Found' };
  return { title: site.title };
}

export default async function PublishedSitePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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