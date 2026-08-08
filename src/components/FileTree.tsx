'use client';

import { Plus, FileCode2, Trash2, Star } from 'lucide-react';
import { useMemo } from 'react';

interface FileNode {
  name: string;
  path: string;
  children: Map<string, FileNode>;
}

interface FileTreeProps {
  files: { path: string; content: string; isEntry: boolean }[];
  activePath: string | null;
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
  onSelect,
  onAddFile,
  onDeleteFile,
  onSetEntry,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  function renderNode(node: FileNode, depth: number) {
    const isDir = node.children.size > 0;
    const file = files.find((f) => f.path === node.path);

    if (isDir) {
      return (
        <div key={node.path || 'root'}>
          {node.path && (
            <div
              className="cursor-pointer truncate px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              📁 {node.name}
            </div>
          )}
          {Array.from(node.children.values()).map((child) => renderNode(child, depth + (node.path ? 1 : 0)))}
        </div>
      );
    }

    const isActive = node.path === activePath;
    return (
      <div
        key={node.path}
        onClick={() => onSelect(node.path)}
        className={`group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-sm hover:bg-secondary ${
          isActive ? 'bg-secondary text-foreground' : 'text-foreground/80'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {file?.isEntry && <Star className="h-3 w-3 shrink-0 text-amber-400" />}
        {isActive && (
          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetEntry(node.path);
              }}
              title="Set as entry"
              className="rounded p-0.5 hover:bg-muted"
            >
              <Star className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(node.path);
              }}
              title="Delete file"
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
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explorer</span>
        <button
          onClick={onAddFile}
          className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Add file"
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
