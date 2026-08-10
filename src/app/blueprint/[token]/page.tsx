'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileCode2, User, Clock, Copy, Check, Home } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface BlueprintData {
  id: string;
  title: string;
  updatedAt: string;
  owner: { displayName: string; username: string };
  files: { path: string; content: string; isEntry: boolean }[];
}

export default function PublicBlueprintPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [bp, setBp] = useState<BlueprintData | null>(null);
  const [error, setError] = useState('');
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getPublicBlueprint(token)
      .then((res) => {
        setBp(res.workspace);
        const entry = res.workspace.files.find((f) => f.isEntry) || res.workspace.files[0];
        setActivePath(entry?.path ?? null);
      })
      .catch((e) => setError((e as Error).message));
  }, [token]);

  const activeFile = bp?.files.find((f) => f.path === activePath) ?? null;

  async function copyCode() {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <FileCode2 className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          ← {t('blueprint.back')}
        </Link>
      </div>
    );
  }

  if (!bp) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="skeleton h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-2">
        <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Home className="h-4 w-4" /> Home
        </Link>
        <h1 className="truncate text-sm font-semibold">{bp.title}</h1>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" /> {bp.owner.displayName || bp.owner.username}
        </span>
      </header>

      {/* Preview banner */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <span>{t('blueprint.readonly')}</span>
        <span className="ml-auto flex items-center gap-1">
          <Clock className="h-3 w-3" /> {t('ctx.updatedAt')} {new Date(bp.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Body */}
      <div className="flex h-[calc(100vh-100px)]">
        {/* File list */}
        <div className="w-48 shrink-0 overflow-y-auto border-r bg-card py-2">
          <p className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Files</p>
          {bp.files.map((f) => (
            <button
              key={f.path}
              onClick={() => setActivePath(f.path)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                f.path === activePath ? 'bg-secondary text-foreground' : 'text-foreground/80 hover:bg-secondary/50'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>

        {/* Preview / code */}
        <div className="min-w-0 flex-1">
          <div className="h-1/2 border-b bg-white">
            <iframe
              title="blueprint-preview"
              src={`/api/preview/${bp.id}`}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-modals"
            />
          </div>
          <div className="relative h-1/2 overflow-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-3 py-1.5 backdrop-blur">
              <span className="text-xs font-medium text-muted-foreground">{activePath}</span>
              <button
                onClick={copyCode}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-3 text-xs leading-relaxed">
              <code>{activeFile?.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
