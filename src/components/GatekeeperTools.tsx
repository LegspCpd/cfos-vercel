'use client';

import { useEffect, useState } from 'react';
import { GitBranch, ShieldCheck, ShieldOff, Plus, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

// Gatekeeper tools panel for the agent chat. Lets the user run write operations on
// connected external services from inside the session, but ONLY after an explicit
// "approve" step — the operation is staged, shown, and then executed on approval.
// The per-connection writeAccess (readonly/readwrite) is a second gate: a read-only
// connection refuses even an approved write.

interface ConnState {
  connected: boolean;
  label: string | null;
  writeAccess: 'readonly' | 'readwrite';
}

interface PendingOp {
  provider: 'github' | 'gitlab';
  tool: 'create_issue';
  summary: string; // what will happen
  params: Record<string, unknown>;
}

export default function GatekeeperTools({
  onResult,
}: {
  onResult: (provider: string, text: string) => void;
}) {
  const { t } = useI18n();
  const [gh, setGh] = useState<ConnState>({ connected: false, label: null, writeAccess: 'readonly' });
  const [gl, setGl] = useState<ConnState>({ connected: false, label: null, writeAccess: 'readonly' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ provider: 'github' as 'github' | 'gitlab', repo: '', title: '', body: '' });
  const [pending, setPending] = useState<PendingOp | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [g, l] = await Promise.all([api.githubStatus(), api.gitlabStatus()]);
        setGh({
          connected: g.connected,
          label: g.githubLogin,
          writeAccess: g.writeAccess === 'readwrite' ? 'readwrite' : 'readonly',
        });
        setGl({
          connected: l.connected,
          label: l.gitlabUsername,
          writeAccess: l.writeAccess === 'readwrite' ? 'readwrite' : 'readonly',
        });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const conn = form.provider === 'github' ? gh : gl;

  // Stage a write operation for approval (do not execute yet).
  function stageIssue() {
    const repo = form.repo.trim();
    const title = form.title.trim();
    if (!repo || !title) return;
    if (!conn.connected) return;
    if (conn.writeAccess !== 'readwrite') {
      onResult(form.provider, `${t('gatekeeper.readonlyDenied')} (${form.provider})`);
      return;
    }
    setPending({
      provider: form.provider,
      tool: 'create_issue',
      summary: `${form.provider} → ${t('gatekeeper.createIssue')} "${title}" in ${repo}`,
      params: { repo, title, body: form.body.trim() },
    });
  }

  // Approve and actually execute the staged write operation.
  async function approve() {
    if (!pending) return;
    setBusy(true);
    try {
      const args =
        pending.provider === 'github'
          ? { tool: 'create_issue', ...pending.params }
          : { tool: 'create_issue', ...pending.params };
      const res =
        pending.provider === 'github'
          ? await api.githubTool(args)
          : await api.gitlabTool(args);
      onResult(pending.provider, res.error || res.result || '(empty result)');
    } catch (e) {
      onResult(pending.provider, (e as Error).message || 'Tool failed');
    } finally {
      setBusy(false);
      setPending(null);
      setForm((f) => ({ ...f, title: '', body: '' }));
    }
  }

  return (
    <div className="border-t border-secondary/60 px-3 py-2">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <GitBranch className="h-3.5 w-3.5" />
        <span className="font-medium">{t('gatekeeper.title')}</span>
        <span className="ml-auto flex items-center gap-1">
          {gh.connected && <ShieldCheck className={`h-3.5 w-3.5 ${gh.writeAccess === 'readwrite' ? 'text-amber-500' : 'text-green-600'}`} />}
          {gl.connected && <ShieldCheck className={`h-3.5 w-3.5 ${gl.writeAccess === 'readwrite' ? 'text-amber-500' : 'text-green-600'}`} />}
          {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border bg-secondary/30 p-2">
          {/* Provider selector */}
          <div className="flex items-center gap-2">
            {(['github', 'gitlab'] as const).map((p) => {
              const c = p === 'github' ? gh : gl;
              const active = form.provider === p;
              return (
                <button
                  key={p}
                  onClick={() => setForm((f) => ({ ...f, provider: p }))}
                  disabled={!c.connected}
                  className={`rounded px-2 py-1 text-xs ${active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'} disabled:opacity-40`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {!conn.connected ? (
            <p className="text-xs text-muted-foreground">
              {t('gatekeeper.notConnected')} ({form.provider})
            </p>
          ) : conn.writeAccess !== 'readwrite' ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldOff className="h-3.5 w-3.5" />
              <span>{t('gatekeeper.readonlyHint')}</span>
            </div>
          ) : (
            <>
              {/* Form */}
              <div className="space-y-1.5">
                <input
                  value={form.repo}
                  onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))}
                  placeholder={form.provider === 'github' ? 'owner/repo' : 'group/project'}
                  className="w-full rounded border bg-card px-2 py-1 text-xs"
                />
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t('gatekeeper.issueTitle')}
                  className="w-full rounded border bg-card px-2 py-1 text-xs"
                />
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={t('gatekeeper.issueBody')}
                  rows={2}
                  className="w-full resize-y rounded border bg-card px-2 py-1 text-xs"
                />
                <button
                  onClick={stageIssue}
                  disabled={!form.repo.trim() || !form.title.trim()}
                  className="w-full rounded bg-secondary px-2 py-1 text-xs hover:bg-secondary/70 disabled:opacity-40"
                >
                  {t('gatekeeper.requestExec')}
                </button>
              </div>
            </>
          )}

          {/* Approval card — the actual side-effect gate */}
          {pending && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('gatekeeper.approveTitle')}
              </div>
              <p className="mt-1 text-xs">{pending.summary}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={approve}
                  disabled={busy}
                  className="flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {t('gatekeeper.approve')}
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                >
                  {t('gatekeeper.reject')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
