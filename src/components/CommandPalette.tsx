'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  FileCode2,
  Plus,
  FileText,
  LayoutGrid,
  BookOpen,
  BookMarked,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { searchIndex, scoreEntry, normalizeQuery, type SearchEntry } from '@/lib/search-index';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// Icon per search-result group (page / doc / action / workspace / context).
const GROUP_ICONS: Record<string, LucideIcon> = {
  page: LayoutGrid,
  doc: BookMarked,
  action: Plus,
  workspace: FileCode2,
  context: BookOpen,
};

// Localized labels for the static index entries (i18n keys → display text).
function entryLabel(entry: SearchEntry, t: (k: string) => string): string {
  if (entry.labelKey) {
    const localized = t(entry.labelKey);
    if (localized && localized !== entry.labelKey) return localized;
  }
  return entry.label || entry.href;
}

interface ResultItem {
  key: string;
  href: string;
  label: string;
  group: string;
  icon: LucideIcon;
  score: number;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [userResults, setUserResults] = useState<ResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    setUserResults([]);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Debounced fetch of user-owned data (workspaces + context docs) from /api/search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setUserResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(q);
        setUserResults(
          res.results.map((r) => ({
            key: `${r.type}-${r.href}`,
            href: r.href,
            label: r.label || (r.labelKey ? t(r.labelKey) : r.href),
            group: r.type,
            icon: GROUP_ICONS[r.type] || FileCode2,
            score: r.score,
          })),
        );
      } catch {
        setUserResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, t]);

  if (!open) return null;

  // Static index matched locally (instant, no network). Score against the localized
  // display label so "worker" matches "Worker 和 Pages" and "部署" matches "Pages 部署".
  const staticHits = searchIndex(query, 8)
    .map(({ entry, score }) => ({
      key: `static-${entry.href}`,
      href: entry.href,
      label: entryLabel(entry, t),
      group: entry.group,
      icon: GROUP_ICONS[entry.group] || LayoutGrid,
      score: scoreEntry(entry, normalizeQuery(query), entryLabel(entry, t)),
    }))
    .toSorted((a, b) => b.score - a.score);

  // Merge: static first (higher scores), then user data. Dedupe by href.
  const seen = new Set<string>();
  const allItems: ResultItem[] = [];
  for (const item of [...staticHits, ...userResults]) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    allItems.push(item);
  }

  // Empty query: show a few quick actions.
  const quickActions: ResultItem[] = [
    { key: 'new-workspace', href: '/', label: t('cmd.newWorkspace') || '新建工作区', group: 'action', icon: Plus, score: 0 },
    { key: 'outputs', href: '/outputs', label: t('cmd.goOutputs') || '前往输出', group: 'action', icon: FileText, score: 0 },
    { key: 'explore', href: '/explore', label: t('cmd.explore') || '探索蓝图', group: 'action', icon: Compass, score: 0 },
  ];
  const displayItems = query.trim() ? allItems : quickActions;

  function run(item: ResultItem) {
    onClose();
    router.push(item.href);
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
                setHighlight((h) => Math.min(h + 1, Math.max(0, displayItems.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                const item = displayItems[highlight];
                if (item) run(item);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={t('cmd.placeholder') || '搜索功能、工作区、文档…'}
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {displayItems.length === 0 ? (
            loading ? (
              <p className="p-3 text-sm text-muted-foreground">{t('loading') || '加载中...'}</p>
            ) : (
              <p className="p-3 text-sm text-muted-foreground">{t('cmd.noResults') || '没有找到结果'}</p>
            )
          ) : (
            displayItems.map((item, i) => (
              <button
                key={item.key}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => run(item)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  i === highlight ? 'bg-secondary text-foreground' : 'text-foreground/80'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
                {item.group === 'workspace' && (
                  <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('cmd.workspace') || '工作区'}
                  </span>
                )}
                {item.group === 'context' && (
                  <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('cmd.doc') || '文档'}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
