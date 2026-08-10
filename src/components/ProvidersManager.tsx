'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Power } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  apiKeyMasked: string;
}

const emptyForm = { name: '', baseUrl: '', apiKey: '', model: '' };

export default function ProvidersManager() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.listProviders();
      setProviders(res.providers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.baseUrl || !form.apiKey || !form.model) {
      setError(t('ad.allRequired'));
      return;
    }
    setError('');
    setAdding(true);
    try {
      await api.addProvider(form);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(id: string, isEnabled: boolean) {
    setSavingId(id);
    try {
      await api.updateProvider(id, { isEnabled: !isEnabled });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    setSavingId(id);
    try {
      await api.deleteProvider(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="mb-1 text-base font-semibold">{t('ad.aiProviders')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('ad.aiDesc')}
      </p>

      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Add form */}
      <form onSubmit={addProvider} className="mb-6 grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Name (e.g. DeepSeek)"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="Base URL (e.g. https://api.deepseek.com/v1)"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder="Model (e.g. deepseek-chat)"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder="API Key (sk-...)"
          type="password"
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
        >
          <Plus className="h-4 w-4" /> {adding ? t('ad.adding') : t('ad.addProvider')}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('ad.noProviders')}</p>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isEnabled ? (
                    <span className="rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-400">{t('ad.active')}</span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('ad.off')}</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {p.model} · {p.baseUrl} · key {p.apiKeyMasked}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => toggle(p.id, p.isEnabled)}
                  disabled={savingId === p.id}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Power className="h-3.5 w-3.5" />
                  {p.isEnabled ? '禁用' : '启用'}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={savingId === p.id}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
