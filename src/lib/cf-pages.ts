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

// Build one random segment of 6 lowercase letters + digits (base36), e.g. "a1b2c3".
function randomSegment(): string {
  const s = Math.random().toString(36).slice(2, 8);
  return s.padEnd(6, '0');
}

// Generate a unique, collision-free Pages project name in the three-segment format:
// "<seg>-<seg>-<seg>" (each segment is lowercase letters + digits). Random names never
// depend on the workspace title or user, so a workspace can be redeployed without ever
// hitting a name conflict or reusing a stale project.
export function slugifyProject(_title: string, _fallback: string): string {
  return `${randomSegment()}-${randomSegment()}-${randomSegment()}`;
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
    // Cloudflare requires every manifest KEY and `path` to start with a leading slash
    // (e.g. "/index.html"). Workspace paths are stored without it, so normalize here —
    // otherwise Cloudflare rejects the body as "A 'manifest' field was expected".
    const normalized = f.path.startsWith('/') ? f.path : `/${f.path}`;
    manifest[normalized] = {
      path: normalized,
      content_type: f.contentType || contentTypeOf(f.path),
      hash,
    };
    byHash.set(hash, f.content);
  }

  // Cloudflare's Create Deployment endpoint REQUIRES multipart/form-data, with `manifest`
  // sent as a plain form field whose value is the JSON string (NOT a JSON body — a JSON
  // body is rejected with "A 'manifest' field was expected..."). Using the native FormData
  // lets fetch set the multipart boundary automatically.
  const form = new FormData();
  form.append('manifest', JSON.stringify({ manifest }));

  const res = await fetch(`${API}/accounts/${accountId()}/pages/projects/${project}/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pagesKey()}` },
    body: form,
  });
  const text = await res.text();
  let create: any = null;
  try {
    create = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = create?.errors?.[0]?.message || create?.errors?.[0]?.code || text.slice(0, 200);
    throw new Error(`Cloudflare API ${res.status}: ${msg}`);
  }
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

// Delete a Cloudflare Pages project. Best-effort: the DB record is the source of truth, so
// a failure here just means the remote project lingers (user can remove it in the CF UI).
export async function deletePagesProject(project: string): Promise<void> {
  await cf(`/accounts/${accountId()}/pages/projects/${project}`, { method: 'DELETE' });
}
