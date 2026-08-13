// Cloudflare D1 as a SECONDARY BACKUP for the KV response cache (optional, OFF by default).
//
// When enabled, every KV cache write is also mirrored to the configured D1 database(s), and a
// KV miss can fall back to D1. This gives resilience if KV is unavailable / evicted, and serves
// as a redundant store alongside Neon for the most important cached data.
//
// Env (all optional; feature is OFF unless D1_ENABLED is set):
//   D1_ENABLED     - set to "true"/"1" to enable the D1 mirror
//   D1_API_KEY     - Cloudflare API token (needs Workers D1 read/write on the database)
//   D1_ACCESS      - Cloudflare account id (usually the same as PAGES_ACCOUNT_ID)
//   D1_SQL_1 … D1_SQL_5 - up to 5 D1 database ids. Configuring MORE than 5 raises an error
//                          asking you to remove one.
//
// All operations are best-effort and swallow errors: D1 failure never breaks a request, it just
// means the mirror/fallback is skipped.
//
// D1 is accessed over the Cloudflare REST API:
//   POST /accounts/{account}/d1/database/{db}/query   body: { sql, params }

const API = 'https://api.cloudflare.com/client/v4';
const MAX_DBS = 5;
const FETCH_TIMEOUT_MS = 3000;

// Lazy one-time table creation per process (CREATE TABLE IF NOT EXISTS is idempotent, so even
// if two instances race it's harmless).
let tableReady = false;
let tableReadyPromise: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (tableReady) return Promise.resolve();
  if (!tableReadyPromise) {
    tableReadyPromise = d1EnsureTable()
      .then(() => {
        tableReady = true;
      })
      .catch(() => {
        tableReadyPromise = null; // allow retry on next call
      });
  }
  return tableReadyPromise;
}

function cfg() {
  const enabled = process.env.D1_ENABLED === 'true' || process.env.D1_ENABLED === '1';
  if (!enabled) return null;
  const token = process.env.D1_API_KEY;
  const account = process.env.D1_ACCESS;
  const dbs: string[] = [];
  for (let i = 1; i <= MAX_DBS; i++) {
    const id = process.env[`D1_SQL_${i}`];
    if (id) dbs.push(id);
  }
  // Sanity: refuse to start if MORE than 5 are configured (protects against a typo silently
  // selecting the wrong set of databases).
  if (process.env.D1_SQL_6) {
    throw new Error(
      'D1 supports at most 5 databases. Remove the extra D1_SQL_6 (and beyond) environment variables.',
    );
  }
  if (!token || !account || dbs.length === 0) return null;
  return { token, account, dbs };
}

export function isD1Enabled(): boolean {
  // If D1 is explicitly enabled but MORE than 5 databases are configured, this is a developer
  // misconfiguration — surface it loudly (not silently) so it gets fixed instead of being
  // ignored. "Silent fallback to KV-only" is reserved for the *optional* case (not enabled or
  // not fully configured).
  if (process.env.D1_ENABLED === 'true' || process.env.D1_ENABLED === '1') {
    if (process.env.D1_SQL_6) {
      throw new Error(
        'D1 supports at most 5 databases. Remove the extra D1_SQL_6 (and beyond) environment variables.',
      );
    }
    return true;
  }
  return false;
}

// Query all configured D1 databases. Returns the first successful result rows (or null if all
// fail / no rows). A hard throw from cfg() (too many dbs) is caught by the caller.
async function d1Query(sql: string, params: unknown[]): Promise<unknown[] | null> {
  const c = cfg();
  if (!c) return null;
  let rows: unknown[] | null = null;
  for (const db of c.dbs) {
    try {
      const res = await fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { result?: unknown[][] };
      if (Array.isArray(data?.result) && data.result.length > 0) {
        // Each result element is an array of row objects.
        rows = data.result;
        break; // use the first database that has a result
      }
    } catch {
      continue;
    }
  }
  return rows;
}

// Read a cached value from D1 (mirror). Returns the string value or null.
export async function d1Get(key: string): Promise<string | null> {
  if (!isD1Enabled()) return null;
  try {
    await ensureTable();
    const rows = await d1Query(
      'SELECT v FROM cache_store WHERE k = ? AND (exp = 0 OR exp > ?)',
      [key, Date.now()],
    );
    if (!rows || rows.length === 0) return null;
    const first = rows[0] as Array<{ v?: unknown }>;
    const row = first?.[0];
    return typeof row?.v === 'string' ? row.v : null;
  } catch {
    return null;
  }
}

// Mirror a cache value into D1 with an expiry (ms). Upserts the row.
export async function d1Set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (!isD1Enabled()) return;
  const ttl = Math.max(1, ttlSeconds ?? 60);
  const exp = Date.now() + ttl * 1000;
  try {
    const c = cfg();
    if (!c) return;
    await Promise.all(
      c.dbs.map((db) =>
        fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: 'INSERT INTO cache_store (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp',
            params: [key, value, exp],
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => undefined),
      ),
    );
  } catch {
    /* ignore */
  }
}

// Write an arbitrary JSON snapshot into a D1 table (used by the Neon→D1 backup). The row is
// keyed by `rowKey`, and `value` is stored as JSON text with an expiry of 0 (never expires).
export async function d1WriteTable(table: string, rowKey: string, value: string): Promise<void> {
  if (!isD1Enabled()) return;
  // Defense-in-depth: the table name is interpolated into SQL, so it MUST be a plain
  // identifier (current callers pass a compile-time constant). Reject anything else so a
  // future caller can never inject SQL via `table`.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return;
  try {
    const c = cfg();
    if (!c) return;
    // Create the table if missing (safe, idempotent) then upsert the snapshot row.
    const createSql = `CREATE TABLE IF NOT EXISTS ${table} (k TEXT PRIMARY KEY, v TEXT, exp INTEGER)`;
    const upsertSql = `INSERT INTO ${table} (k, v, exp) VALUES (?, ?, 0) ON CONFLICT(k) DO UPDATE SET v = excluded.v`;
    await Promise.all(
      c.dbs.map((db) =>
        (async () => {
          const create = await fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: createSql, params: [] }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }).catch(() => undefined);
          if (create && create.ok) {
            await fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ sql: upsertSql, params: [rowKey, value] }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            }).catch(() => undefined);
          }
        })(),
      ),
    );
  } catch {
    /* ignore */
  }
}

// Prune a D1 table so only the newest `keep` rows (by rowKey) remain. Used for backup
// retention. Best-effort; skips on error.
export async function d1Prune(table: string, keep: number): Promise<void> {
  if (!isD1Enabled() || keep < 1) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return;
  try {
    const c = cfg();
    if (!c) return;
    // Keep rows whose rowKey is among the newest `keep` (rowKey is a sortable timestamp key,
    // so lexicographic DESC == newest first). Delete the rest.
    const sql = `DELETE FROM ${table} WHERE k NOT IN (
      SELECT k FROM ${table} ORDER BY k DESC LIMIT ?
    )`;
    await Promise.all(
      c.dbs.map((db) =>
        fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, params: [keep] }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => undefined),
      ),
    );
  } catch {
    /* ignore */
  }
}

// Delete a mirrored value from D1.
export async function d1Delete(key: string): Promise<void> {
  if (!isD1Enabled()) return;
  try {
    const c = cfg();
    if (!c) return;
    await Promise.all(
      c.dbs.map((db) =>
        fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: 'DELETE FROM cache_store WHERE k = ?', params: [key] }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => undefined),
      ),
    );
  } catch {
    /* ignore */
  }
}

// Ensure the cache table exists on all configured D1 databases (call once at startup, e.g. via
// an instrument.ts hook or lazily on first use). Best-effort.
export async function d1EnsureTable(): Promise<void> {
  if (!isD1Enabled()) return;
  try {
    const c = cfg();
    if (!c) return;
    const sql = 'CREATE TABLE IF NOT EXISTS cache_store (k TEXT PRIMARY KEY, v TEXT, exp INTEGER)';
    await Promise.all(
      c.dbs.map((db) =>
        fetch(`${API}/accounts/${c.account}/d1/database/${db}/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, params: [] }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => undefined),
      ),
    );
  } catch {
    /* ignore */
  }
}
