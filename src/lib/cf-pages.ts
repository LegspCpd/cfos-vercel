import { createHash } from 'crypto';

// Cloudflare Pages client for the deploy feature.
// Env: PAGES_KEY (API token, must allow Pages project create + deploy and KV),
//      PAGES_ACCOUNT_ID (Cloudflare account id).
// Project name must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ and be unique per account.

const API = 'https://api.cloudflare.com/client/v4';

function pagesKey(): string {
  const k = process.env.PAGES_KEY;
  if (!k) throw new Error('PAGES_KEY is not configured.');
  return k;
}

function accountId(): string {
  const id = process.env.PAGES_ACCOUNT_ID;
  if (!id) throw new Error('PAGES_ACCOUNT_ID is not configured.');
  return id;
}

// Base authed fetch; throws with a readable message on non-2xx (CF error JSON included).
async function cf(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pagesKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || data?.errors?.[0]?.code || text.slice(0, 200);
    throw new Error(`Cloudflare API ${res.status}: ${msg}`);
  }
  return data;
}

// Sanitize a workspace title into a valid Pages project name. `fallback` is used when the
// title yields nothing usable (e.g. all-non-ASCII), and is also appended to guarantee
// uniqueness so different workspaces never collide on one Pages project.
export function slugifyProject(title: string, fallback: string): string {
  const base = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const slug = base || fallback.replace(/^ws-/, '') || 'app';
  return `${slug}-${fallback.slice(0, 8)}`.replace(/^-+|-+$/g, '').slice(0, 32) || fallback;
}

export interface PagesFile {
  path: string;
  content: Buffer;
  contentType?: string;
}

// Best-effort MIME type from a file extension (used in the manifest).
function contentTypeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    txt: 'text/plain',
    md: 'text/markdown',
    xml: 'application/xml',
    wasm: 'application/wasm',
    pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

// Get or create a Pages project. Returns { name, subdomain } where subdomain is the
// *.pages.dev host (e.g. "name.hash.pages.dev") — we read the canonical subdomain.
export async function ensureProject(name: string): Promise<{ name: string; subdomain: string | null }> {
  try {
    const data = await cf(`/accounts/${accountId()}/pages/projects/${name}`);
    const p = data.result;
    return { name, subdomain: p.subdomain ?? null };
  } catch (e) {
    // 404 → create; any other error bubbles up.
    const msg = String((e as Error).message);
    if (!msg.includes('404')) throw e;
  }
  const data = await cf(`/accounts/${accountId()}/pages/projects`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      production_branch: 'main',
    }),
  });
  const p = data.result;
  return { name, subdomain: p.subdomain ?? null };
}

// Deploy a set of files to a Pages project via Direct Upload.
// Returns { url, deploymentId }.
export async function deployFiles(
  project: string,
  files: PagesFile[],
): Promise<{ url: string; deploymentId: string }> {
  // Cloudflare Direct Upload expects `manifest` to be an OBJECT mapping each path to
  // { path, content_type, hash }, where hash is the hex SHA-256 (64 chars). The response
  // `missing_hashes` are those same hex hashes, and file contents are uploaded to `url`
  // concatenated in that exact order with the returned JWT.
  const hashOf = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
  const manifest: Record<string, { path: string; content_type: string; hash: string }> = {};
  const byHash = new Map<string, Buffer>();
  for (const f of files) {
    const hash = hashOf(f.content);
    manifest[f.path] = {
      path: f.path,
      content_type: f.contentType || contentTypeOf(f.path),
      hash,
    };
    byHash.set(hash, f.content);
  }

  const create = await cf(`/accounts/${accountId()}/pages/projects/${project}/deployments`, {
    method: 'POST',
    body: JSON.stringify({ manifest }),
  });
  const result = create.result;
  const uploadUrl: string = result.url;
  const jwt: string = result.jwt;
  const missing: string[] = result.missing_hashes || [];

  if (missing.length > 0) {
    // Upload missing file contents concatenated in the exact order of missing_hashes.
    const chunks = missing.map((h) => byHash.get(h)).filter((c): c is Buffer => Boolean(c));
    const body = Buffer.concat(chunks);
    const up = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/octet-stream',
      },
      body,
    });
    if (!up.ok) {
      throw new Error(`Upload failed: ${up.status} ${(await up.text()).slice(0, 200)}`);
    }
  }

  return { url: result.url as string, deploymentId: result.id as string };
}

// Get a deployment's current status: success | failure | active | etc.
export async function getDeploymentStatus(
  project: string,
  deploymentId: string,
): Promise<{ stage: string; status: string; url: string }> {
  const data = await cf(`/accounts/${accountId()}/pages/projects/${project}/deployments/${deploymentId}`);
  const d = data.result;
  return { stage: d.stage, status: d.status ?? d.latest_stage?.status, url: d.url };
}

// Bind a custom domain to the project.
export async function bindCustomDomain(project: string, domain: string): Promise<void> {
  await cf(`/accounts/${accountId()}/pages/projects/${project}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  });
}
