// SSH persistent-session manager.
//
// DEPLOYMENT NOTE: this app runs on Vercel serverless, where each request is a fresh
// short-lived process and long-lived TCP/WebSocket connections are not allowed. A true
// interactive shell (vim/top/htop) cannot be held open across requests. Instead we give
// users a *persistent-session illusion* that works within those constraints:
//
//   * The server remembers each session's working directory (cwd) and exported env vars.
//   * Every command is prefixed with `cd <cwd> &&` so the next command starts where the
//     previous one left off — `cd /var/www && ls` then `pwd` prints /var/www.
//   * After each command we probe the new cwd (`pwd`) and update the session state.
//   * Sessions expire after an idle timeout (default 30 min, configurable via
//     SSH_SESSION_TTL_MINUTES) and are cleaned up lazily.
//
// The store is an in-process Map. On a single instance (dev, or a single Vercel lambda
// warm slot) this gives real continuity; across cold starts / multiple instances a session
// simply starts fresh at the login directory — the UI degrades gracefully.

export interface SshSession {
  id: string;
  hostId: string;
  cwd: string | null; // null = login directory (unknown yet)
  env: Record<string, string>; // exported variables, e.g. { FOO: "bar" }
  history: string[]; // last N commands (for the UI)
  createdAt: number;
  lastActiveAt: number;
}

const SESSIONS = new Map<string, SshSession>();
const HISTORY_LIMIT = 50;

// Idle timeout in ms. Read once at module load; env changes require a restart.
const TTL_MS =
  (Number(process.env.SSH_SESSION_TTL_MINUTES) || 30) * 60 * 1000;

// Generate a short random session id (crypto-safe enough for a capability token).
function newId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    // Node fallback (tests / older runtimes).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomBytes } = require('crypto') as typeof import('crypto');
    return randomBytes(12).toString('base64url');
  }
  return Buffer.from(bytes).toString('base64url');
}

// Create a session for a host. Returns the session object.
export function createSession(hostId: string): SshSession {
  pruneExpired();
  const session: SshSession = {
    id: newId(),
    hostId,
    cwd: null,
    env: {},
    history: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  SESSIONS.set(session.id, session);
  return session;
}

// Look up a session by id. Returns null when missing or expired (and removes it).
export function getSession(id: string): SshSession | null {
  const s = SESSIONS.get(id);
  if (!s) return null;
  if (Date.now() - s.lastActiveAt > TTL_MS) {
    SESSIONS.delete(id);
    return null;
  }
  return s;
}

// Touch a session's lastActiveAt (called after every command).
export function touchSession(id: string): void {
  const s = SESSIONS.get(id);
  if (s) s.lastActiveAt = Date.now();
}

// Record a command in the session history (bounded).
export function recordCommand(id: string, command: string): void {
  const s = SESSIONS.get(id);
  if (!s) return;
  s.history.push(command);
  if (s.history.length > HISTORY_LIMIT) s.history.splice(0, s.history.length - HISTORY_LIMIT);
}

// Update the session's working directory after a command.
export function setSessionCwd(id: string, cwd: string | null): void {
  const s = SESSIONS.get(id);
  if (s) s.cwd = cwd;
}

// Merge exported env vars into the session (parsed from `export FOO=bar` lines).
export function applySessionEnv(id: string, lines: string[]): void {
  const s = SESSIONS.get(id);
  if (!s) return;
  for (const line of lines) {
    const m = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) s.env[m[1]] = m[2];
  }
}

// Destroy a session (host removed, terminal closed, etc.).
export function deleteSession(id: string): void {
  SESSIONS.delete(id);
}

// Remove expired sessions. Called lazily on create; also exported for tests.
export function pruneExpired(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, s] of Array.from(SESSIONS.entries())) {
    if (now - s.lastActiveAt > TTL_MS) {
      SESSIONS.delete(id);
      removed++;
    }
  }
  return removed;
}

// Build the shell prefix that restores the session's cwd + env before a command.
// Returns '' when there is nothing to restore (fresh session at login dir).
export function buildSessionPrefix(session: SshSession): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(session.env)) {
    // Quote values with single quotes, escaping embedded single quotes.
    parts.push(`export ${k}='${v.replace(/'/g, "'\\''")}'`);
  }
  if (session.cwd) {
    parts.push(`cd '${session.cwd.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' && ');
}

// Parse `pwd` output into a clean path (strip trailing newline / whitespace).
export function parsePwdOutput(raw: string): string | null {
  const line = raw.split('\n').find((l) => l.trim().length > 0);
  if (!line) return null;
  const p = line.trim();
  return p.startsWith('/') ? p : null;
}

// Parse `export` lines from `env` output into env vars.
export function parseEnvOutput(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('export '));
}

// Human-readable session age, e.g. "12m" / "1h 5m".
export function fmtSessionAge(createdAt: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}