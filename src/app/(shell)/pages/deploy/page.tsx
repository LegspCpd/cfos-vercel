'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket,
  Loader2,
  Terminal,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FolderTree,
  Folder,
  FileArchive,
  Github,
  Gitlab,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';

interface Repo {
  name: string;
  branch: string;
  language: string | null;
}

type Source = 'workspace' | 'github' | 'gitlab' | 'upload';

// The deploy screen (/pages/deploy?source=<id>). Reads the chosen source from the URL
// (picked on /pages/new) and shows exactly what that source needs:
//   - workspace: pick a workspace, commands optional
//   - github / gitlab: pick a repo + branch, commands optional
//   - upload: just pick a ZIP or folder — commands are NOT needed (and hidden)
// Deploys with real-time logs, then jumps to /pages/[id] on success.
export default function DeployPage() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const source = (params.get('source') as Source) || 'workspace';

  const [workspaces, setWorkspaces] = useState<{ id: string; title: string; files: number }[]>([]);
  const [github, setGithub] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });
  const [gitlab, setGitlab] = useState<{ enabled: boolean; connected: boolean; repos: Repo[] }>({ enabled: false, connected: false, repos: [] });

  const [selectedWs, setSelectedWs] = useState('');
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>(source === 'gitlab' ? 'gitlab' : 'github');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [uploadKind, setUploadKind] = useState<'zip' | 'folder'>('zip');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);

  // Commands are optional for workspace/git; hidden entirely for upload.
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
      setWorkspaces(s.workspaces);
      setGithub(s.github);
      setGitlab(s.gitlab);
      // Preselect a workspace if one was passed (e.g. from the "redeploy" action on the
      // detail page), otherwise default to the first workspace.
      const wsParam = params.get('workspace');
      const wantedWs = wsParam && s.workspaces.some((w) => w.id === wsParam) ? wsParam : s.workspaces[0]?.id;
      if (wantedWs) setSelectedWs(wantedWs);
      const pool = source === 'gitlab' ? s.gitlab : s.github;
      if (pool.repos.length) {
        setSelectedRepo(pool.repos[0].name);
        setBranch(pool.repos[0].branch);
      }
    } catch {
      /* ignore */
    }
  }, [source, params]);

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
    setError(null);
    setZipFile(f);
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

  async function deployFolderZip(cfg: { installCommand?: string; buildCommand?: string; outputDir?: string; envJson?: string }) {
    const { zipSync } = await import('fflate');
    const tree: Record<string, Uint8Array> = {};
    for (const f of folderFiles) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/');
      parts.shift();
      tree[parts.join('/') || f.name] = new Uint8Array(await f.arrayBuffer());
    }
    const zipped = zipSync(tree, { level: 0 });
    const file = new File([zipped], 'folder.zip', { type: 'application/zip' });
    return api.streamDeployUpload(file, cfg, pushLog);
  }

  async function deploy() {
    if (deploying) return;
    if (source === 'workspace' && !selectedWs) return;
    if ((source === 'github' || source === 'gitlab') && (!selectedRepo || !(source === 'github' ? github.connected : gitlab.connected))) return;
    if (source === 'upload' && uploadKind === 'zip' && !zipFile) return;
    if (source === 'upload' && uploadKind === 'folder' && folderFiles.length === 0) return;

    const envJson = parseEnvJson();
    if (envJson === null) {
      setError(t('pg.envInvalid'));
      return;
    }
    const cfg = {
      installCommand: installCommand.trim() || undefined,
      buildCommand: buildCommand.trim() || undefined,
      outputDir: outputDir.trim() || undefined,
      envJson,
    };

    setDeploying(true);
    setError(null);
    resetLog();
    try {
      let result;
      if (source === 'workspace') {
        pushLog(`$ deploy workspace=${selectedWs}`);
        result = await api.streamDeploy(selectedWs, cfg, pushLog);
      } else if (source === 'github' || source === 'gitlab') {
        pushLog(`$ deploy ${source}:${selectedRepo}${branch ? `@${branch}` : ''}`);
        result = await api.streamRepoDeploy(source, selectedRepo, branch || undefined, cfg, pushLog);
      } else if (uploadKind === 'zip') {
        pushLog(`$ deploy zip=${zipFile!.name}`);
        result = await api.streamDeployUpload(zipFile!, cfg, pushLog);
      } else {
        pushLog(`$ deploy folder=${folderFiles.length} file(s)`);
        result = await deployFolderZip(cfg);
      }
      if (result.ok && result.recordId) {
        router.push(`/pages/${result.recordId}`);
      } else {
        setError(result.error || t('pg.deploy'));
      }
    } catch (e) {
      setError((e as Error).message || t('pg.deploy'));
    } finally {
      setDeploying(false);
    }
  }

  const canDeploy =
    (source === 'workspace' && !!selectedWs) ||
    ((source === 'github' || source === 'gitlab') && !!selectedRepo && (source === 'github' ? github.connected : gitlab.connected)) ||
    (source === 'upload' && uploadKind === 'zip' && !!zipFile) ||
    (source === 'upload' && uploadKind === 'folder' && folderFiles.length > 0);

  const showCommands = source !== 'upload';

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <button onClick={() => router.push('/pages/new')} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('pg.backChooseSource')}
      </button>

      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <Rocket className="h-6 w-6 text-primary" /> {t('pg.deployTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {source === 'workspace' && t('pg.deployWorkspaceDesc')}
        {source === 'github' && t('pg.deployGithubDesc')}
        {source === 'gitlab' && t('pg.deployGitlabDesc')}
        {source === 'upload' && t('pg.deployUploadDesc')}
      </p>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Source config */}
          <div className="rounded-lg border bg-card p-4">
            {/* Workspace */}
            {source === 'workspace' && (
              <div>
                <label className="mb-1 block text-sm font-medium">{t('pg.workspace')}</label>
                <select value={selectedWs} onChange={(e) => setSelectedWs(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} · {w.files} {t('pg.files')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Git */}
            {(source === 'github' || source === 'gitlab') && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('pg.repoProvider')}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => switchGit('github')}
                      disabled={!github.enabled}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        gitProvider === 'github' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                      } disabled:opacity-40`}
                    >
                      <Github className="h-4 w-4" /> {t('pg.github')}
                    </button>
                    <button
                      onClick={() => switchGit('gitlab')}
                      disabled={!gitlab.enabled}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        gitProvider === 'gitlab' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                      } disabled:opacity-40`}
                    >
                      <Gitlab className="h-4 w-4" /> {t('pg.gitlab')}
                    </button>
                  </div>
                </div>
                {(gitProvider === 'github' ? github : gitlab).connected === false && (
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

            {/* Upload */}
            {source === 'upload' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setUploadKind('zip')}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                      uploadKind === 'zip' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    <FileArchive className="mr-1 inline h-4 w-4" /> {t('pg.uploadZip')}
                  </button>
                  <button
                    onClick={() => setUploadKind('folder')}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                      uploadKind === 'folder' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                    }`}
                  >
                    <Folder className="mr-1 inline h-4 w-4" /> {t('pg.uploadFolder')}
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
                    className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"
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
                          id="pg-deploy-zip"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleZip(f);
                          }}
                        />
                        <label htmlFor="pg-deploy-zip" className="cursor-pointer text-primary hover:underline">
                          {t('pg.dropZip')}
                        </label>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => setFolderFiles(Array.from(e.target.files || []))}
                      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                    />
                    <button onClick={() => folderInputRef.current?.click()} className="flex items-center gap-1.5 text-primary hover:underline">
                      <FolderTree className="h-4 w-4" /> {t('pg.chooseFolder')}
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

          {/* Build config (commands optional; hidden for upload) */}
          {showCommands && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FolderTree className="h-4 w-4 text-primary" /> {t('pg.step3')}
              </h3>
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
          )}

          <button
            onClick={deploy}
            disabled={deploying || !canDeploy}
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

        {/* Right: hint / history */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <XCircle className="h-4 w-4 text-primary" /> {t('pg.tipsTitle')}
            </h3>
            <ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
              {showCommands && <li>{t('pg.tipCommandsOptional')}</li>}
              {source === 'upload' && <li>{t('pg.tipUploadNoCommands')}</li>}
              <li>{t('pg.tipRandomName')}</li>
              <li>{t('pg.tipRedirect')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
