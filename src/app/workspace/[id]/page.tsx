'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Play, Columns2, FileCode2, Loader2 } from 'lucide-react';
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
  const [view, setView] = useState<'split' | 'editor' | 'preview'>('split');
  const [autoPrompt, setAutoPrompt] = useState<string | undefined>(undefined);
  const [autoPromptNonce, setAutoPromptNonce] = useState(0);
  const filesRef = useRef<WorkspaceDetail['files']>([]);
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

  // Debounced autosave.
  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        await api.saveFiles(id, filesRef.current.map((f) => ({ path: f.path, content: f.content })));
        setSaved(true);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [id]);

  // Listen for preview refresh from Preview component.
  useEffect(() => {
    const handler = () => setPreviewNonce((n) => n + 1);
    window.addEventListener('cfos-refresh-preview', handler);
    return () => window.removeEventListener('cfos-refresh-preview', handler);
  }, []);

  function updateFileContent(path: string, content: string) {
    filesRef.current = filesRef.current.map((f) => (f.path === path ? { ...f, content } : f));
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

  async function runAgent(prompt: string) {
    setAgentBusy(true);
    try {
      const res = await api.runAgent(id, prompt);
      filesRef.current = res.files.map((f) => ({ id: crypto.randomUUID(), ...f }));
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
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
            onClick={() => setPreviewNonce((n) => n + 1)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Play className="h-4 w-4" /> {t('ws.run')}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <div className="w-56 shrink-0 border-r bg-card">
          <FileTree
            files={filesRef.current}
            activePath={activePath}
            onSelect={setActivePath}
            onAddFile={addFile}
            onDeleteFile={deleteFile}
            onSetEntry={setEntry}
          />
        </div>

        {/* Editor / Preview split */}
        <div className={`flex min-h-0 min-w-0 flex-1 ${view === 'split' ? 'flex-row' : ''}`}>
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
          {view !== 'editor' && (
            <div className={`min-h-0 ${view === 'preview' ? 'w-full' : 'w-1/2'} border-l bg-card`}>
              <Preview workspaceId={id} nonce={previewNonce} />
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="w-80 shrink-0 border-l bg-card">
          <ChatPanel
            onRunAgent={runAgent}
            busy={agentBusy}
            autoPrompt={autoPrompt}
            autoPromptNonce={autoPromptNonce}
          />
        </div>
      </div>
    </main>
  );
}
