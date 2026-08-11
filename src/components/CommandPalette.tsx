'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileCode2, Plus, FileText } from 'lucide-react';
import { api, type WorkspaceSummary } from '@/lib/client/api';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    setLoading(true);
    api
      .listWorkspaces()
      .then((r) => setWorkspaces(r.workspaces))
      .finally(() => setLoading(false));
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  if (!open) return null;

  const staticCommands = [
    { id: 'new-workspace', label: 'New Workspace', icon: Plus, action: () => router.push('/') },
    { id: 'outputs', label: 'Go to Outputs', icon: FileText, action: () => router.push('/outputs') },
    { id: 'explore', label: 'Explore blueprints', icon: FileCode2, action: () => router.push('/explore') },
  ];

  const q = query.trim().toLowerCase();
  const filteredWorkspaces = q
    ? workspaces.filter((w) => w.title.toLowerCase().includes(q))
    : workspaces.slice(0, 8);

  const filteredStatic = q
    ? staticCommands.filter((c) => c.label.toLowerCase().includes(q))
    : staticCommands;

  const allItems = [
    ...filteredStatic.map((c) => ({ type: 'static' as const, ...c })),
    ...filteredWorkspaces.map((w) => ({
      type: 'workspace' as const,
      id: w.id,
      label: w.title,
      icon: FileCode2,
      action: () => router.push(`/workspace/${w.id}`),
    })),
  ];

  function run(index: number) {
    const item = allItems[index];
    if (item) {
      onClose();
      item.action();
    }
  }

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="animate-sheet-in w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, allItems.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                run(highlight);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search workspaces, commands..."
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading...</p>
          ) : allItems.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No results</p>
          ) : (
            allItems.map((item, i) => (
              <button
                key={`${item.type}-${item.id}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => run(i)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  i === highlight ? 'bg-secondary text-foreground' : 'text-foreground/80'
                }`}
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
