import { NextResponse } from 'next/server';

// GET /indexnow-key.txt — IndexNow protocol requires a key file at the site root:
// https://www.bing.com/indexnow/getstarted. The key is a random hex string set via
// the INDEXNOW_KEY env var. When unset, we return 404 so the route is inert.
export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new NextResponse('Not found', { status: 404 });
  // The file must contain ONLY the key (no newline, no extra text).
  return new NextResponse(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}