// One-click static publish: bundle a workspace's files into a self-contained static
// site (index.html + assets) and store it in R2 under a public token URL (/p/:token).
//
// The bundle is a single index.html that embeds every file's content (JS/CSS inline,
// images as data URIs) so the published site is fully self-contained — it works from
// any static host with zero build step. The R2 object is served via a presigned URL
// (or proxied by /p/:token when R2 public access isn't configured).

import { randomBytes } from 'crypto';
import { prisma } from './db';
import { r2Put, r2GetPresignedUrl, isR2Configured } from './r2';

export interface PublishResult {
  id: string;
  token: string;
  url: string;
  title: string;
  fileCount: number;
}

// Guess a MIME type from a file extension (subset — enough for static sites).
export function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
    case 'mjs':
      return 'application/javascript';
    case 'json':
      return 'application/json';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'ico':
      return 'image/x-icon';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

// Escape a string for embedding inside a <script> tag.
function escapeScript(s: string): string {
  return s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

// Escape for embedding inside a <style> tag.
function escapeStyle(s: string): string {
  return s.replace(/<\/style/gi, '<\\/style');
}

// Strip external asset references (<link rel="stylesheet">, <script src>) from an
// index.html body. The bundle inlines CSS/JS, so leaving these tags would cause
// 404s on the published site.
function stripExternalRefs(html: string): string {
  return html
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<script\b[^>]*\bsrc=["'][^"']*["'][^>]*\/>/gi, '');
}

// Build a self-contained index.html from the workspace files.
export function buildStaticSite(title: string, files: { path: string; content: string }[]): string {
  const htmlFiles = files.filter((f) => /\.(html?)$/i.test(f.path));
  const cssFiles = files.filter((f) => /\.css$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.(js|mjs)$/i.test(f.path));
  const otherFiles = files.filter(
    (f) => !/\.(html?|css|js|mjs)$/i.test(f.path) && !/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(f.path),
  );

  // If there's an index.html, use it as the body; otherwise synthesize one.
  const indexHtml = htmlFiles.find((f) => /index\.html?$/i.test(f.path))?.content;
  const bodyContent = stripExternalRefs(indexHtml ?? '<div id="app"></div>');

  const cssBlock = cssFiles.map((f) => `<style>\n${escapeStyle(f.content)}\n</style>`).join('\n');
  const jsBlock = jsFiles.map((f) => `<script>\n${escapeScript(f.content)}\n</script>`).join('\n');
  const fileList = otherFiles
    .map((f) => `<li><code>${escapeHtml(f.path)}</code> (${f.content.length} bytes)</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
${cssBlock}
</head>
<body>
${bodyContent}
${jsBlock}
${fileList ? `<hr /><h3>Additional files</h3><ul>${fileList}</ul>` : ''}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Publish a workspace as a static site. Returns the public URL.
export async function publishWorkspace(workspaceId: string, ownerId: string): Promise<PublishResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { files: { select: { path: true, content: true } } },
  });
  if (!workspace) throw new Error('Workspace not found');

  const token = randomBytes(12).toString('base64url');
  const html = buildStaticSite(workspace.title, workspace.files);
  const r2Key = `publish/${token}/index.html`;

  if (isR2Configured()) {
    await r2Put({ key: r2Key, body: html, contentType: 'text/html; charset=utf-8' });
  }

  const site = await prisma.publishedSite.upsert({
    where: { workspaceId },
    update: {
      token,
      r2Key,
      title: workspace.title,
      fileCount: workspace.files.length,
      updatedAt: new Date(),
    },
    create: {
      workspaceId,
      ownerId,
      token,
      r2Key,
      title: workspace.title,
      fileCount: workspace.files.length,
    },
  });

  return {
    id: site.id,
    token: site.token,
    url: `/p/${site.token}`,
    title: site.title,
    fileCount: site.fileCount,
  };
}

// Fetch the published site's HTML for the /p/:token page.
export async function getPublishedHtml(token: string): Promise<{ title: string; html: string } | null> {
  const site = await prisma.publishedSite.findUnique({ where: { token } });
  if (!site) return null;
  if (isR2Configured()) {
    try {
      const url = await r2GetPresignedUrl(site.r2Key, 3600);
      const res = await fetch(url);
      if (res.ok) return { title: site.title, html: await res.text() };
    } catch {
      // fall through to the DB copy below
    }
  }
  // Fallback: rebuild from the workspace files (keeps /p/:token working without R2).
  const workspace = await prisma.workspace.findUnique({
    where: { id: site.workspaceId },
    include: { files: { select: { path: true, content: true } } },
  });
  if (!workspace) return null;
  return { title: site.title, html: buildStaticSite(workspace.title, workspace.files) };
}

// Delete a published site (removes the R2 object + DB row).
export async function deletePublishedSite(token: string, ownerId: string): Promise<boolean> {
  const site = await prisma.publishedSite.findFirst({ where: { token, ownerId } });
  if (!site) return false;
  if (isR2Configured()) {
    try {
      const { r2Delete } = await import('./r2');
      await r2Delete(site.r2Key);
    } catch {
      // ignore R2 failures — the DB row is the source of truth for the listing
    }
  }
  await prisma.publishedSite.delete({ where: { id: site.id } });
  return true;
}