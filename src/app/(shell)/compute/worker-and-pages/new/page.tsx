'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Code2,
  LayoutTemplate,
  Loader2,
  Rocket,
  FileCode2,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';
import WorkerCodeEditor from '@/components/compute/WorkerCodeEditor';

// The official Cloudflare "Hello World" Worker (commented, ES Module form).
const HELLO_WORLD_CODE = `// Cloudflare Workers Hello World
//
// A Worker runs JavaScript at the edge, on Cloudflare's global network.
// This is the simplest possible Worker: it responds to every request
// with a friendly greeting.

export default {
  async fetch(request, env, ctx) {
    // 'request' is the incoming HTTP request.
    // 'env' holds your bindings (KV, D1, Secrets, ...).
    // 'ctx' provides execution context (waitUntil, passThroughOnException).

    console.info('Hello World! Received request:', request.url);

    return new Response('Hello World!', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
`;

// The standalone "New project" page (reached from the merged Worker 和 Pages list's
// "New project" button). Opens directly into the create form: card-style Worker/Pages
// picker (default Worker), auto-generated + editable name, Hello World code, deploy.
export default function NewWorkerPagesPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [kind, setKind] = useState<'worker' | 'pages'>('worker');
  const [workerName, setWorkerName] = useState('');
  const [code, setCode] = useState(HELLO_WORLD_CODE);
  const [deploying, setDeploying] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [deployMsg, setDeployMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  async function runDeploy() {
    if (deploying) return;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setDeployMsg({ text: t('wk.codeRequired') || 'Worker code is required', type: 'err' });
      return;
    }
    setDeploying(true);
    setLog((l) => [...l, '$ deploy worker…']);
    setDeployMsg(null);
    try {
      const r = await api.deployWorker({
        workerName: workerName.trim() || undefined,
        code: trimmedCode,
      });
      if (r.error) {
        setLog((l) => [...l, `[worker] failed: ${r.error}`]);
        setDeployMsg({ text: r.error, type: 'err' });
      } else {
        setLog((l) => [...l, `[worker] deployed ${r.workerName}`]);
        setDeployMsg({ text: t('wk.create.deployed') || 'Deployed — opening details…', type: 'ok' });
        if (r.deploymentId) {
          setTimeout(() => {
            router.push(`/compute/worker/${r.deploymentId}/detail`);
          }, 600);
        } else {
          router.push('/compute/worker-and-pages');
        }
      }
    } catch (e) {
      setLog((l) => [...l, `[worker] failed: ${(e as Error).message}`]);
      setDeployMsg({ text: (e as Error).message, type: 'err' });
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Back to the merged list */}
      <button
        onClick={() => router.push('/compute/worker-and-pages')}
        className="mb-4 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('wk.ide.back') || 'Back'}
      </button>

      <h1 className="mb-4 text-xl font-bold">{t('wk.create.title') || 'Create a new project'}</h1>

      <div className="space-y-4 rounded-lg border bg-card p-5">
        {/* Card-style Worker / Pages picker (default Worker) */}
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">{t('wk.create.subtitle') || 'Choose what to deploy'}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setKind('worker')}
              className={clsx(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                kind === 'worker' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-secondary/50',
              )}
            >
              <Code2 className={clsx('mt-0.5 h-5 w-5 shrink-0', kind === 'worker' ? 'text-primary' : 'text-muted-foreground')} />
              <span>
                <span className="block text-sm font-semibold">{t('wk.create.worker') || 'Worker'}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('wk.create.workerDesc') || 'Run JavaScript at the edge.'}</span>
              </span>
            </button>
            <button
              onClick={() => setKind('pages')}
              className={clsx(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                kind === 'pages' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-secondary/50',
              )}
            >
              <LayoutTemplate className={clsx('mt-0.5 h-5 w-5 shrink-0', kind === 'pages' ? 'text-primary' : 'text-muted-foreground')} />
              <span>
                <span className="block text-sm font-semibold">{t('wk.create.pages') || 'Pages'}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('wk.create.pagesDesc') || 'Deploy static sites or full-stack apps.'}</span>
              </span>
            </button>
          </div>
        </div>

        {kind === 'worker' ? (
          <>
            {/* Name: auto-generated + editable */}
            <label className="block text-xs text-muted-foreground">
              {t('wk.create.name') || 'Project name'}
              <input
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder={t('wk.create.namePlaceholder') || 'auto-generated'}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="mt-1 block text-[10px] text-muted-foreground/70">{t('wk.create.nameHint') || 'Leave empty to auto-generate.'}</span>
            </label>
            <label className="block text-xs text-muted-foreground">
              {t('wk.create.code') || 'Worker code (JS)'}
              <WorkerCodeEditor value={code} onChange={setCode} />
            </label>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <FileCode2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
            {t('wk.create.pagesDesc') || 'Deploy static sites or full-stack apps.'}
            <div className="mt-3">
              <button
                onClick={() => router.push('/pages/new')}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {t('pg.newProject') || 'New project'}
              </button>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
            {log.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))}
          </div>
        )}
        {deployMsg && (
          <div className={`text-xs ${deployMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{deployMsg.text}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => router.push('/compute/worker-and-pages')}
            disabled={deploying}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {t('dd.cancel')}
          </button>
          {kind === 'worker' && (
            <button
              onClick={runDeploy}
              disabled={deploying}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {deploying ? t('wk.create.deploying') || 'Deploying…' : t('wk.create.deploy') || 'Deploy'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}