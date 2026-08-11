'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket,
  Loader2,
  Terminal,
  Globe,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FolderTree,
} from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface DeploymentRow {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  pagesProject: string;
  status: string;
  pagesUrl: string | null;
  shortUrl: string | null;
  customDomain: string | null;
  error: string | null;
  log: string | null;
  createdAt: string;
}

// The standalone deploy page (/workspace/deploy). This page is intentionally English-only
// (the deploy feature works best with ASCII command/config input). It lets the user pick a
// workspace, configure the build (install/build commands, output dir, extra env vars), then
// deploys to Cloudflare Pages while streaming real-time logs into the terminal console.
export default function DeployPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [available, setAvailable] = useState(true);

  // Build configuration.
  const [installCommand, setInstallCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [envVars, setEnvVars] = useState('');

  const logEndRef = useRef<HTMLDivElement>(null);
  const logBufRef = useRef<string[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api
      .deployAvailable()
      .then((r) => {
        setAvailable(r.available);
        if (!r.available) router.replace('/workspaces');
      })
      .catch(() => {});
    api
      .listWorkspaces()
      .then((r) => {
        setWorkspaces(r.workspaces);
        if (r.workspaces.length) setSelected(r.workspaces[0].id);
      })
      .catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Auto-scroll the log console to the newest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  async function refresh() {
    try {
      const r = await api.listDeployments();
      setDeployments(r.deployments);
    } catch {
      /* ignore */
    }
  }

  function pushLog(line: string) {
    logBufRef.current = [...logBufRef.current, line];
    setLogs(logBufRef.current);
  }

  function resetLog() {
    logBufRef.current = [];
    setLogs([]);
  }

  async function deploy() {
    if (!selected || deploying) return;
    setDeploying(true);
    setError(null);
    resetLog();
    pushLog(`$ deploy workspace=${selected}`);
    try {
      const envJson = envVars.trim()
        ? (() => {
            try {
              return JSON.stringify(JSON.parse(envVars));
            } catch {
              setError(t('dp.envInvalid'));
              setDeploying(false);
              return null;
            }
          })()
        : undefined;
      if (envJson === null) return;

      const result = await api.streamDeploy(
        selected,
        {
          installCommand: installCommand.trim() || undefined,
          buildCommand: buildCommand.trim() || undefined,
          outputDir: outputDir.trim() || undefined,
          envJson,
        },
        pushLog,
      );
      if (result.ok) {
        pushLog(`[done] deployed → ${result.pagesUrl ?? ''}${result.shortUrl ? ` · short link ${result.shortUrl}` : ''}`);
      } else {
        setError(result.error || 'Deploy failed');
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Deploy failed');
    } finally {
      setDeploying(false);
    }
  }

  async function copyUrl(u: string) {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(u);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* ignore */
    }
  }

  async function check(id: string) {
    try {
      await api.checkDeployment(id);
      await refresh();
    } catch {
      /* ignore */
    }
  }

  function openDeployment(id: string) {
    const d = deployments.find((x) => x.id === id);
    if (d?.pagesUrl) window.open(d.pagesUrl, '_blank');
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/workspaces" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> {t('dp.back')}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Rocket className="h-6 w-6 text-primary" /> {t('deploy.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('dp.subtitle')}
          </p>
        </div>
      </div>

      {!available && (
        <div className="mb-6 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('dp.notConfigured')}
        </div>
      )}

      {available && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column: configuration */}
          <div className="space-y-6 lg:col-span-3">
            {/* Workspace */}
            <div className="rounded-lg border bg-card p-4">
              <label className="mb-1 block text-sm font-medium">{t('dp.workspace')}</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} · {w._count.files} {t('dp.workspaceFiles')}
                  </option>
                ))}
              </select>
              {workspaces.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('dp.noWorkspaces')}
                  <Link href="/workspaces" className="text-primary hover:underline">
                    {t('dp.createFirst')}
                  </Link>
                  .
                </p>
              )}
            </div>

            {/* Build configuration */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FolderTree className="h-4 w-4 text-primary" /> {t('dp.buildConfig')}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('dp.installCmd')}</label>
                  <input
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="npm install"
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('dp.buildCmd')}</label>
                  <input
                    value={buildCommand}
                    onChange={(e) => setBuildCommand(e.target.value)}
                    placeholder="npm run build"
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('dp.outputDir')}</label>
                  <input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="dist"
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {t('dp.envVars')} <code className="rounded bg-secondary px-1">$KEY</code>
                  </label>
                  <textarea
                    value={envVars}
                    onChange={(e) => setEnvVars(e.target.value)}
                    placeholder={'{"API_URL":"https://api.example.com"}'}
                    rows={3}
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={deploy}
              disabled={!selected || deploying || workspaces.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {deploying ? t('dp.deploying') : t('dp.deployBtn')}
            </button>

            {error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}

            {/* Live build log */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Terminal className="h-4 w-4 text-primary" /> {t('dp.buildLog')}
              </h3>
              <div className="max-h-80 min-h-[8rem] overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
                {logs.length === 0 ? (
                  <span className="text-muted-foreground">{t('dp.buildLogEmpty')}</span>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>

          {/* Right column: deployment history */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('dp.history')}</h3>
              <button onClick={refresh} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {deployments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t('dp.noHistory')}
              </p>
            ) : (
              <div className="space-y-3">
                {deployments.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{d.workspaceTitle}</span>
                      <span
                        className={`flex items-center gap-1 ${
                          d.status === 'deployed'
                            ? 'text-green-600'
                            : d.status === 'failed'
                              ? 'text-red-600'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {d.status === 'deployed' ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : d.status === 'failed' ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {d.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {d.pagesUrl && (
                        <button
                          onClick={() => copyUrl(d.pagesUrl ?? '')}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {copied === d.pagesUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          <span className="max-w-[12rem] truncate">{d.pagesUrl}</span>
                        </button>
                      )}
                      {d.shortUrl && (
                        <button
                          onClick={() => copyUrl(d.shortUrl ?? '')}
                          className="flex items-center gap-1 text-muted-foreground hover:underline"
                        >
                          {copied === d.shortUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          <span className="max-w-[12rem] truncate">{d.shortUrl}</span>
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">{d.pagesProject}</span>
                      <span>{new Date(d.createdAt).toLocaleString()}</span>
                    </div>

                    {d.error && <div className="mt-2 text-red-500">{d.error}</div>}

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => check(d.id)}
                        className="rounded border px-2 py-1 hover:bg-secondary"
                      >
                        {t('dp.check')}
                      </button>
                      <button
                        onClick={() => openDeployment(d.id)}
                        disabled={!d.pagesUrl}
                        className="flex items-center gap-1 rounded border px-2 py-1 hover:bg-secondary disabled:opacity-40"
                      >
                        <Globe className="h-3 w-3" /> {t('dp.open')}
                      </button>
                      {d.log && (
                        <button
                          onClick={() => setLogs(d.log?.split('\n') ?? [])}
                          className="rounded border px-2 py-1 hover:bg-secondary"
                          title={t('dp.loadLog')}
                        >
                          {t('dp.log')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
