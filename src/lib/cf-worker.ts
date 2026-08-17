// Cloudflare Workers script management for the "Compute" (Worker) deploy feature.
//
// Uses its OWN env vars (WORKER_*), deliberately separate from the Pages feature (PAGES_*) so
// the two can be authorized independently:
//   WORKER_API_TOKEN    - Cloudflare API token with "Workers Scripts → Edit" on the account
//   WORKER_ACCOUNT_ID   - Cloudflare account id (same account as the Pages projects)
//
// The feature is OFF unless both are set. All calls go to api.cloudflare.com and use a short
// timeout; errors are surfaced as messages (never raw internals).

const API = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 30_000;

export function workerEnabled(): boolean {
  return Boolean(process.env.WORKER_API_TOKEN && process.env.WORKER_ACCOUNT_ID);
}

function cfg() {
  const token = process.env.WORKER_API_TOKEN;
  const account = process.env.WORKER_ACCOUNT_ID;
  if (!token || !account) return null;
  return { token, account };
}

export interface WorkerInfo {
  id: string;
  name: string;
  modified_on: string;
  created_on: string;
}

// List all Workers scripts on the account (paginated, capped at 200).
export async function listWorkers(): Promise<WorkerInfo[]> {
  const c = cfg();
  if (!c) return [];
  const out: WorkerInfo[] = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetch(`${API}/accounts/${c.account}/workers/scripts?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { result?: WorkerInfo[] };
    const items = Array.isArray(data?.result) ? data.result : [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

// Create or update a Worker script with the given JS content.
//
// Cloudflare's Scripts API expects a multipart/form-data body: a `metadata` part declaring the
// upload shape plus a `index.js` part holding the script. Uploading the raw JS as
// `application/javascript` (the old single-format endpoint) silently breaks ES Module scripts
// (those with `export default`) — Cloudflare treats them as legacy service-worker code and ends
// up serving a default/incorrect worker. Detecting the format and setting the metadata
// accordingly makes both module and service-worker scripts deploy correctly.
export async function deployWorker(name: string, code: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  // Validate the script name (Cloudflare allows letters, digits, hyphen, underscore).
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(name)) {
    throw new Error('Invalid worker name (letters, digits, - and _ only, max 100 chars).');
  }

  // A worker is an ES Module if it uses `export` (e.g. `export default { fetch }`); otherwise it
  // is the legacy service-worker form (e.g. `addEventListener('fetch', ...)`).
  const isModule = /\bexport\s+(default|\{|\()/.test(code);

  const form = new FormData();
  // Metadata declares the upload shape. For ES Modules: main_module names the entry file.
  // For service workers: body_part names the part holding the script. The file part is
  // always named `index.js` (matching the metadata reference).
  form.append(
    'metadata',
    new Blob([JSON.stringify(isModule ? { main_module: 'index.js' } : { body_part: 'index.js' })], {
      type: 'application/json',
    }),
  );
  // The file part must be a Blob so the third argument (filename) is accepted and the part is
  // treated as a file upload rather than a plain field. CRITICAL: ES Module parts need the
  // `application/javascript+module` Content-Type — plain `application/javascript` makes
  // Cloudflare parse the module as a legacy service worker and reject `export` syntax.
  form.append(
    'index.js',
    new Blob([code], { type: isModule ? 'application/javascript+module' : 'application/javascript' }),
    'index.js',
  );

  const res = await fetch(`${API}/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${c.token}`,
      // Don't set Content-Type manually: fetch derives `multipart/form-data; boundary=...` from
      // the FormData body, which the API requires.
    },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Delete a Worker script (best-effort; used on project delete).
export async function deleteWorker(name: string): Promise<void> {
  const c = cfg();
  if (!c) return;
  await fetch(`${API}/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${c.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Worker detail / IDE support (the VS Code-style fullscreen editor + detail page)
// ---------------------------------------------------------------------------

// A generic CF API GET helper: returns parsed JSON or throws with a sanitized message.
async function cfGet<T>(path: string): Promise<T> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${c.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// A generic CF API write helper (PUT/POST/DELETE) with a JSON body (optional).
async function cfWrite<T>(path: string, method: 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    // 405 with "authentication scheme" means the API token lacks the write permission
    // for this resource (e.g. Workers Routes / Bindings). Surface a friendly hint.
    if (res.status === 405 && text.includes('authentication scheme')) {
      throw new Error('Cloudflare API token lacks permission for this action. Add the matching permission (e.g. "Workers Routes: Edit") to the token.');
    }
    throw new Error(`Cloudflare API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface WorkerScriptDetail {
  id: string;
  created_on: string;
  modified_on: string;
  handlers?: string[];
  has_modules?: boolean;
  routes?: { id: string; pattern: string; script?: string }[];
  usage_model?: string;
  compatibility_date?: string;
  observability?: { enabled: boolean; head_sampling_rate?: number };
}

// Fetch a single Worker script's metadata (routes, handlers, timestamps, …).
export async function getWorkerScript(name: string): Promise<WorkerScriptDetail | null> {
  const c = cfg();
  if (!c) return null;
  try {
    const data = await cfGet<{ result?: WorkerScriptDetail }>(
      `/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}`,
    );
    return data?.result ?? null;
  } catch {
    return null;
  }
}

// Fetch the raw JS source of a Worker script (the live deployed code).
// The GET response is multipart/form-data: a `metadata` part plus the script part
// (named after the entry module, e.g. `index.js`). We extract the script part's body.
export async function getWorkerCode(name: string): Promise<string | null> {
  const c = cfg();
  if (!c) return null;
  try {
    const res = await fetch(`${API}/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    // Non-multipart (e.g. a plain-text fallback) → return as-is.
    if (!contentType.includes('multipart/form-data')) return text;
    const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
    if (!boundary) return null;
    // Split on the boundary and find the part whose Content-Disposition names the script
    // (any part that is NOT `metadata`). The script part body is the code.
    const parts = text.split(`--${boundary}`);
    for (const part of parts) {
      if (!part.includes('Content-Disposition')) continue;
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd);
      const body = part.slice(headerEnd + 4);
      // Skip the metadata part; take the first script part (index.js / main.js / …).
      if (/name="metadata"/.test(headers)) continue;
      return body.replace(/\r?\n$/, '');
    }
    return null;
  } catch {
    return null;
  }
}

export interface WorkerVersion {
  id: string;
  number: number;
  created_on: string;
  modified_on: string;
  source?: string;
  author_email?: string;
}

// List the deployment versions of a Worker (newest first).
export async function listWorkerVersions(name: string): Promise<WorkerVersion[]> {
  const c = cfg();
  if (!c) return [];
  try {
    const data = await cfGet<{
      result?: {
        items?: {
          id: string;
          number: number;
          metadata?: { created_on?: string; source?: string; author_email?: string };
        }[];
      };
    }>(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/versions?per_page=20`);
    // The version timestamps live in `metadata.created_on` (not the top level).
    return (data?.result?.items ?? []).map((v) => ({
      id: v.id,
      number: v.number,
      created_on: v.metadata?.created_on ?? '',
      modified_on: v.metadata?.created_on ?? '',
      source: v.metadata?.source,
      author_email: v.metadata?.author_email,
    }));
  } catch {
    return [];
  }
}

export interface WorkerBinding {
  name: string;
  type: string;
  // Type-specific fields (namespace_id, database_id, bucket_name, queue_name, …).
  [key: string]: unknown;
}

// List the bindings of a Worker (KV / D1 / R2 / Queue / Secrets / …).
export async function listWorkerBindings(name: string): Promise<WorkerBinding[]> {
  const c = cfg();
  if (!c) return [];
  try {
    const data = await cfGet<{ result?: WorkerBinding[] }>(
      `/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/bindings`,
    );
    return data?.result ?? [];
  } catch {
    return [];
  }
}

export interface WorkerRoute {
  id: string;
  pattern: string;
  script?: string;
}

// List the routes (custom domains / patterns) attached to a Worker.
export async function listWorkerRoutes(name: string): Promise<WorkerRoute[]> {
  const c = cfg();
  if (!c) return [];
  try {
    const data = await cfGet<{ result?: WorkerRoute[] }>(
      `/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/routes`,
    );
    return data?.result ?? [];
  } catch {
    return [];
  }
}

// Add a custom domain route to a Worker (pattern like "example.com/*").
export async function addWorkerRoute(name: string, pattern: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/routes`, 'POST', {
    pattern,
    script: name,
  });
}

// Delete a route from a Worker.
export async function deleteWorkerRoute(name: string, routeId: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/routes/${encodeURIComponent(routeId)}`, 'DELETE');
}

export interface WorkerSecret {
  name: string;
  type: string;
}

// List the secret names of a Worker (values are never returned by CF).
export async function listWorkerSecrets(name: string): Promise<WorkerSecret[]> {
  const c = cfg();
  if (!c) return [];
  try {
    const data = await cfGet<{ result?: WorkerSecret[] }>(
      `/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/secrets`,
    );
    return data?.result ?? [];
  } catch {
    return [];
  }
}

// Add or update a secret on a Worker.
export async function addWorkerSecret(name: string, key: string, value: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/secrets`, 'PUT', {
    name: key,
    text: value,
    type: 'secret_text',
  });
}

// Delete a secret from a Worker.
export async function deleteWorkerSecret(name: string, key: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/secrets/${encodeURIComponent(key)}`, 'DELETE');
}

// Add a binding (KV namespace / D1 database / Queue) to a Worker.
export async function addWorkerBinding(name: string, binding: WorkerBinding): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/bindings`, 'PUT', {
    name: binding.name,
    type: binding.type,
    ...(binding.namespace_id ? { namespace_id: binding.namespace_id } : {}),
    ...(binding.database_id ? { database_id: binding.database_id } : {}),
    ...(binding.queue_name ? { queue_name: binding.queue_name } : {}),
  });
}

// Delete a binding from a Worker.
export async function deleteWorkerBinding(name: string, bindingName: string): Promise<void> {
  const c = cfg();
  if (!c) throw new Error('WORKER_API_TOKEN / WORKER_ACCOUNT_ID are not configured.');
  await cfWrite(`/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/bindings/${encodeURIComponent(bindingName)}`, 'DELETE');
}

// GraphQL Analytics query for a Worker's request/error/CPU metrics over a time window.
// Returns per-minute buckets (or an empty array on failure).
export async function getWorkerAnalytics(
  name: string,
  since: string,
  until: string,
): Promise<{ requests: number; errors: number; cpuMs: number; buckets: { t: string; requests: number; errors: number }[] }> {
  const c = cfg();
  if (!c) return { requests: 0, errors: 0, cpuMs: 0, buckets: [] };
  // Use GraphQL variables (never string interpolation) so script names and timestamps
  // can't inject into the query.
  const query = `query($accountTag: String!, $since: String!, $until: String!, $scriptName: String!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptiveGroups(
          limit: 1000
          filter: {
            datetime_geq: $since
            datetime_leq: $until
            scriptName: $scriptName
          }
          orderBy: [datetime_ASC]
        ) {
          sum { requests subrequests errors cpuTime }
          dimensions { datetime }
        }
      }
    }
  }`;
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { accountTag: c.account, since, until, scriptName: name },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { requests: 0, errors: 0, cpuMs: 0, buckets: [] };
    const data = (await res.json()) as {
      data?: {
        viewer?: {
          accounts?: {
            workersInvocationsAdaptiveGroups?: {
              sum?: { requests?: number; subrequests?: number; errors?: number; cpuTime?: number };
              dimensions?: { datetime?: string };
            }[];
          }[];
        };
      };
    };
    const groups = data?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptiveGroups ?? [];
    const buckets = groups.map((g) => ({
      t: g.dimensions?.datetime ?? '',
      requests: g.sum?.requests ?? 0,
      errors: g.sum?.errors ?? 0,
    }));
    const total = groups.reduce(
      (acc, g) => ({
        requests: acc.requests + (g.sum?.requests ?? 0),
        errors: acc.errors + (g.sum?.errors ?? 0),
        cpuMs: acc.cpuMs + (g.sum?.cpuTime ?? 0),
      }),
      { requests: 0, errors: 0, cpuMs: 0 },
    );
    return { ...total, buckets };
  } catch {
    return { requests: 0, errors: 0, cpuMs: 0, buckets: [] };
  }
}

export interface TailSession {
  id: string;
  url: string;
}

// Create a real-time Tail session for a Worker. Returns the WebSocket URL to connect to.
// The caller (server-side SSE bridge) connects with the API token; the token never reaches
// the browser. Returns null when the token lacks Tail permission (caller degrades gracefully).
export async function createTail(name: string): Promise<TailSession | null> {
  const c = cfg();
  if (!c) return null;
  try {
    const data = await cfWrite<{ result?: { id: string; url: string } }>(
      `/accounts/${c.account}/workers/scripts/${encodeURIComponent(name)}/tails`,
      'POST',
      {},
    );
    return data?.result ? { id: data.result.id, url: data.result.url } : null;
  } catch {
    return null;
  }
}
