import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSshConfig, connect, close, exec } from '@/lib/ssh';

async function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  return verifySessionToken(token);
}

type Ctx = { params: { id: string } };

// Parse `uptime` (Linux/Unix style): " 12:34:56 up 3 days,  2:15,  2 users,  load average: 0.08, 0.10, 0.11"
function parseUptime(s: string) {
  const m = s.match(/up\s+(?:(\d+)\s+days?,\s*)?(?:(\d+):(\d+)(?::\d+)?|(\d+)\s+min)/);
  let uptimeSec = 0;
  if (m) {
    const days = m[1] ? parseInt(m[1], 10) : 0;
    if (m[2]) uptimeSec = days * 86400 + parseInt(m[2], 10) * 3600 + parseInt(m[3], 10) * 60;
    else if (m[4]) uptimeSec = days * 86400 + parseInt(m[4], 10) * 60;
  }
  const load = s.match(/load average:\s*([\d.]+),?\s*([\d.]+)?,?\s*([\d.]+)?/);
  return {
    uptimeSec,
    load1: load?.[1] ? parseFloat(load[1]) : null,
    load5: load?.[2] ? parseFloat(load[2]) : null,
    load15: load?.[3] ? parseFloat(load[3]) : null,
  };
}

// Parse `free -b` to get memory usage in bytes (KiB column header on Linux).
function parseFree(s: string) {
  const lines = s.split('\n');
  for (const line of lines) {
    if (/^Mem:\s/.test(line.trim())) {
      const parts = line.trim().split(/\s+/); // Mem: total used free shared buffers cached
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      return { total, used, available: Math.max(0, total - used) };
    }
  }
  return null;
}

// Parse `df -k --output=...` — use plain `df -kP` for maximal compatibility, then sum used/total.
function parseDisk(s: string) {
  const lines = s.split('\n').filter((l) => l.trim() && !l.trim().startsWith('Filesystem'));
  let total = 0;
  let used = 0;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/); // Filesystem 1024-blocks Used Available Capacity Mounted
    if (parts.length < 4) continue;
    // Skip pseudo filesystems to get a meaningful overall disk picture.
    if (/^(tmpfs|udev|devtmpfs|overlay|shm)\b/.test(parts[0])) continue;
    const blocks = parseInt(parts[1], 10) * 1024;
    const usedBytes = parseInt(parts[2], 10) * 1024;
    if (!Number.isNaN(blocks) && !Number.isNaN(usedBytes)) {
      total += blocks;
      used += usedBytes;
    }
  }
  return { total, used, available: Math.max(0, total - used) };
}

// GET /api/ssh-hosts/:id/monitor — probe the host and return live system status.
// Opens a short SSH session, runs several read-only commands, closes. Never persists anything.
export async function GET(req: Request, { params }: Ctx) {
  const session = await auth(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = await prisma.sshHost.findFirst({ where: { id: params.id, ownerId: session.userId } });
  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const { config, error } = buildSshConfig(host);
  if (error || !config) {
    return NextResponse.json({ ok: false, error: error || 'No credential' }, { status: 400 });
  }

  try {
    const conn = await connect(config, 15000);
    try {
      const [uname, uptime, free, disk, nproc] = await Promise.all([
        exec(conn, 'uname -srmo').catch(() => ({ stdout: '', stderr: '', code: null })),
        exec(conn, 'uptime').catch(() => ({ stdout: '', stderr: '', code: null })),
        exec(conn, 'free -b').catch(() => ({ stdout: '', stderr: '', code: null })),
        exec(conn, 'df -kP').catch(() => ({ stdout: '', stderr: '', code: null })),
        exec(conn, 'nproc').catch(() => ({ stdout: '', stderr: '', code: null })),
      ]);

      const up = parseUptime(uptime.stdout);
      const mem = parseFree(free.stdout);
      const diskInfo = parseDisk(disk.stdout);
      const cores = parseInt(nproc.stdout.trim(), 10) || null;

      return NextResponse.json({
        ok: true,
        online: true,
        checkedAt: new Date().toISOString(),
        hostname: uname.stdout.trim().split(' ')[0] || host.host,
        os: uname.stdout.trim() || null,
        cores,
        uptimeSec: up.uptimeSec,
        load: { one: up.load1, five: up.load5, fifteen: up.load15 },
        memory: mem ? { totalBytes: mem.total, usedBytes: mem.used, availableBytes: mem.available } : null,
        disk: diskInfo ? { totalBytes: diskInfo.total, usedBytes: diskInfo.used, availableBytes: diskInfo.available } : null,
      });
    } finally {
      close(conn);
    }
  } catch (e) {
    return NextResponse.json({ ok: false, online: false, error: (e as Error).message || 'Monitor failed' });
  }
}
