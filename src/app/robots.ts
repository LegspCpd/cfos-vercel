import type { MetadataRoute } from 'next';
import { siteBaseUrl } from '@/lib/site';

// /robots.txt — Bing/Google crawl rules.
// Public marketing/docs surfaces are crawlable; everything under the app shell
// (workspaces, admin, API, auth) is private and disallowed. The sitemap is
// referenced here so Bing discovers it without manual submission.
export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/docs', '/blueprints', '/explore', '/outputs', '/login', '/signup'],
        disallow: [
          '/api/',
          '/admin',
          '/workspace/',
          '/workspaces',
          '/connections',
          '/providers',
          '/remote',
          '/context',
          '/shares',
          '/activity',
          '/analytics',
          '/settings',
          '/p/',
          '/compute/',
          '/_next/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}