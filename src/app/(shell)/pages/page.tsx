'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket,
  Plus,
  Loader2,
  Terminal,
  Globe,
  Copy,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FolderTree,
  Folder,
  FileArchive,
  Github,
  Gitlab,
  LayoutGrid,
} from 'lucide-react';
import { api } from '@/lib/client/api';
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
  createdAt: string;
}

interface Repo {
  name: string;
  branch: string;
  language: string | null;
}

async function copyText(u: string) {
  try {
    await navigator.clipboard.writeText(u);
  } catch {
    /* ignore */
  }
}

// The full Pages management page (/pages), reachable from the sidebar. It mirrors a
// Pages-only slice of Cloudflare's "Workers & Pages" dashboard: list your projects,
// create a new one (three-segment random name), then deploy from a workspace, a GitHub /
// GitLab repository, or an uploaded ZIP / folder — with live build logs.
export default function PagesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [view, setView] = useState<'list' | 'new'>('list');

  // Source data.
  const [workspaces, setWorkspaces] = useState<{ id: string; title: string; files: number }[]>([]);
  const [github, setGithub] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });
  const [gitlab, setGitlab] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });

  // New-project form state.
  const [projectName, setProjectName] = useState('');
  const [source, setSource] = useState<'workspace' | 'git' | 'upload'>('workspace');
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>('github');
  const [selectedWs, setSelectedWs] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [uploadKind, setUploadKind] = useState<'zip' | 'folder'>('zip');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);

  // Build config.
  const [installCommand, setInstallCommand] = useState('');
  const [buildCommand, setBuildCommand] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [envVars, setEnvVars] = useState('');

  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const logBufRef = useRef<string[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.pagesSources();
      setAvailable(s.available);
      setWorkspaces(s.workspaces);
      setGithub(s.github);
      setGitlab(s.gitlab);
      if (s.workspaces.length) setSelectedWs(s.workspaces[0].id);
      if (s.github.repos.length) {
        setSelectedRepo(s.github.repos[0].name);
        setBranch(s.github.repos[0].branch);
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await api.listDeployments();
      setDeployments(r.deployments);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  function pushLog(line: string) {
    logBufRef.current = [...logBufRef.current, line];
    setLogs(logBufRef.current);
  }
  function resetLog() {
    logBufRef.current = [];
    setLogs([]);
  }

  function startNew() {
    setProjectName(`pg-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`);
    resetLog();
    setError(null);
    setView('new');
  }

  function parseEnvJson(): string | undefined | null {
    if (!envVars.trim()) return undefined;
    try {
      return JSON.stringify(JSON.parse(envVars));
    } catch {
      return null;
    }
  }

  function baseConfig() {
    return {
      installCommand: installCommand.trim() || undefined,
      buildCommand: buildCommand.trim() || undefined,
      outputDir: outputDir.trim() || undefined,
    };
  }

  async function deploy() {
    if (deploying) return;
    if (source === 'workspace' && !selectedWs) return;
    if (source === 'git' && (!selectedRepo || !gitProvider)) return;
    if (source === 'upload' && uploadKind === 'zip' && !zipFile) return;
    if (source === 'upload' && uploadKind === 'folder' && folderFiles.length === 0) return;

    const envJson = parseEnvJson();
    if (envJson === null) {
      setError(t('pg.envInvalid'));
      return;
    }
    const cfg = { ...baseConfig(), envJson };

    setDeploying(true);
    setError(null);
    resetLog();
    try {
      let result;
      if (source === 'workspace') {
        pushLog(`$ deploy workspace=${selectedWs}`);
        result = await api.streamDeploy(selectedWs, cfg, pushLog);
      } else if (source === 'git') {
        pushLog(`$ deploy ${gitProvider}:${selectedRepo}${branch ? `@${branch}` : ''}`);
        result = await api.streamRepoDeploy(gitProvider, selectedRepo, branch || undefined, cfg, pushLog);
      } else if (uploadKind === 'zip') {
        pushLog(`$ deploy zip=${zipFile!.name}`);
        result = await api.streamDeployUpload(zipFile!, cfg, pushLog);
      } else {
        pushLog(`$ deploy folder=${folderFiles.length} file(s)`);
        // Bundle the folder files into a zip client-side and reuse the ZIP upload path.
        result = await deployFolderZip(cfg);
      }
      if (result.ok && result.recordId) {
        router.push(`/workspace/deploy/${result.recordId}`);
      } else {
        setError(result.error || t('pg.deploy'));
      }
      load();
    } catch (e) {
      setError((e as Error).message || t('pg.deploy'));
    } finally {
      setDeploying(false);
    }
  }

  // Build a zip in the browser from selected folder files, then upload it.
  async function deployFolderZip(cfg: { installCommand?: string; buildCommand?: string; outputDir?: string; envJson?: string }) {
    // Import fflate lazily on the client to keep the bundle lean.
    const { zipSync } = await import('fflate');
    const tree: Record<string, Uint8Array> = {};
    for (const f of folderFiles) {
      // `webkitRelativePath` carries the folder-relative path, e.g. "dist/index.html".
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/');
      parts.shift(); // drop the top folder
      tree[parts.join('/') || f.name] = new Uint8Array(await f.arrayBuffer());
    }
    const zipped = zipSync(tree, { level: 0 });
    const file = new File([zipped], 'folder.zip', { type: 'application/zip' });
    return api.streamDeployUpload(file, cfg, pushLog);
  }

  function handleZip(f: File) {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError(t('dp.uploadWrongType'));
      return;
    }
    setError(null);
    setZipFile(f);
  }

  async function check(id: string) {
    try {
      await api.checkDeployment(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  function switchGit(provider: 'github' | 'gitlab') {
    setGitProvider(provider);
    const pool = provider === 'github' ? github : gitlab;
    if (pool.repos.length) {
      setSelectedRepo(pool.repos[0].name);
      setBranch(pool.repos[0].branch);
    } else {
      setSelectedRepo('');
      setBranch('');
    }
  }

  // ---- Project list view ----
  if (view === 'list') {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Rocket className="h-6 w-6 text-primary" /> {t('pg.title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('pg.subtitle')}</p>
          </div>
          {available && (
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t('pg.newProject')}
            </button>
          )}
        </div>

        {!available && (
          <div className="mb-6 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('pg.notConfiguredMsg')}
          </div>
        )}

        {deployments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t('pg.emptyProjects')}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deployments.map((d) => (
              <div key={d.id} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">{d.pagesProject}</span>
                  <span
                    className={`flex items-center gap-1 text-xs ${
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

                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {d.workspaceTitle && <div>{d.workspaceTitle}</div>}
                  <div>{new Date(d.createdAt).toLocaleString()}</div>
                  {d.pagesUrl && (
                    <button onClick={() => copyText(d.pagesUrl ?? '')} className="flex items-center gap-1 text-primary hover:underline">
                      <Copy className="h-3 w-3" />
                      <span className="max-w-[14rem] truncate">{d.pagesUrl}</span>
                    </button>
                  )}
                  {d.error && <div className="text-red-500">{d.error}</div>}
                </div>

                <div className="mt-auto flex items-center gap-2 pt-3">
                  <button
                    onClick={() => router.push(`/workspace/deploy/${d.id}`)}
                    className="rounded-md border px-2.5 py-1 text-xs hover:bg-secondary"
                  >
                    {t('pg.check')}
                  </button>
                  <button
                    onClick={() => d.pagesUrl && window.open(d.pagesUrl, '_blank')}
                    disabled={!d.pagesUrl}
                    className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-40"
                  >
                    <Globe className="h-3 w-3" /> {t('pg.open')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- New project view ----
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <button onClick={() => setView('list')} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('pg.backProjects')}
      </button>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <Plus className="h-6 w-6 text-primary" /> {t('pg.newProject')}
      </h1>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: config */}
        <div className="space-y-6 lg:col-span-3">
          {/* Step 1: project name */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
              {t('pg.step1')}
            </div>
            <label className="mt-2 mb-1 block text-xs text-muted-foreground">{t('pg.projectName')}</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              readOnly
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>

          {/* Step 2: source */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              {t('pg.step2')}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSource('workspace')}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
                  source === 'workspace' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                }`}
              >
                <LayoutGrid className="h-4 w-4" /> {t('pg.sourceWorkspace')}
              </button>
              <button
                onClick={() => setSource('git')}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
                  source === 'git' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                }`}
              >
                <FolderTree className="h-4 w-4" /> {t('pg.sourceGit')}
              </button>
              <button
                onClick={() => setSource('upload')}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
                  source === 'upload' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                }`}
              >
                <FileArchive className="h-4 w-4" /> {t('pg.sourceUpload')}
              </button>
            </div>

            {/* Workspace source */}
            {source === 'workspace' && (
              <div className="mt-4">
                <label className="mb-1 block text-xs text-muted-foreground">{t('pg.workspace')}</label>
                <select value={selectedWs} onChange={(e) => setSelectedWs(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} · {w.files} {t('pg.files')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Git source */}
            {source === 'git' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('pg.repoProvider')}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => switchGit('github')}
                      disabled={!github.enabled}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        gitProvider === 'github' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                      } disabled:opacity-40`}
                    >
                      <Github className="h-4 w-4" /> {t('pg.github')}
                      {!github.enabled && <span className="text-xs">({t('pg.notConfigured')})</span>}
                    </button>
                    <button
                      onClick={() => switchGit('gitlab')}
                      disabled={!gitlab.enabled}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        gitProvider === 'gitlab' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                      } disabled:opacity-40`}
                    >
                      <Gitlab className="h-4 w-4" /> {t('pg.gitlab')}
                      {!gitlab.enabled && <span className="text-xs">({t('pg.notConfigured')})</span>}
                    </button>
                  </div>
                </div>
                {gitProvider === 'github' && !github.connected && (
                  <p className="text-xs text-muted-foreground">
                    {t('pg.notConnected')}
                    <Link href="/connections" className="text-primary hover:underline">
                      {t('pg.connectNow')}
                    </Link>
                  </p>
                )}
                {gitProvider === 'gitlab' && !gitlab.connected && (
                  <p className="text-xs text-muted-foreground">
                    {t('pg.notConnected')}
                    <Link href="/connections" className="text-primary hover:underline">
                      {t('pg.connectNow')}
                    </Link>
                  </p>
                )}
                {(gitProvider === 'github' ? github : gitlab).repos.length > 0 && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">{t('pg.repo')}</label>
                      <select
                        value={selectedRepo}
                        onChange={(e) => {
                          setSelectedRepo(e.target.value);
                          const pool = gitProvider === 'github' ? github : gitlab;
                          const r = pool.repos.find((x) => x.name === e.target.value);
                          if (r) setBranch(r.branch);
                        }}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        {(gitProvider === 'github' ? github : gitlab).repos.map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">{t('pg.branch')}</label>
                      <input
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Upload source */}
            {source === 'upload' && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setUploadKind('zip')}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                      uploadKind === 'zip' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    {t('pg.uploadZip')}
                  </button>
                  <button
                    onClick={() => setUploadKind('folder')}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                      uploadKind === 'folder' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    {t('pg.uploadFolder')}
                  </button>
                </div>

                {uploadKind === 'zip' ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleZip(f);
                    }}
                    className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    {zipFile ? (
                      <>
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        <span className="font-medium text-foreground">{zipFile.name}</span>
                        <button onClick={() => setZipFile(null)} className="text-xs text-primary hover:underline">
                          {t('dp.uploadLabel')}…
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept=".zip,application/zip"
                          id="pg-zip"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleZip(f);
                          }}
                        />
                        <label htmlFor="pg-zip" className="cursor-pointer text-primary hover:underline">
                          {t('pg.dropZip')}
                        </label>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => setFolderFiles(Array.from(e.target.files || []))}
                      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                    />
                    <button onClick={() => folderInputRef.current?.click()} className="flex items-center gap-1.5 text-primary hover:underline">
                      <Folder className="h-4 w-4" /> {t('pg.chooseFolder')}
                    </button>
                    {folderFiles.length > 0 && (
                      <span className="font-medium text-foreground">
                        {folderFiles.length} {t('pg.files')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: build config */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
              {t('pg.step3')}
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('pg.installCmd')}</label>
                <input
                  value={installCommand}
                  onChange={(e) => setInstallCommand(e.target.value)}
                  placeholder="npm install"
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('pg.buildCmd')}</label>
                <input
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="npm run build"
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('pg.outputDir')}</label>
                <input
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="dist"
                  className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('pg.envVars')}</label>
                <textarea
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  placeholder={'{"API_URL":"https://api.example.com"}'}
                  rows={3}
                  className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <button
            onClick={deploy}
            disabled={
              deploying ||
              (source === 'workspace' && !selectedWs) ||
              (source === 'git' && (!selectedRepo || (gitProvider === 'github' ? !github.connected : !gitlab.connected))) ||
              (source === 'upload' && uploadKind === 'zip' && !zipFile) ||
              (source === 'upload' && uploadKind === 'folder' && folderFiles.length === 0)
            }
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {deploying ? t('pg.deploying') : t('pg.deploy')}
          </button>

          {error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}

          {/* Live log */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Terminal className="h-4 w-4 text-primary" /> {t('pg.buildLog')}
            </h3>
            <div className="max-h-80 min-h-[8rem] overflow-y-auto rounded-md bg-black p-3 font-mono text-xs text-green-400">
              {logs.length === 0 ? (
                <span className="text-muted-foreground">{t('pg.buildLogEmpty')}</span>
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

        {/* Right: deployment history for this project */}
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">{t('pg.deployments')}</h3>
          {deployments.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t('pg.noHistory')}</p>
          ) : (
            <div className="space-y-3">
              {deployments.slice(0, 10).map((d) => (
                <div key={d.id} className="rounded-lg border bg-card p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">{d.pagesProject}</span>
                    <span
                      className={`flex items-center gap-1 ${
                        d.status === 'deployed' ? 'text-green-600' : d.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'
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
                  <div className="mt-1 text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</div>
                  {d.pagesUrl && (
                    <button onClick={() => copyText(d.pagesUrl ?? '')} className="mt-1 flex items-center gap-1 text-primary hover:underline">
                      <Copy className="h-3 w-3" />
                      <span className="max-w-[12rem] truncate">{d.pagesUrl}</span>
                    </button>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => check(d.id)} className="rounded border px-2 py-1 hover:bg-secondary">
                      {t('pg.check')}
                    </button>
                    <button onClick={() => router.push(`/workspace/deploy/${d.id}`)} className="rounded border px-2 py-1 hover:bg-secondary">
                      {t('pg.open')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
