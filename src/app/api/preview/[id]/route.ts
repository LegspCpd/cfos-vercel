import { prisma } from '@/lib/db';
import { verifyPreview } from '@/lib/preview-url';

// GET /api/preview/:id — render a workspace's entry HTML inside the iframe preview.
// SECURITY: the endpoint is NOT open by workspace id. A caller must present a short-lived
// HMAC signature (sig + exp) issued by an authorized route (the workspace owner's GET, or
// the public blueprint share). Without a valid, unexpired signature it returns 403, so a
// random id cannot leak a private workspace's source. The iframe runs in a same-origin
// sandbox with a strict CSP to limit exfiltration from the gadget itself.
//
// The entry file may reference sibling assets (style.css, app.js, images) with relative
// URLs. Those resolve to /api/preview/<name> which carries no signature, so we rewrite
// relative href/src references in the entry HTML to signed URLs with a `file` query
// parameter; the same signature authorizes the whole workspace, and `file` selects which
// file to serve.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // A `file` query parameter selects a sibling asset; otherwise serve the entry file.
  const fileParam = url.searchParams.get('file');
  const file = fileParam
    ? workspace.files.find((f) => f.path === fileParam)
    : workspace.files.find((f) => f.isEntry) || workspace.files[0];
  if (!file) {
    return new Response('Not found', { status: 404 });
  }

  // Serve the entry file with a strict CSP so the gadget is sandboxed from the rest of
  // the app. We allow inline scripts (needed for previewing HTML gadgets) plus same-origin
  // assets (the workspace's own style.css / app.js referenced by the entry file), but
  // restrict network exfiltration: connect-src is 'self' + https only (no arbitrary http:),
  // and we drop frame-src entirely to shrink the same-origin blast radius.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  const contentType = file.path.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : file.path.endsWith('.js')
      ? 'application/javascript; charset=utf-8'
      : file.path.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'text/html; charset=utf-8';

  let body = file.content;
  if (!fileParam) {
    // Rewrite relative asset references in the entry HTML to signed URLs so the
    // workspace's own style.css / app.js load inside the sandboxed iframe.
    const base = `/api/preview/${encodeURIComponent(params.id)}?sig=${url.searchParams.get('sig')}&exp=${url.searchParams.get('exp')}`;
    body = body.replace(/(href|src)="([^"#][^"]*)"/g, (match, attr: string, ref: string) => {
      if (/^(https?:|data:|blob:|#|\/)/.test(ref)) return match; // absolute, data, anchor, or root-relative
      return `${attr}="${base}&file=${encodeURIComponent(ref)}"`;
    });
  }

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Security-Policy': csp,
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  });
}
