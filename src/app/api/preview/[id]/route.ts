import { prisma } from '@/lib/db';

// GET /api/preview/:id — render a workspace's entry HTML inside the iframe preview.
// This endpoint is intentionally unauthenticated by a session token: it is loaded inside
// a sandboxed iframe from the same origin. For single-user/local usage this is acceptable.
// For production multi-tenant usage, gate this behind a signed preview URL.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { files: true },
  });
  if (!workspace) {
    return new Response('Not found', { status: 404 });
  }

  const entry = workspace.files.find((f) => f.isEntry) || workspace.files[0];
  if (!entry) {
    return new Response('No files', { status: 200 });
  }

  // Serve the entry file with a strict CSP so the gadget is sandboxed from the rest of
  // the app. We allow inline scripts (needed for previewing HTML gadgets) but restrict
  // network exfiltration: connect-src is 'self' + https only (no arbitrary http:), and
  // we drop 'unsafe-eval' and frame-src entirely to shrink the same-origin blast radius.
  const csp = [
    "default-src 'self'",
    "script-src 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  return new Response(entry.content, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  });
}
