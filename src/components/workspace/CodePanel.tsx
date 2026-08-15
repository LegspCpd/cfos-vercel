'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus, Trash2, Save, Loader2, File, FileCode } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { api, type WorkspaceFile } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

interface Props {
  workspaceId: string;
  files: WorkspaceFile[];
  onSaved: (files: WorkspaceFile[]) => void;
}

// Pick a Monaco language from the file extension so syntax highlighting matches the file.
function langForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
      return 'markdown';
    case 'py':
      return 'python';
    default:
      return 'plaintext';
  }
}

// The "Code" tab — a file tree on the left and a Monaco editor on the right. Edits are kept in
// local state and saved to the server on demand (Save button) or on Ctrl/Cmd+S. The parent is
// notified via onSaved so the App preview can refresh.
export default function CodePanel({ workspaceId, files, onSaved }: Props) {
  const { t } = useI18n();
  const [localFiles, setLocalFiles] = useState<WorkspaceFile[]>(files);
  const [activePath, setActivePath] = useState<string | null>(files[0]?.path ?? null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  // Sync from parent when files change externally (e.g. agent run).
  useEffect(() => {
    setLocalFiles(files);
    if (!activePath && files[0]) setActivePath(files[0].path);
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFile = localFiles.find((f) => f.path === activePath);

  // Ctrl/Cmd+S saves the dirty files.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dirty, localFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateActiveContent(content: string) {
    if (!activePath) return;
    setLocalFiles((prev) => prev.map((f) => (f.path === activePath ? { ...f, content } : f)));
    setDirty((prev) => new Set(prev).add(activePath));
  }

  async function save() {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const toSave = localFiles.filter((f) => dirty.has(f.path));
      await api.saveFiles(workspaceId, toSave);
      setDirty(new Set());
      onSaved(localFiles);
    } catch {
      /* ignore — keep dirty so user can retry */
    } finally {
      setSaving(false);
    }
  }

  async function addFile() {
    const path = newName.trim();
    if (!path || localFiles.some((f) => f.path === path)) return;
    const newFile: WorkspaceFile = {
      id: `tmp-${Date.now()}`,
      path,
      content: '',
      isEntry: path === 'index.html',
    };
    setLocalFiles((prev) => [...prev, newFile].sort((a, b) => a.path.localeCompare(b.path)));
    setActivePath(path);
    setNewName('');
    setShowNew(false);
    // Mark dirty so a Save persists it.
    setDirty((prev) => new Set(prev).add(path));
  }

  async function removeFile(path: string) {
    if (!confirm(t('ws.confirmDeleteFile'))) return;
    setLocalFiles((prev) => prev.filter((f) => f.path !== path));
    if (activePath === path) {
      const remaining = localFiles.filter((f) => f.path !== path);
      setActivePath(remaining[0]?.path ?? null);
    }
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    try {
      await api.deleteFile(workspaceId, path);
      onSaved(localFiles.filter((f) => f.path !== path));
    } catch {
      /* ignore */
    }
  }

  // Sorted file list for the tree.
  const sortedFiles = useMemo(() => [...localFiles].sort((a, b) => a.path.localeCompare(b.path)), [localFiles]);

  return (
    <div className="flex h-full">
      {/* File sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r bg-card">
        <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">{t('ws.files')}</span>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t('ws.newFile')}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
        </div>
        {showNew && (
          <div className="border-b p-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFile();
                if (e.key === 'Escape') {
                  setShowNew(false);
                  setNewName('');
                }
              }}
              placeholder={t('ws.fileNamePlaceholder')}
              autoFocus
              className="w-full rounded border bg-background px-2 py-1 text-xs outline-none"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {sortedFiles.map((f) => (
            <button
              key={f.path}
              onClick={() => setActivePath(f.path)}
              className={clsx(
                'flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs',
                activePath === f.path ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/50',
              )}
            >
              {f.isEntry ? <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" /> : <File className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              {dirty.has(f.path) && <span className="text-primary">•</span>}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.path);
                }}
                className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/10 hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          ))}
          {sortedFiles.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('ws.noFiles')}</p>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-card px-3 py-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {activeFile ? activeFile.path : t('ws.noFileSelected')}
            {activeFile && dirty.has(activeFile.path) && <span className="ml-1 text-primary">●</span>}
          </span>
          <button
            onClick={save}
            disabled={saving || dirty.size === 0}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('save')}
          </button>
        </div>

        {/* Monaco */}
        <div className="min-h-0 flex-1">
          {activeFile ? (
            <Editor
              height="100%"
              path={activeFile.path}
              language={langForPath(activeFile.path)}
              value={activeFile.content}
              onChange={(val) => updateActiveContent(val ?? '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('ws.selectFile')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
