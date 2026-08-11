'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Columns2, FileCode2, Loader2, History, X, Maximize, RefreshCw } from 'lucide-react';
import { api, type WorkspaceDetail } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import FileTree from '@/components/FileTree';
import CodeEditor from '@/components/Editor';
import ChatPanel from '@/components/ChatPanel';
import Preview from '@/components/Preview';
import { useI18n } from '@/lib/client/i18n';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [view, setView] = useState<'split' | 'editor' | 'preview'>('split');
  // Mobile: which single panel is shown (file tree / editor+preview / chat).
  const [mobilePanel, setMobilePanel] = useState<'files' | 'work' | 'chat'>('work');
  // Mobile: full-screen preview overlay (top-right button). Desktop uses the inline split.
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<{ id: string; content: string; createdAt: string }[]>([]);
  const [autoPrompt, setAutoPrompt] = useState<string | undefined>(undefined);
  const [autoPromptNonce, setAutoPromptNonce] = useState(0);
  const [agentEdited, setAgentEdited] = useState<string[]>([]);
  const filesRef = useRef<WorkspaceDetail['files']>([]);
  const dirtyRef = useRef<Set<string>>(new Set());
  const [, forceDirty] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // Read ?prompt= (from the home page) — the agent runs automatically on load.
    const url = new URL(window.location.href);
    const autoPrompt = url.searchParams.get('prompt');
    api
      .getWorkspace(id)
      .then(async (res) => {
        setWorkspace(res.workspace);
        setPreviewUrl(res.previewUrl);
        filesRef.current = res.workspace.files;
        const entry = res.workspace.files.find((f) => f.isEntry) || res.workspace.files[0];
        setActivePath(entry?.path ?? null);
        if (autoPrompt) {
          // Clear the URL param so it doesn't re-run on reload.
          url.searchParams.delete('prompt');
          window.history.replaceState({}, '', url.pathname + url.search);
          setAutoPrompt(autoPrompt);
          setAutoPromptNonce((n) => n + 1);
        }
      })
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  // Debounced autosave. `saveInFlightRef` tracks an in-progress PUT so runAgent can wait
  // for it (and cancel a pending one) before issuing the agent write — preventing a stale
  // autosave PUT from landing after the agent POST and silently rolling back its changes.
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  // Persist the current files immediately (used by runAgent before its own write).
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (saveInFlightRef.current) {
      try {
        await saveInFlightRef.current;
      } catch {
        /* saved above */
      }
    }
    const snapshot = filesRef.current.map((f) => ({ path: f.path, content: f.content }));
    setSaving(true);
    const p = api
      .saveFiles(id, snapshot)
      .then(() => {
        // Only mark saved if no newer edits arrived during the save (dirtyRef non-empty
        // means the user edited again while we were saving).
        if (dirtyRef.current.size === 0) setSaved(true);
        dirtyRef.current.clear();
        forceDirty((n) => n + 1);
      })
      .finally(() => setSaving(false));
    saveInFlightRef.current = p;
    await p;
  }, [id]);

  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveInFlightRef.current = flushSave().catch(() => {});
    }, 800);
  }, [flushSave]);

  // Clear any pending autosave timer on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // Listen for preview refresh from Preview component.
  useEffect(() => {
    const handler = () => setPreviewNonce((n) => n + 1);
    window.addEventListener('cfos-refresh-preview', handler);
    return () => window.removeEventListener('cfos-refresh-preview', handler);
  }, []);

  // If a desktop-only preview view survives onto a small screen, fall back to the
  // full-screen overlay so mobile never shows a blank "work" panel.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && view === 'preview') {
      setFullPreviewOpen(true);
      setView('split');
    }
  }, [view]);

  function updateFileContent(path: string, content: string) {
    const prev = filesRef.current.find((f) => f.path === path)?.content;
    filesRef.current = filesRef.current.map((f) => (f.path === path ? { ...f, content } : f));
    if (prev !== content) {
      dirtyRef.current.add(path);
      forceDirty((n) => n + 1);
    }
    if (workspace) setWorkspace({ ...workspace, files: filesRef.current });
    scheduleSave();
  }

  function addFile() {
    let n = 1;
    let path = 'file1.ts';
    while (filesRef.current.some((f) => f.path === path)) {
      n++;
      path = `file${n}.ts`;
    }
    const newFile = { id: crypto.randomUUID(), path, content: '', isEntry: false };
    filesRef.current = [...filesRef.current, newFile];
    if (workspace) setWorkspace({ ...workspace, files: filesRef.current });
    setActivePath(path);
    scheduleSave();
  }

  function deleteFile(path: string) {
    filesRef.current = filesRef.current.filter((f) => f.path !== path);
    if (workspace) setWorkspace({ ...workspace, files: filesRef.current });
    if (activePath === path) setActivePath(filesRef.current[0]?.path ?? null);
    fetch(`/api/workspaces/${id}/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => {});
  }

  function setEntry(path: string) {
    filesRef.current = filesRef.current.map((f) => ({ ...f, isEntry: f.path === path }));
    if (workspace) setWorkspace({ ...workspace, files: filesRef.current });
    api.saveFiles(id, filesRef.current).catch(() => {});
    setPreviewNonce((n) => n + 1);
  }

  async function openHistory(path: string) {
    setHistoryOpen(true);
    try {
      const res = await api.listFileVersions(id, path);
      setVersions(res.versions);
    } catch {
      setVersions([]);
    }
  }

  async function restoreVersion(path: string, versionId: string) {
    try {
      await api.restoreFileVersion(id, path, versionId);
      const res = await api.getWorkspace(id);
      filesRef.current = res.workspace.files;
      if (workspace) setWorkspace({ ...workspace, files: res.workspace.files });
      setPreviewNonce((n) => n + 1);
      setSaved(true);
      dirtyRef.current.clear();
      forceDirty((n) => n + 1);
      setHistoryOpen(false);
    } catch {
      /* ignore */
    }
  }

  async function runAgent(prompt: string) {
    setAgentBusy(true);
    try {
      // Persist any unsaved edits first so the agent's write starts from the latest files
      // and no stale autosave PUT can overwrite the agent's result afterwards.
      await flushSave();
      const res = await api.runAgent(id, prompt);
      filesRef.current = res.files.map((f) => ({ id: crypto.randomUUID(), ...f }));
      if (res.files.length > 0) {
        const added = res.files.map((f) => f.path);
        setAgentEdited((prev) => {
          const seen = new Set(prev);
          added.forEach((p) => seen.add(p));
          return Array.from(seen);
        });
      }
      if (workspace) setWorkspace({ ...workspace, files: filesRef.current });
      setPreviewNonce((n) => n + 1);
      setSaved(true);
      return { message: res.message, agentEdited: res.files.length > 0 };
    } finally {
      setAgentBusy(false);
    }
  }

  const activeFile = useMemo(
    () => workspace?.files.find((f) => f.path === activePath) ?? null,
    [workspace, activePath],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!workspace) return null;

  return (
    <main className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <FileCode2 className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-medium">{workspace.title}</h1>
          <span className={`hidden text-xs sm:inline ${saved ? 'text-muted-foreground' : 'text-amber-400'}`}>
            {saving ? t('saving') : saved ? t('ws.saved') : t('ws.unsaved')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-0.5 rounded-md border p-0.5 md:flex">
            {(['split', 'editor', 'preview'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  view === v ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                }`}
              >
                {v === 'split' ? <Columns2 className="h-3.5 w-3.5" /> : v}
              </button>
            ))}
          </div>
          <button
            onClick={() => activePath && openHistory(activePath)}
            disabled={!activePath}
            className="press flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50 sm:px-3"
            title={t('ws.history')}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">{t('ws.history')}</span>
          </button>
          <button
            onClick={() => setPreviewNonce((n) => n + 1)}
            className="press flex items-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 sm:px-3"
          >
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">{t('ws.run')}</span>
          </button>
          {/* Mobile: full-screen preview toggle in the top-right */}
          <button
            onClick={() => {
              setPreviewNonce((n) => n + 1);
              setFullPreviewOpen(true);
            }}
            className="press flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary md:hidden"
            title={t('ws.preview')}
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Version history overlay */}
      {historyOpen && (
        <div
          className="animate-backdrop-in fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="animate-sheet-in flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">
                {t('ws.historyFor')} <span className="text-primary">{activePath}</span>
              </span>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {versions.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t('ws.noHistory')}</p>
              ) : (
                versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="reveal-row flex items-center justify-between rounded-md px-3 py-2 hover:bg-secondary"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {t('ws.version')} #{versions.length - i}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => activePath && restoreVersion(activePath, v.id)}
                      className="press rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    >
                      {t('ws.restore')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body: stacks vertically on mobile (one panel at a time), side-by-side on md+ */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* File tree: drawer-like on mobile, fixed column on md+ */}
        <div
          className={`w-full border-b bg-card md:w-56 md:shrink-0 md:border-r md:border-b-0 ${
            mobilePanel === 'files' ? 'block' : 'hidden'
          } md:block`}
        >
          <FileTree
            files={filesRef.current}
            activePath={activePath}
            agentEdited={agentEdited}
            dirtyPaths={Array.from(dirtyRef.current)}
            onSelect={setActivePath}
            onAddFile={addFile}
            onDeleteFile={deleteFile}
            onSetEntry={setEntry}
          />
        </div>

        {/* Editor / Preview: full width on mobile, split on md+ */}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col md:flex-row ${
            mobilePanel === 'work' ? '' : 'hidden'
          } md:flex ${view === 'split' ? 'md:flex-row' : ''}`}
        >
          {view !== 'preview' && (
            <div className="min-h-0 min-w-0 flex-1 bg-[#121212]">
              {activeFile ? (
                <CodeEditor
                  path={activeFile.path}
                  value={activeFile.content}
                  onChange={(v) => updateFileContent(activeFile.path, v)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('ws.noFileSelected')}
                </div>
              )}
            </div>
          )}
          {/* Inline preview is desktop-only; mobile uses the full-screen overlay instead. */}
          {view !== 'editor' && (
            <div
              className={`hidden min-h-0 md:block ${
                view === 'preview' ? 'w-full' : 'w-full md:w-1/2'
              } border-t bg-card md:border-l md:border-t-0`}
            >
              <Preview workspaceId={id} previewUrl={previewUrl} nonce={previewNonce} />
            </div>
          )}
        </div>

        {/* Chat panel: full-width sheet on mobile, fixed column on md+ */}
        <div
          className={`w-full border-t bg-card md:w-80 md:shrink-0 md:border-l md:border-t-0 ${
            mobilePanel === 'chat' ? 'block' : 'hidden'
          } md:block`}
        >
          <ChatPanel
            workspaceId={id}
            onRunAgent={runAgent}
            busy={agentBusy}
            autoPrompt={autoPrompt}
            autoPromptNonce={autoPromptNonce}
          />
        </div>
      </div>

      {/* Mobile panel switcher (files / work / chat) */}
      <div className="flex shrink-0 items-center gap-1 border-t bg-card p-1 md:hidden">
        {(
          [
            ['files', t('ws.panelFiles')],
            ['work', t('ws.panelEditor')],
            ['chat', t('ws.panelChat')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobilePanel(key)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${
              mobilePanel === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mobile full-screen preview overlay */}
      {fullPreviewOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-card md:hidden">
          <header className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
            <button
              onClick={() => setFullPreviewOpen(false)}
              className="press rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="flex-1 truncate text-sm font-medium">
              {t('ws.preview')} · {workspace.title}
            </span>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('cfos-refresh-preview'))}
              className="press rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Refresh preview"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <Preview workspaceId={id} previewUrl={previewUrl} nonce={previewNonce} />
          </div>
        </div>
      )}
    </main>
  );
}
