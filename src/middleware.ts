import { NextResponse, type NextRequest } from 'next/server';

// Canonical-domain redirect (optional).
//
// Set the REDIRECT_TO_DOMAIN env var (e.g. "os.legspcpd.top") to force every request whose
// Host header is NOT that domain to 308-redirect to it, preserving the path and query string.
// This is the general mechanism that covers ALL stray hosts — old domains, future preview
// domains, *.vercel.app aliases — without listing them one by one.
//
// When REDIRECT_TO_DOMAIN is unset (or equals the request host) nothing is redirected, so
// local development (localhost:3000) and the canonical domain itself are never affected.
//
// NOTE: vercel.json also carries static host-based redirects for the two known preview
// domains (see vercel.json "redirects"); those run at the edge before this middleware and
// cover the exact preview hostnames even if the env var is not configured. This middleware
// is the env-driven, catch-all complement.

export function middleware(req: NextRequest) {
  const target = process.env.REDIRECT_TO_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!target) return NextResponse.next();

  // Never redirect cron/webhook endpoints: Vercel Cron calls them on the deployment's own
  // host (e.g. *.vercel.app), and a 308 here would break scheduled jobs. The cron routes
  // are already protected by CRON_SECRET, so they are safe to leave on any host.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const host = req.headers.get('host') ?? '';
  // Normalize: strip port and lowercase for comparison.
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === target.toLowerCase()) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = target;
  url.port = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Run on everything except Next.js internals and static assets (those are served by the
  // edge/CDN and don't need redirecting; the browser will follow the redirect for pages).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)$).*)'],
};