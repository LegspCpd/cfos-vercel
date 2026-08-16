'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Clock, Play, Pause, CalendarClock } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface Task {
  id: string;
  name: string;
  schedule: string;
  action: string;
  prompt: string | null;
  url: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

// Scheduled tasks panel: create/delete cron tasks that run the agent or fire a webhook.
// Owner or write collaborators only (the parent page gates rendering).
export default function ScheduledTasksPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', schedule: '0 9 * * *', action: 'agent', prompt: '', url: '' });

  async function load() {
    try {
      const res = await api.listTasks(workspaceId);
      setTasks(res.tasks);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function create() {
    setError('');
    if (!form.name.trim() || !form.schedule.trim()) return;
    try {
      await api.createTask(workspaceId, {
        name: form.name.trim(),
        schedule: form.schedule.trim(),
        action: form.action as 'agent' | 'webhook',
        prompt: form.action === 'agent' ? form.prompt : undefined,
        url: form.action === 'webhook' ? form.url : undefined,
      });
      setForm({ name: '', schedule: '0 9 * * *', action: 'agent', prompt: '', url: '' });
      setCreating(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggle(task: Task) {
    try {
      await api.updateTask(workspaceId, task.id, { enabled: !task.enabled });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(task: Task) {
    if (!confirm(t('task.delete') + '？')) return;
    try {
      await api.deleteTask(workspaceId, task.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> {t('task.title')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('task.desc')}</p>

      {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : tasks.length === 0 && !creating ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('task.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 rounded-md border p-3">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {task.name}
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {task.schedule}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {task.action === 'agent' ? t('task.actionAgent') : t('task.actionWebhook')}
                  </span>
                  {task.lastStatus === 'ok' && (
                    <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-600">{t('task.statusOk')}</span>
                  )}
                  {task.lastStatus === 'failed' && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-600" title={task.lastError ?? ''}>
                      {t('task.statusFailed')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t('task.lastRun')}：{task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : t('task.never')}
                  {task.action === 'agent' && task.prompt && ` · ${task.prompt.slice(0, 60)}`}
                  {task.action === 'webhook' && task.url && ` · ${task.url}`}
                </p>
              </div>
              <button
                onClick={() => toggle(task)}
                className="rounded-md border p-1.5 text-muted-foreground hover:bg-secondary"
                title={task.enabled ? t('task.disabled') : t('task.enabled')}
              >
                {task.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => remove(task)}
                className="rounded-md border p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                title={t('task.delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="mt-4 space-y-3 rounded-md border p-4">
          <input className={inputCls} placeholder={t('task.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <input className={inputCls} placeholder={t('task.schedulePlaceholder')} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
              <p className="mt-1 text-[11px] text-muted-foreground">{t('task.scheduleHint')}</p>
            </div>
            <select className={inputCls} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="agent">{t('task.actionAgent')}</option>
              <option value="webhook">{t('task.actionWebhook')}</option>
            </select>
          </div>
          {form.action === 'agent' ? (
            <textarea
              className={inputCls}
              rows={3}
              placeholder={t('task.promptPlaceholder')}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          ) : (
            <input className={inputCls} placeholder={t('task.urlPlaceholder')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="rounded-md border px-3 py-2 text-sm">{t('cancel')}</button>
            <button onClick={create} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              {t('save')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-4 flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          <Plus className="h-4 w-4" /> {t('task.add')}
        </button>
      )}
    </section>
  );
}