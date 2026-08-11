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
  const [source, setSource] = useState<'workspace' | 'upload'>('workspace');
  const [zipFile, setZipFile] = useState<File | null>(null);

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
        const q = new URL(window.location.href).searchParams.get('workspace');
        const wanted = q && r.workspaces.some((w) => w.id === q) ? q : r.workspaces[0]?.id;
        if (wanted) {
          setSelected(wanted);
          setSource('workspace');
        }
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

  // Parse the env-var textarea into a JSON string; returns null if it's invalid JSON.
  function parseEnvJson(): string | undefined | null {
    if (!envVars.trim()) return undefined;
    try {
      return JSON.stringify(JSON.parse(envVars));
    } catch {
      return null;
    }
  }

  function handleZip(f: File) {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError(t('dp.uploadWrongType'));
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError(t('dp.uploadTooBig'));
      return;
    }
    setError(null);
    setZipFile(f);
  }

  // On success, auto-navigate to the deployment detail page /workspace/deploy/[recordId].
  function finish(result: { ok: boolean; recordId?: string; pagesUrl?: string; shortUrl?: string | null; error?: string }) {
    if (result.ok && result.recordId) {
      router.push(`/workspace/deploy/${result.recordId}`);
    } else {
      setError(result.error || t('deploy.failed'));
    }
  }

  async function deploy() {
    if (deploying) return;
    if (source === 'workspace' && !selected) return;
    if (source === 'upload' && !zipFile) return;

    setDeploying(true);
    setError(null);
    resetLog();

    // Validate the env-var JSON once, up front, for both sources.
    const envJson = parseEnvJson();
    if (envJson === null) {
      setError(t('dp.envInvalid'));
      setDeploying(false);
      return;
    }
    const baseConfig = {
      installCommand: installCommand.trim() || undefined,
      buildCommand: buildCommand.trim() || undefined,
      outputDir: outputDir.trim() || undefined,
      envJson,
    };

    try {
      if (source === 'workspace') {
        pushLog(`$ deploy workspace=${selected}`);
        const result = await api.streamDeploy(selected, baseConfig, pushLog);
        finish(result);
      } else {
        pushLog(`$ deploy zip=${zipFile!.name}`);
        const result = await api.streamDeployUpload(zipFile!, baseConfig, pushLog);
        finish(result);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message || t('deploy.failed'));
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
            {/* Source toggle */}
            <div className="rounded-lg border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">{t('dp.source')}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSource('workspace')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    source === 'workspace' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                  }`}
                >
                  {t('dp.sourceWorkspace')}
                </button>
                <button
                  onClick={() => setSource('upload')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    source === 'upload' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                  }`}
                >
                  {t('dp.sourceUpload')}
                </button>
              </div>
            </div>

            {/* Workspace source */}
            {source === 'workspace' && (
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
            )}

            {/* ZIP upload source */}
            {source === 'upload' && (
              <div className="rounded-lg border bg-card p-4">
                <label className="mb-1 block text-sm font-medium">{t('dp.uploadLabel')}</label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleZip(f);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {zipFile ? (
                    <>
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <span className="font-medium text-foreground">{zipFile.name}</span>
                      <span className="text-xs">{(zipFile.size / 1024).toFixed(1)} KB</span>
                      <button onClick={() => setZipFile(null)} className="text-xs text-primary hover:underline">
                        {t('dp.uploadLabel')}…
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleZip(f);
                        }}
                        className="hidden"
                        id="zip-input"
                      />
                      <label htmlFor="zip-input" className="cursor-pointer text-primary hover:underline">
                        {t('dp.dropHint')}
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}

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
              disabled={deploying || (source === 'workspace' && (!selected || workspaces.length === 0)) || (source === 'upload' && !zipFile)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {deploying
                ? t('dp.deploying')
                : source === 'upload'
                  ? t('dp.uploadDeployBtn')
                  : t('dp.deployBtn')}
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
