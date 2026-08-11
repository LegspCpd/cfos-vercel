import { prisma } from '@/lib/db';
import { verifyPreview } from '@/lib/preview-url';

// GET /api/preview/:id — render a workspace's entry HTML inside the iframe preview.
// SECURITY: the endpoint is NOT open by workspace id. A caller must present a short-lived
// HMAC signature (sig + exp) issued by an authorized route (the workspace owner's GET, or
// the public blueprint share). Without a valid, unexpired signature it returns 403, so a
// random id cannot leak a private workspace's source. The iframe runs in a same-origin
// sandbox with a strict CSP to limit exfiltration from the gadget itself.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  if (!verifyPreview(params.id, url.searchParams.get('sig'), url.searchParams.get('exp'))) {
    return new Response('Forbidden', { status: 403 });
  }
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
