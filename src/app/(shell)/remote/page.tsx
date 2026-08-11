'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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

  async function save() {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      notify(t('remote.errRequired') || 'Name, host and username are required', 'err');
      return;
    }
    setBusy('save');
    try {
      const common = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Math.max(1, Math.min(65535, parseInt(form.port || '22', 10) || 22)),
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

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.deleteSshHost(id);
      notify(t('remote.deleted') || 'Host removed');
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
  }

  async function test(h: SshHost) {
    setTestingId(h.id);
    try {
      const res = await api.testSshHost(h.id);
      if (res.ok) {
        notify(`${t('remote.testOk') || 'Connected successfully'} (${h.host}:${h.port})`);
      } else {
        notify(res.error || 'Connection failed', 'err');
      }
    } catch (e) {
      notify((e as Error).message || 'Connection failed', 'err');
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Server className="h-6 w-6" /> {t('remote.title') || 'Remote Connections'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('remote.subtitle') || 'Manage your SSH servers and encrypted credentials'}
          </p>
        </div>
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

      {message && (
        <div
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            messageType === 'ok' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          }`}
        >
          {message}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-lg border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('remote.fName') || 'Name (e.g. Web Server)'}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder={t('remote.fHost') || 'Host (IP or hostname)'}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={t('remote.fUsername') || 'Username'}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              placeholder="22"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'password'}
                onChange={() => setForm({ ...form, authMethod: 'password' })}
              />{' '}
              Password
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'key'}
                onChange={() => setForm({ ...form, authMethod: 'key' })}
              />{' '}
              Private Key
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                checked={form.authMethod === 'keypassphrase'}
                onChange={() => setForm({ ...form, authMethod: 'keypassphrase' })}
              />{' '}
              Key + Passphrase
            </label>
          </div>

          {form.authMethod === 'password' ? (
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t('remote.fPassword') || 'Password'}
              className="mt-4 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          ) : (
            <div className="mt-4 space-y-2">
              <textarea
                value={form.privateKey}
                onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                placeholder={t('remote.fKey') || 'Private key (PEM)'}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              />
              {form.authMethod === 'keypassphrase' && (
                <input
                  type="password"
                  value={form.passphrase}
                  onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                  placeholder={t('remote.fPassphrase') || 'Key passphrase'}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
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

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : hosts.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Server className="mx-auto mb-2 h-8 w-8" />
          {t('remote.empty') || 'No SSH hosts yet. Add your first server.'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {hosts.map((h) => (
            <div key={h.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Server className="h-4 w-4" />
                    {h.name}
                    {h.hasCredential && <KeyRound className="h-3.5 w-3.5 text-green-500" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>
                      {h.username}@{h.host}:{h.port}
                    </span>
                    {(h.country || h.region) && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {[h.country, h.region].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
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
                  <button onClick={() => edit(h)} title="Edit" className="rounded p-1.5 hover:bg-secondary">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(h.id)}
                    disabled={busy === h.id}
                    title="Delete"
                    className="rounded p-1.5 hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
