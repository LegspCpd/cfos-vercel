'use client';

import { Plus, FileCode2, Trash2, Star, Bot, Folder } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/lib/client/i18n';

interface FileNode {
  name: string;
  path: string;
  children: Map<string, FileNode>;
}

interface FileTreeProps {
  files: { path: string; content: string; isEntry: boolean }[];
  activePath: string | null;
  /** Paths the agent has modified in this session — shown with an "AI" badge. */
  agentEdited?: string[];
  /** Paths with unsaved local edits — shown with a dirty dot. */
  dirtyPaths?: string[];
  onSelect: (path: string) => void;
  onAddFile: () => void;
  onDeleteFile: (path: string) => void;
  onSetEntry: (path: string) => void;
}

function buildTree(files: { path: string }[]): FileNode {
  const root: FileNode = { name: '', path: '', children: new Map() };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      current = current ? `${current}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: current, children: new Map() });
      }
      node = node.children.get(part)!;
    }
  }
  return root;
}

export default function FileTree({
  files,
  activePath,
  agentEdited = [],
  dirtyPaths = [],
  onSelect,
  onAddFile,
  onDeleteFile,
  onSetEntry,
}: FileTreeProps) {
  const { t } = useI18n();
  const tree = useMemo(() => buildTree(files), [files]);

  function renderNode(node: FileNode, depth: number) {
    const isDir = node.children.size > 0;
    const file = files.find((f) => f.path === node.path);

    if (isDir) {
      return (
        <div key={node.path || 'root'}>
          {node.path && (
            <div
              className="flex cursor-pointer items-center gap-1.5 truncate px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              {node.name}
            </div>
          )}
          {Array.from(node.children.values()).map((child) => renderNode(child, depth + (node.path ? 1 : 0)))}
        </div>
      );
    }

    const isActive = node.path === activePath;
    const isAgentEdited = agentEdited.includes(node.path);
    const isDirty = dirtyPaths.includes(node.path);
    return (
      <div
        key={node.path}
        onClick={() => onSelect(node.path)}
        className={`group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-sm transition-colors duration-150 hover:bg-secondary ${
          isActive ? 'bg-secondary text-foreground' : 'text-foreground/80'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {isAgentEdited && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-primary" title="Modified by AI">
            <Bot className="h-2.5 w-2.5" /> AI
          </span>
        )}
        {file?.isEntry && <Star className="h-3 w-3 shrink-0 text-amber-400" />}
        {isDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" />}
        {isActive && (
          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetEntry(node.path);
              }}
              title={t('ws.setEntry')}
              className="rounded p-0.5 hover:bg-muted"
            >
              <Star className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(node.path);
              }}
              title={t('ws.deleteFile')}
              className="rounded p-0.5 text-destructive hover:bg-muted"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ws.explorer')}</span>
        <button
          onClick={onAddFile}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('ws.addFile')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {Array.from(tree.children.values()).map((child) => renderNode(child, 0))}
      </div>
    </div>
  );
}
