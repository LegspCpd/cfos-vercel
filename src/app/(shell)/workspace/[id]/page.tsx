'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Loader2, Code2, AppWindow, Plug, MessageSquare } from 'lucide-react';
import { api, type WorkspaceFile } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';
import ChatPanel from '@/components/workspace/ChatPanel';
import CodePanel from '@/components/workspace/CodePanel';
import AppPanel from '@/components/workspace/AppPanel';
import ConnectionsPanel from '@/components/workspace/ConnectionsPanel';

type RightTab = 'app' | 'code' | 'connections';

export default function WorkspaceEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [tab, setTab] = useState<RightTab>('app');
  const [showChat, setShowChat] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getWorkspace(params.id);
      setTitle(res.workspace.title);
      setFiles(res.workspace.files);
      setPreviewUrl(res.previewUrl);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [router, load]);

  async function handleDelete() {
    if (!confirm(t('ws.confirmDelete'))) return;
    try {
      await api.deleteWorkspace(params.id);
      router.push('/workspaces');
    } catch {
      /* ignore */
    }
  }

  // Called by CodePanel after a save so the App preview reflects the latest files.
  function handleFilesSaved(updated: WorkspaceFile[]) {
    setFiles(updated);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{t('ws.notFound')}</p>
        <Link href="/workspaces" className="text-primary hover:underline">
          {t('ws.backToList')}
        </Link>
      </div>
    );
  }

  const tabs: { value: RightTab; label: string; icon: typeof Code2 }[] = [
    { value: 'app', label: t('ws.tabApp'), icon: AppWindow },
    { value: 'code', label: t('ws.tabCode'), icon: Code2 },
    { value: 'connections', label: t('ws.tabConnections'), icon: Plug },
  ];

  return (
    <div className="flex h-screen flex-col">
      {/* Top toolbar */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-2.5">
        <Link
          href="/workspaces"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title={t('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={async () => {
            try {
              await api.renameWorkspace(params.id, title);
            } catch {
              /* ignore */
            }
          }}
          className="min-w-0 flex-1 rounded-md border-none bg-transparent px-2 py-1 text-sm font-semibold outline-none focus:bg-secondary"
        />
        <button
          onClick={() => setShowChat((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
            showChat ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary',
          )}
          title={t('ws.toggleChat')}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          title={t('delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {/* Body: left chat + right panel */}
      <div className="flex min-h-0 flex-1">
        {/* Left: AI chat */}
        {showChat && (
          <aside className="w-80 shrink-0 border-r bg-card lg:w-96">
            <ChatPanel workspaceId={params.id} onAgentResult={handleFilesSaved} />
          </aside>
        )}

        {/* Right: App / Code / Connections */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex shrink-0 items-center gap-1 border-b bg-card px-2">
            {tabs.map((tb) => (
              <button
                key={tb.value}
                onClick={() => setTab(tb.value)}
                className={clsx(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
                  tab === tb.value
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <tb.icon className="h-4 w-4" />
                {tb.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1">
            {tab === 'app' && <AppPanel previewUrl={previewUrl} files={files} />}
            {tab === 'code' && (
              <CodePanel workspaceId={params.id} files={files} onSaved={handleFilesSaved} />
            )}
            {tab === 'connections' && <ConnectionsPanel workspaceId={params.id} />}
          </div>
        </main>
      </div>
    </div>
  );
}
