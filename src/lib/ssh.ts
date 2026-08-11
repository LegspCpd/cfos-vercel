// Shared SSH helpers for the Remote Connections panel.
//
// DEPLOYMENT NOTE: this app runs on Vercel serverless functions, where each request is
// a fresh short-lived process and long-lived TCP/WebSocket connections are not allowed.
// ssh2 still works fine, but ONLY as short-lived sessions: connect → run one or a few
// commands → close, all within a single function invocation. There is no way to hold an
// interactive full-duplex shell across requests here. So we expose two safe modes:
//   * exec command (run a single command, stream its output) — used by monitoring and
//     the command-style terminal.
//   * probe (connect + minimal banner) — used by the test button.
// Interactive full-screen TUI apps (vim, top, htop) cannot work in this deployment model.

import { Client, ConnectConfig } from 'ssh2';
import { decryptSecret } from './credentials';

// A resolved, usable SSH credential set (password or private key + optional passphrase).
export interface SshCredential {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

// Build a ConnectConfig from a stored SshHost row + optional in-request credentials.
// `host` is the prisma row (must include encryptedSecret / hasCredential / authMethod).
// `provided` carries credentials supplied in the current request (never persisted), which
// take precedence only when no stored credential is usable.
export function buildSshConfig(
  row: {
    host: string;
    port: number;
    username: string;
    encryptedSecret: string | null;
    hasCredential: boolean;
    authMethod: string;
  },
  provided?: { password?: string; privateKey?: string; passphrase?: string },
): { config: ConnectConfig; error?: string } {
  let password: string | undefined;
  let privateKey: string | undefined;
  let passphrase: string | undefined;

  if (row.encryptedSecret && row.hasCredential) {
    const secret = decryptSecret(row.encryptedSecret);
    if (secret) {
      const sep = secret.indexOf('\n__PASSPHRASE__\n');
      if (sep !== -1) {
        privateKey = secret.slice(0, sep);
        passphrase = secret.slice(sep + '\n__PASSPHRASE__\n'.length);
      } else if (row.authMethod === 'password') {
        password = secret;
      } else {
        privateKey = secret;
      }
    }
  }
  if (!password && !privateKey) {
    password = provided?.password;
    privateKey = provided?.privateKey;
    passphrase = provided?.passphrase;
  }

  const config: ConnectConfig = {
    host: row.host,
    port: row.port,
    username: row.username,
    readyTimeout: 15000,
  };
  if (privateKey) {
    config.privateKey = privateKey;
    if (passphrase) config.passphrase = passphrase;
  } else if (password) {
    config.password = password;
  } else {
    return { config, error: 'No credential available for this host.' };
  }
  return { config };
}

// Open an SSH connection and resolve with the ssh2 Client once ready. Rejects with a
// human-readable Error message on failure. `timeoutMs` bounds the whole handshake.
export function connect(config: ConnectConfig, timeoutMs = 15000): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connection timed out.'));
    }, timeoutMs);
    conn.on('ready', () => {
      clearTimeout(timer);
      resolve(conn);
    });
    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    conn.connect(config);
  });
}

// Run a single command over SSH and collect its stdout/stderr + exit code. Resolves once
// the stream ends. `onData` (optional) lets a caller stream output incrementally (used by
// the command-style terminal); when omitted the full output is buffered.
export function exec(
  conn: Client,
  command: string,
  onData?: (chunk: Buffer) => void,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      let stdout = '';
      let stderr = '';
      stream.on('close', (code: number | null) => {
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        onData?.(chunk);
      });
      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
    });
  });
}

// Cleanly close a connection, swallowing errors (used for best-effort teardown).
export function close(conn: Client): void {
  try {
    conn.end();
  } catch {
    /* ignore */
  }
}
