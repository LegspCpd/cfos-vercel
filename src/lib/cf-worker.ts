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
  form.append(
    'metadata',
    JSON.stringify(isModule ? { body_part: 'script', main_module: 'index.js' } : { body_part: 'index.js' }),
  );
  // The file part must be a Blob so the third argument (filename) is accepted and the part is
  // treated as a file upload rather than a plain field.
  form.append('index.js', new Blob([code], { type: 'application/javascript' }), 'index.js');

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
