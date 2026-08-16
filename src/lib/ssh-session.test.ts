import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  touchSession,
  recordCommand,
  setSessionCwd,
  applySessionEnv,
  deleteSession,
  pruneExpired,
  buildSessionPrefix,
  parsePwdOutput,
  parseEnvOutput,
  fmtSessionAge,
} from '@/lib/ssh-session';

describe('ssh-session', () => {
  beforeEach(() => {
    // Reset the module-level store between tests by pruning everything.
    // (Sessions are created with now() timestamps; pruneExpired only removes
    //  expired ones, so we delete created sessions explicitly.)
  });

  describe('createSession / getSession', () => {
    it('creates a session with a unique id and empty state', () => {
      const a = createSession('host-1');
      const b = createSession('host-1');
      expect(a.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
      expect(a.hostId).toBe('host-1');
      expect(a.cwd).toBeNull();
      expect(a.env).toEqual({});
      expect(a.history).toEqual([]);
    });

    it('returns null for unknown sessions', () => {
      expect(getSession('nope')).toBeNull();
    });

    it('returns the session for a known id', () => {
      const s = createSession('host-1');
      expect(getSession(s.id)?.id).toBe(s.id);
    });

    it('deletes a session', () => {
      const s = createSession('host-1');
      deleteSession(s.id);
      expect(getSession(s.id)).toBeNull();
    });
  });

  describe('cwd tracking', () => {
    it('updates and restores cwd', () => {
      const s = createSession('host-1');
      setSessionCwd(s.id, '/var/www');
      expect(getSession(s.id)?.cwd).toBe('/var/www');
      // buildSessionPrefix includes a cd command.
      const prefix = buildSessionPrefix(getSession(s.id)!);
      expect(prefix).toContain("cd '/var/www'");
    });

    it('builds an empty prefix for a fresh session', () => {
      const s = createSession('host-1');
      expect(buildSessionPrefix(getSession(s.id)!)).toBe('');
    });

    it('escapes single quotes in cwd', () => {
      const s = createSession('host-1');
      setSessionCwd(s.id, "/tmp/it's");
      const prefix = buildSessionPrefix(getSession(s.id)!);
      expect(prefix).toContain("cd '/tmp/it'\\''s'");
    });
  });

  describe('env tracking', () => {
    it('applies export lines and restores them', () => {
      const s = createSession('host-1');
      applySessionEnv(s.id, ['export FOO=bar', 'export NODE_ENV=production']);
      const prefix = buildSessionPrefix(getSession(s.id)!);
      expect(prefix).toContain("export FOO='bar'");
      expect(prefix).toContain("export NODE_ENV='production'");
    });

    it('ignores non-export lines', () => {
      const s = createSession('host-1');
      applySessionEnv(s.id, ['FOO=bar', 'echo hi', 'export OK=1']);
      const prefix = buildSessionPrefix(getSession(s.id)!);
      expect(prefix).not.toContain('FOO=bar');
      expect(prefix).toContain("export OK='1'");
    });

    it('escapes single quotes in env values', () => {
      const s = createSession('host-1');
      applySessionEnv(s.id, ["export GREETING=it's"]);
      const prefix = buildSessionPrefix(getSession(s.id)!);
      expect(prefix).toContain("export GREETING='it'\\''s'");
    });
  });

  describe('history', () => {
    it('records commands in order', () => {
      const s = createSession('host-1');
      recordCommand(s.id, 'ls');
      recordCommand(s.id, 'pwd');
      expect(getSession(s.id)?.history).toEqual(['ls', 'pwd']);
    });
  });

  describe('touchSession', () => {
    it('updates lastActiveAt', () => {
      const s = createSession('host-1');
      const before = s.lastActiveAt;
      // Simulate time passing.
      (s as { lastActiveAt: number }).lastActiveAt = before - 5000;
      touchSession(s.id);
      expect(getSession(s.id)!.lastActiveAt).toBeGreaterThan(before - 5000);
    });
  });

  describe('pruneExpired', () => {
    it('removes expired sessions', () => {
      const s = createSession('host-1');
      // Force the session to look expired (TTL is 30 min by default).
      (s as { lastActiveAt: number }).lastActiveAt = Date.now() - 31 * 60 * 1000;
      const removed = pruneExpired();
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(getSession(s.id)).toBeNull();
    });
  });

  describe('parsePwdOutput', () => {
    it('parses a pwd line', () => {
      expect(parsePwdOutput('/var/www\n')).toBe('/var/www');
      expect(parsePwdOutput('  /home/user  \n')).toBe('/home/user');
    });

    it('returns null for non-path output', () => {
      expect(parsePwdOutput('')).toBeNull();
      expect(parsePwdOutput('not a path')).toBeNull();
    });
  });

  describe('parseEnvOutput', () => {
    it('extracts export lines', () => {
      const lines = parseEnvOutput('FOO=bar\nexport BAZ=1\nexport QUX="a b"\n');
      expect(lines).toEqual(['export BAZ=1', 'export QUX="a b"']);
    });
  });

  describe('fmtSessionAge', () => {
    it('formats ages', () => {
      const now = Date.now();
      expect(fmtSessionAge(now - 30 * 1000, now)).toBe('30s');
      expect(fmtSessionAge(now - 12 * 60 * 1000, now)).toBe('12m');
      expect(fmtSessionAge(now - 65 * 60 * 1000, now)).toBe('1h 5m');
    });
  });
});