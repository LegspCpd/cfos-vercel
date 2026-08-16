import type { MetadataRoute } from 'next';
import { siteBaseUrl } from '@/lib/site';
import { DOC_SLUGS } from '@/content/docs/nav';

// /sitemap.xml — public pages + docs for search engines (Bing/Google).
// Only public, indexable routes are listed (no auth-gated pages like /admin or
// user-owned routes like /workspace/[id] — those are private and must not leak).
// The docs are static content and safe to index; the app shell pages are public
// marketing/landing surfaces.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/signup`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/docs`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/blueprints`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/explore`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/outputs`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/analytics`, changeFrequency: 'weekly', priority: 0.4 },
  ];

  const docPages: MetadataRoute.Sitemap = DOC_SLUGS.filter((s) => s !== 'index').map((slug) => ({
    url: `${base}/docs/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticPages, ...docPages];
}