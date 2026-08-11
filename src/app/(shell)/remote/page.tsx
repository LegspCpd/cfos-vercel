'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Server,
  Plus,
  Trash2,
  Pencil,
  PlugZap,
  Loader2,
  KeyRound,
  Globe,
  X,
  Activity,
  TerminalSquare,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Square,
  Search,
  Copy,
  Check,
  ShieldCheck,
  ShieldOff,
  Calendar,
  Clock,
  MoreVertical,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface SshHost {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  saveCreds: boolean;
  hasCredential: boolean;
  country: string | null;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MonitorData {
  ok: boolean;
  online: boolean;
  error?: string;
  checkedAt?: string;
  hostname?: string;
  os?: string | null;
  cores?: number | null;
  uptimeSec?: number;
  load?: { one: number | null; five: number | null; fifteen: number | null };
  memory?: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
  disk?: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
}

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: 'password' | 'key' | 'keypassphrase';
  password: string;
  privateKey: string;
  passphrase: string;
  saveCreds: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  host: '',
  port: '22',
  username: '',
  authMethod: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  saveCreds: true,
};

// Common commands offered as quick actions in the terminal panel.
const QUICK_COMMANDS = ['ls -la', 'df -h', 'free -h', 'uptime', 'uname -a', 'whoami'];

// Format a byte count into a human-readable size.
function fmtBytes(n: number | undefined | null): string {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

// Format an uptime in seconds into "3d 2h 15m".
function fmtUptime(sec: number | undefined): string {
  if (sec === undefined || sec === null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Short human date, e.g. "2026-08-11 19:46".
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// A single item in the mobile "more" action menu.
function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary ${
        danger ? 'text-red-600 hover:bg-red-500/10' : ''
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

// A small progress bar for used/available fractions.
function Bar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function RemotePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'ok' | 'err'>('ok');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Monitor panel: which host is expanded + its data + loading state.
  const [monitorOpen, setMonitorOpen] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);

  // Terminal panel: which host + command + accumulated output + running state.
  const [termOpen, setTermOpen] = useState<string | null>(null);
  const [termCommand, setTermCommand] = useState('');
  const [termOutput, setTermOutput] = useState('');
  const [termRunning, setTermRunning] = useState(false);
  const termAbortRef = useRef<{ abort: () => void } | null>(null);
  const termScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Auto-scroll terminal output to the bottom as it streams.
  useEffect(() => {
    if (termScrollRef.current) {
      termScrollRef.current.scrollTop = termScrollRef.current.scrollHeight;
    }
  }, [termOutput]);

  async function load() {
    try {
      const res = await api.listSshHosts();
      setHosts(res.hosts);
    } catch {
      setMessage('Failed to load hosts');
      setMessageType('err');
    } finally {
      setLoading(false);
    }
  }

  function notify(msg: string, type: 'ok' | 'err' = 'ok') {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  }

  // Client-side filter over name/host/username.
  const filteredHosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.host.toLowerCase().includes(q) ||
        h.username.toLowerCase().includes(q),
    );
  }, [hosts, search]);

  async function save() {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      notify(t('remote.errRequired') || 'Name, host and username are required', 'err');
      return;
    }
    const port = parseInt(form.port || '22', 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      notify(t('remote.errPort') || 'Port must be between 1 and 65535', 'err');
      return;
    }
    setBusy('save');
    try {
      const common = {
        name: form.name.trim(),
        host: form.host.trim(),
        port,
        username: form.username.trim(),
        authMethod: form.authMethod,
        saveCreds: form.saveCreds,
      };
      if (editingId) {
        await api.updateSshHost(editingId, {
          ...common,
          ...(form.authMethod === 'password'
            ? { password: form.password }
            : { privateKey: form.privateKey, passphrase: form.passphrase || undefined }),
        });
        notify(t('remote.saved') || 'Host updated');
      } else {
        await api.createSshHost({
          ...common,
          ...(form.authMethod === 'password'
            ? { password: form.password }
            : { privateKey: form.privateKey, passphrase: form.passphrase || undefined }),
        });
        notify(t('remote.created') || 'Host added');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      notify((e as Error).message || 'Failed to save host', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function remove(h: SshHost) {
    const label = t('remote.confirmDelete')?.replace('{name}', h.name) || `Delete host "${h.name}"?`;
    if (!window.confirm(label)) return;
    setBusy(h.id);
    try {
      await api.deleteSshHost(h.id);
      notify(t('remote.deleted') || 'Host deleted');
      if (monitorOpen === h.id) setMonitorOpen(null);
      if (termOpen === h.id) {
        termAbortRef.current?.abort();
        termAbortRef.current = null;
        setTermOpen(null);
      }
      await load();
    } catch (e) {
      notify((e as Error).message || 'Failed to remove host', 'err');
    } finally {
      setBusy(null);
    }
  }

  function edit(h: SshHost) {
    setEditingId(h.id);
    setForm({
      name: h.name,
      host: h.host,
      port: String(h.port),
      username: h.username,
      authMethod: (h.authMethod as FormState['authMethod']) || 'password',
      password: '',
      privateKey: '',
      passphrase: '',
      saveCreds: h.saveCreds,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function test(h: SshHost) {
    setTestingId(h.id);
    try {
      const res = await api.testSshHost(h.id);
      if (res.ok) {
        notify(`${t('remote.testOk') || 'Connected successfully'} (${h.host}:${h.port})`);
      } else {
        notify(res.error || t('remote.testFail') || 'Connection failed', 'err');
      }
    } catch (e) {
      notify((e as Error).message || t('remote.testFail') || 'Connection failed', 'err');
    } finally {
      setTestingId(null);
    }
  }

  // Copy an SSH connection string to the clipboard.
  async function copyConn(h: SshHost) {
    const conn = `ssh ${h.username}@${h.host} -p ${h.port}`;
    try {
      await navigator.clipboard.writeText(conn);
      setCopiedId(h.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify(t('remote.testFail') || 'Copy failed', 'err');
    }
  }

  // Toggle the monitor panel for a host and fetch live status.
  async function toggleMonitor(h: SshHost) {
    if (monitorOpen === h.id) {
      setMonitorOpen(null);
      setMonitor(null);
      return;
    }
    setMonitorOpen(h.id);
    setMonitor(null);
    setMonitoring(true);
    try {
      const res = await api.monitorSshHost(h.id);
      setMonitor(res);
    } catch (e) {
      setMonitor({ ok: false, online: false, error: (e as Error).message || 'Monitor failed' });
    } finally {
      setMonitoring(false);
    }
  }

  // Toggle the command terminal panel for a host.
  function toggleTerminal(h: SshHost) {
    if (termOpen === h.id) {
      termAbortRef.current?.abort();
      termAbortRef.current = null;
      setTermRunning(false);
      setTermOpen(null);
      return;
    }
    setTermOpen(h.id);
    setTermCommand('');
    setTermOutput('');
    setTermRunning(false);
  }

  // Run a command via SSE streaming and append output live.
  function runCommand(h: SshHost, cmd?: string) {
    const command = (cmd ?? termCommand).trim();
    if (!command || termRunning) return;
    setTermRunning(true);
    setTermOutput('');
    setTermCommand(command);
    const session = api.execSshHost(h.id, command, (text) => {
      setTermOutput((prev) => prev + text);
    });
    termAbortRef.current = session;
    session.done.then(() => {
      setTermRunning(false);
      termAbortRef.current = null;
    });
  }

  function authMethodLabel(method: string): string {
    if (method === 'password') return t('remote.authPassword') || 'Password';
    if (method === 'keypassphrase') return t('remote.authKeyPass') || 'Key + Passphrase';
    return t('remote.authKey') || 'Private Key';
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Server className="h-6 w-6" /> {t('remote.title') || 'Remote Connections'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('remote.subtitle') || 'Manage your SSH servers and encrypted credentials'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            {t('remote.total')?.replace('{n}', String(hosts.length)) || `${hosts.length} host(s)`}
          </span>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }
            }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? (t('remote.close') || 'Close') : (t('remote.addHost') || 'Add Host')}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {hosts.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('remote.searchPlaceholder') || 'Search name / IP / username...'}
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
      )}

      {message && (
        <div
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            messageType === 'ok' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          }`}
        >
          {message}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && (
        <div className="mb-6 rounded-lg border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fName') || 'Name'}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('remote.fName') || 'Name (e.g. Web Server)'}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fHost') || 'Host'}</label>
              <input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder={t('remote.fHost') || 'Host (IP or hostname)'}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fUsername') || 'Username'}</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder={t('remote.fUsername') || 'Username'}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fPort') || 'Port'}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                placeholder="22"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'password'}
                onChange={() => setForm({ ...form, authMethod: 'password' })}
              />{' '}
              {t('remote.authPassword') || 'Password'}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'key'}
                onChange={() => setForm({ ...form, authMethod: 'key' })}
              />{' '}
              {t('remote.authKey') || 'Private Key'}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'keypassphrase'}
                onChange={() => setForm({ ...form, authMethod: 'keypassphrase' })}
              />{' '}
              {t('remote.authKeyPass') || 'Key + Passphrase'}
            </label>
          </div>

          {form.authMethod === 'password' ? (
            <div className="mt-4">
              <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fPassword') || 'Password'}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={t('remote.fPassword') || 'Password'}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('remote.fKey') || 'Private key'}</label>
                <textarea
                  value={form.privateKey}
                  onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                  placeholder={t('remote.fKey') || 'Private key (PEM)'}
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
              {form.authMethod === 'keypassphrase' && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {t('remote.fPassphrase') || 'Key passphrase'}
                  </label>
                  <input
                    type="password"
                    value={form.passphrase}
                    onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                    placeholder={t('remote.fPassphrase') || 'Key passphrase'}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.saveCreds}
                onChange={(e) => setForm({ ...form, saveCreds: e.target.checked })}
              />
              {t('remote.saveCreds') || 'Save credentials (encrypted)'}
            </label>
            <button
              onClick={save}
              disabled={busy === 'save'}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? (t('remote.save') || 'Save') : (t('remote.add') || 'Add')}
            </button>
          </div>
        </div>
      )}

      {/* Host list */}
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : hosts.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Server className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <div className="text-muted-foreground">
            {t('remote.empty') || 'No SSH hosts yet. Add your first server.'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground/70">
            {t('remote.emptyHint') || 'Supports password / private key auth. Credentials are encrypted at rest.'}
          </div>
        </div>
      ) : filteredHosts.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          {t('remote.noMatch') || 'No matching hosts.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredHosts.map((h) => (
            <div key={h.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <Server className="h-4 w-4 shrink-0" />
                    <span className="truncate">{h.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="max-w-full break-all font-mono">
                      {h.username}@{h.host}:{h.port}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {/* Auth method badge */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                      {h.authMethod === 'password' ? (
                        <KeyRound className="h-3 w-3" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                      {authMethodLabel(h.authMethod)}
                    </span>
                    {/* Credential badge */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                        h.hasCredential
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}
                      title={h.hasCredential ? 'Credential saved' : 'No saved credential'}
                    >
                      {h.hasCredential ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <ShieldOff className="h-3 w-3" />
                      )}
                      {h.hasCredential
                        ? t('remote.credentialSaved') || 'Credential saved'
                        : t('remote.noCredential') || 'No saved credential'}
                    </span>
                    {(h.country || h.region) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {[h.country, h.region].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(h.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t('remote.updatedAt') || 'Updated'} {fmtDate(h.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Action buttons — desktop: all inline; mobile: collapsed into a "more" menu */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="hidden gap-1 sm:flex">
                    <button
                      onClick={() => copyConn(h)}
                      title={t('remote.copyInfo') || 'Copy connection info'}
                      className="rounded p-1.5 hover:bg-secondary"
                    >
                      {copiedId === h.id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => toggleMonitor(h)}
                      title={t('remote.monitorBtn') || 'Monitor'}
                      className="rounded p-1.5 hover:bg-secondary"
                    >
                      <Activity className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleTerminal(h)}
                      title={t('remote.terminalBtn') || 'Terminal'}
                      className="rounded p-1.5 hover:bg-secondary"
                    >
                      <TerminalSquare className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => test(h)}
                      disabled={testingId === h.id}
                      title={t('remote.test') || 'Test connection'}
                      className="rounded p-1.5 hover:bg-secondary"
                    >
                      {testingId === h.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PlugZap className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => edit(h)}
                      title={t('remote.edit') || 'Edit'}
                      className="rounded p-1.5 hover:bg-secondary"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(h)}
                      disabled={busy === h.id}
                      title={t('remote.delete') || 'Delete'}
                      className="rounded p-1.5 hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Mobile: single "more" button opening an action menu */}
                  <div className="relative sm:hidden">
                    <button
                      onClick={() => setMoreOpenId(moreOpenId === h.id ? null : h.id)}
                      className="rounded p-2 hover:bg-secondary"
                      aria-label={t('remote.more') || 'More actions'}
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {moreOpenId === h.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMoreOpenId(null)} />
                        <div className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border bg-popover shadow-lg">
                          <MenuItem
                            icon={copiedId === h.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                            label={t('remote.copyInfo') || 'Copy connection info'}
                            onClick={() => { copyConn(h); setMoreOpenId(null); }}
                          />
                          <MenuItem
                            icon={<Activity className="h-4 w-4" />}
                            label={t('remote.monitorBtn') || 'Monitor'}
                            onClick={() => { toggleMonitor(h); setMoreOpenId(null); }}
                          />
                          <MenuItem
                            icon={<TerminalSquare className="h-4 w-4" />}
                            label={t('remote.terminalBtn') || 'Terminal'}
                            onClick={() => { toggleTerminal(h); setMoreOpenId(null); }}
                          />
                          <MenuItem
                            icon={testingId === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                            label={t('remote.test') || 'Test connection'}
                            onClick={() => { test(h); setMoreOpenId(null); }}
                          />
                          <MenuItem
                            icon={<Pencil className="h-4 w-4" />}
                            label={t('remote.edit') || 'Edit'}
                            onClick={() => { edit(h); setMoreOpenId(null); }}
                          />
                          <MenuItem
                            icon={<Trash2 className="h-4 w-4" />}
                            label={t('remote.delete') || 'Delete'}
                            danger
                            onClick={() => { setMoreOpenId(null); remove(h); }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Monitor panel */}
              {monitorOpen === h.id && (
                <div className="mt-4 rounded-md border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t('remote.monitor') || 'Monitor'} · {h.host}
                    </span>
                    <button
                      onClick={() => toggleMonitor(h)}
                      title={t('remote.refreshMonitor') || 'Refresh'}
                      className="rounded p-1 hover:bg-secondary"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  {monitoring && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('remote.loadingMonitor') || 'Probing host...'}
                    </div>
                  )}

                  {!monitoring && monitor && !monitor.ok && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {t('remote.offline') || 'Offline'}: {monitor.error || 'unreachable'}
                    </div>
                  )}

                  {!monitoring && monitor && monitor.ok && (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2 text-green-600">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {t('remote.online') || 'Online'}
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">{t('remote.hostname') || 'Hostname'}</div>
                          <div className="font-medium">{monitor.hostname || '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('remote.os') || 'OS'}</div>
                          <div className="font-medium">{monitor.os || '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('remote.cores') || 'CPU cores'}</div>
                          <div className="font-medium">{monitor.cores ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('remote.uptime') || 'Uptime'}</div>
                          <div className="font-medium">{fmtUptime(monitor.uptimeSec)}</div>
                        </div>
                      </div>

                      {monitor.load && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Cpu className="h-3.5 w-3.5" />
                            {t('remote.loadAvg') || 'Load (1/5/15)'}
                          </div>
                          <div className="font-mono text-xs">
                            {monitor.load.one ?? '—'} / {monitor.load.five ?? '—'} /{' '}
                            {monitor.load.fifteen ?? '—'}
                          </div>
                        </div>
                      )}

                      {monitor.memory && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MemoryStick className="h-3.5 w-3.5" />
                            {t('remote.memory') || 'Memory'}
                          </div>
                          <Bar used={monitor.memory.usedBytes} total={monitor.memory.totalBytes} />
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {t('remote.used') || 'Used'}: {fmtBytes(monitor.memory.usedBytes)} ·{' '}
                            {t('remote.available') || 'Available'}: {fmtBytes(monitor.memory.availableBytes)}
                          </div>
                        </div>
                      )}

                      {monitor.disk && monitor.disk.totalBytes > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <HardDrive className="h-3.5 w-3.5" />
                            {t('remote.disk') || 'Disk'}
                          </div>
                          <Bar used={monitor.disk.usedBytes} total={monitor.disk.totalBytes} />
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {t('remote.used') || 'Used'}: {fmtBytes(monitor.disk.usedBytes)} ·{' '}
                            {t('remote.available') || 'Available'}: {fmtBytes(monitor.disk.availableBytes)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Terminal panel */}
              {termOpen === h.id && (
                <div className="mt-4 rounded-md border bg-black/90 p-3 text-green-400">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      <TerminalSquare className="h-3.5 w-3.5" />
                      {h.username}@{h.host}:{h.port} ~ $
                    </span>
                    <button
                      onClick={() => toggleTerminal(h)}
                      title={t('remote.closeTerminal') || 'Close terminal'}
                      className="rounded p-1 text-green-400/70 hover:bg-white/10 hover:text-green-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div
                    ref={termScrollRef}
                    className="h-56 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed"
                  >
                    {termOutput || (
                      <span className="text-green-400/60">
                        {t('remote.terminalEmpty') || 'No command run yet. Enter one and click Run.'}
                      </span>
                    )}
                    {termRunning && <span className="inline-block h-3 w-2 animate-pulse bg-green-400 align-middle" />}
                  </div>

                  {/* Quick commands */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-green-400/50">
                      {t('remote.quickCmd') || 'Quick commands'}:
                    </span>
                    {QUICK_COMMANDS.map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => runCommand(h, cmd)}
                        disabled={termRunning}
                        className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-green-400/80 hover:bg-white/10 disabled:opacity-40"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-xs text-green-400/70">$</span>
                    <input
                      value={termCommand}
                      onChange={(e) => setTermCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !termRunning) runCommand(h);
                      }}
                      placeholder={t('remote.terminalPlaceholder') || 'ls -la'}
                      disabled={termRunning}
                      spellCheck={false}
                      className="flex-1 bg-transparent font-mono text-xs text-green-400 outline-none placeholder:text-green-400/40"
                    />
                    <button
                      onClick={() => {
                        if (termRunning) {
                          termAbortRef.current?.abort();
                          termAbortRef.current = null;
                          setTermRunning(false);
                        } else {
                          runCommand(h);
                        }
                      }}
                      disabled={!termCommand.trim() && !termRunning}
                      className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-black hover:bg-green-500 disabled:opacity-50"
                    >
                      {termRunning ? (
                        <>
                          <Square className="h-3 w-3" /> {t('remote.terminalStop') || 'Stop'}
                        </>
                      ) : (
                        t('remote.terminalRun') || 'Run'
                      )}
                    </button>
                  </div>

                  <div className="mt-2 text-[10px] leading-tight text-green-400/50">
                    {t('remote.terminalHint') || 'Streams output of one command (no vim/top on serverless).'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
