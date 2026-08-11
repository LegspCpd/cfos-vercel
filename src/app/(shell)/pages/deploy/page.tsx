'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket,
  Loader2,
  Terminal,
  CheckCircle2,
  ArrowLeft,
  FolderTree,
  Folder,
  FileArchive,
  Github,
  Gitlab,
  ChevronRight,
  Save,
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

// Step indicator (mirrors CF Pages): step 2 is active on this screen.
const STEPS = [
  { key: '1', labelKey: 'pg.step1SelectRepo' },
  { key: '2', labelKey: 'pg.step2SetBuild' },
  { key: '3', labelKey: 'pg.step3Deploy' },
];

// "Set up builds and deployments" screen (/pages/deploy). Modeled after Cloudflare Pages:
// a project-name field, build/deploy commands (optional), and a Deploy action. Source and
// (for git) the selected repo come from the URL query, set when choosing on /pages/new.
export default function DeployPage() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const source = (params.get('source') as Source) || 'workspace';

  // Repo selection (pre-selected from URL when navigating from /pages/new).
  const [repoList, setRepoList] = useState<{ github: Repo[]; gitlab: Repo[] }>({ github: [], gitlab: [] });
  const [selectedRepo, setSelectedRepo] = useState(params.get('repo') || '');
  const [branch, setBranch] = useState(params.get('ref') || '');

  // Workspace + upload states.
  const [workspaces, setWorkspaces] = useState<{ id: string; title: string; files: number }[]>([]);
  const [selectedWs, setSelectedWs] = useState('');
  const [uploadKind, setUploadKind] = useState<'zip' | 'folder'>('zip');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);

  // Build config (commands optional).
  const [buildCommand, setBuildCommand] = useState('');
  const [installCommand, setInstallCommand] = useState('');
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
      setRepoList({ github: s.github.repos, gitlab: s.gitlab.repos });
      const wsParam = params.get('workspace');
      const wantedWs = wsParam && s.workspaces.some((w) => w.id === wsParam) ? wsParam : s.workspaces[0]?.id;
      if (wantedWs) setSelectedWs(wantedWs);
    } catch {
      /* ignore */
    }
  }, [params]);

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
    if ((source === 'github' || source === 'gitlab') && !selectedRepo) return;
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
        const provider = source === 'gitlab' ? 'gitlab' : 'github';
        pushLog(`$ deploy ${provider}:${selectedRepo}${branch ? `@${branch}` : ''}`);
        result = await api.streamRepoDeploy(provider, selectedRepo, branch || undefined, cfg, pushLog);
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
    ((source === 'github' || source === 'gitlab') && !!selectedRepo) ||
    (source === 'upload' && uploadKind === 'zip' && !!zipFile) ||
    (source === 'upload' && uploadKind === 'folder' && folderFiles.length > 0);

  const showCommands = source !== 'upload';
  const isGit = source === 'github' || source === 'gitlab';
  const repoPool = source === 'gitlab' ? repoList.gitlab : repoList.github;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back link */}
      <Link href="/pages/new" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('pg.backChooseSource')}
      </Link>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i <= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.key}
              </span>
              <span className={i <= 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{t(s.labelKey)}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <h1 className="text-2xl font-bold">{t('pg.setupBuildTitle')}</h1>

      {/* Repo summary (git source) */}
      {isGit && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            {source === 'gitlab' ? <Gitlab className="h-5 w-5" /> : <Github className="h-5 w-5" />}
          </span>
          <div className="flex-1">
            <div className="truncate text-sm font-medium">{selectedRepo}</div>
            <div className="text-xs text-muted-foreground">{branch}</div>
          </div>
          <div className="relative">
            <select
              value={selectedRepo}
              onChange={(e) => {
                setSelectedRepo(e.target.value);
                const r = repoPool.find((x) => x.name === e.target.value);
                if (r) setBranch(r.branch);
              }}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {repoPool.length === 0 && <option value="">{t('pg.selectRepo')}</option>}
              {repoPool.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Left: setup */}
        <div className="space-y-6 lg:col-span-3">
          {/* Workspace picker */}
          {source === 'workspace' && (
            <div className="rounded-lg border bg-card p-5">
              <label className="mb-2 block text-sm font-semibold">{t('pg.workspace')}</label>
              <select value={selectedWs} onChange={(e) => setSelectedWs(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} · {w.files} {t('pg.files')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Upload picker */}
          {source === 'upload' && (
            <div className="space-y-3 rounded-lg border bg-card p-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setUploadKind('zip')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                    uploadKind === 'zip' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                  }`}
                >
                  <FileArchive className="h-4 w-4" /> {t('pg.uploadZip')}
                </button>
                <button
                  onClick={() => setUploadKind('folder')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                    uploadKind === 'folder' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'
                  }`}
                >
                  <Folder className="h-4 w-4" /> {t('pg.uploadFolder')}
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
                  className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {zipFile ? (
                    <>
                      <CheckCircle2 className="h-7 w-7 text-green-600" />
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
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
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

          {/* Build commands (optional; hidden for upload) */}
          {showCommands && (
            <div className="rounded-lg border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FolderTree className="h-4 w-4 text-primary" /> {t('pg.buildConfigTitle')}
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">{t('pg.buildConfigDesc')}</p>
              <div className="space-y-4">
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

          {/* Deploy button */}
          <button
            onClick={deploy}
            disabled={deploying || !canDeploy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {deploying ? t('pg.deploying') : t('pg.deployBtn')}
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

        {/* Right: deploy command preview */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Rocket className="h-4 w-4 text-primary" /> {t('pg.deployCmdTitle')}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">{t('pg.deployCmdDesc')}</p>
            <pre className="overflow-x-auto rounded-md bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed text-foreground">
{`npx wrangler pages deploy ${outputDir || './'} --project-name=<project>`}
            </pre>
            <ul className="mt-4 list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
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
