'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Loader2, Code2, AppWindow, Plug, MessageSquare, ChevronDown, Check } from 'lucide-react';
import { api, type WorkspaceFile } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';
import ChatPanel from '@/components/workspace/ChatPanel';
import CodePanel from '@/components/workspace/CodePanel';
import AppPanel from '@/components/workspace/AppPanel';
import ConnectionsPanel from '@/components/workspace/ConnectionsPanel';
import CollaboratorsPanel from '@/components/workspace/CollaboratorsPanel';
import ScheduledTasksPanel from '@/components/workspace/ScheduledTasksPanel';
import PublishPanel from '@/components/workspace/PublishPanel';
import { formatIcon } from '@/components/FormatBadge';

type RightTab = 'app' | 'code' | 'connections';

interface FormatOffer {
  id: string;
  title: string;
  output: { noun: string; icon: string };
}

export default function WorkspaceEditorPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [tab, setTab] = useState<RightTab>('app');
  const [showChat, setShowChat] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [formats, setFormats] = useState<FormatOffer[]>([]);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  // The caller's access level: 'owner' | 'write' | 'read'. Owner sees the collaborator
  // manager; read-only collaborators get a read-only editor (no save / agent / delete).
  const [access, setAccess] = useState<'owner' | 'write' | 'read'>('owner');

  const load = useCallback(async () => {
    try {
      const res = await api.getWorkspace(params.id);
      setTitle(res.workspace.title);
      setFiles(res.workspace.files);
      setPreviewUrl(res.previewUrl);
      setFormatId(res.workspace.formatId);
      setAccess(res.access ?? 'owner');
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
    // On small screens the chat panel is a floating overlay; start it collapsed
    // so the preview/editor gets the full width.
    if (window.innerWidth < 1024) setShowChat(false);
    load();
    api
      .listFormats()
      .then((res) => setFormats(res.formats.map((f) => ({ id: f.id, title: f.title, output: f.output }))))
      .catch(() => {});
  }, [router, load]);

  async function handleSwitchFormat(next: string | null) {
    if (next === formatId || switching) return;
    setSwitching(true);
    setFormatMenuOpen(false);
    try {
      const res = await api.switchWorkspaceFormat(params.id, next);
      setFormatId(res.formatId);
      // Reload files so the seeded template files show up in the editor.
      await load();
    } catch {
      /* ignore */
    } finally {
      setSwitching(false);
    }
  }

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
        {/* Output format: badge + switch menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setFormatMenuOpen((v) => !v)}
            disabled={switching}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            title={t('ws.formatSwitch')}
          >
            {switching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              (() => {
                const current = formats.find((f) => f.id === formatId);
                const Icon = formatIcon(current?.output.icon);
                return <Icon className="h-3.5 w-3.5" />;
              })()
            )}
            <span className="hidden sm:inline">
              {formats.find((f) => f.id === formatId)?.output.noun ?? t('ws.formatNone')}
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {formatMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFormatMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
                <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('ws.formatSwitch')}
                </p>
                {formats.map((f) => {
                  const Icon = formatIcon(f.output.icon);
                  const active = f.id === formatId;
                  return (
                    <button
                      key={f.id}
                      onClick={() => handleSwitchFormat(f.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.title}</span>
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
                {formatId && (
                  <button
                    onClick={() => handleSwitchFormat(null)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary"
                  >
                    <AppWindow className="h-4 w-4" />
                    <span className="flex-1">{t('ws.formatNone')}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
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
        {/* Collaborator manager — owner only */}
        {access === 'owner' && (
          <div className="relative shrink-0">
            <CollaboratorsPanel workspaceId={params.id} />
          </div>
        )}
        {access !== 'read' && (
          <button
            onClick={handleDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            title={t('delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Body: left chat + right panel */}
      <div className="relative flex min-h-0 flex-1">
        {/* Left: AI chat — floating overlay on small screens, static column on lg+ */}
        {showChat && (
          <aside className="absolute inset-y-0 left-0 z-30 w-80 border-r bg-card shadow-xl lg:static lg:z-auto lg:w-96 lg:shrink-0 lg:shadow-none">
            <ChatPanel workspaceId={params.id} onAgentResult={handleFilesSaved} readOnly={access === 'read'} />
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
              <CodePanel
                workspaceId={params.id}
                files={files}
                onSaved={handleFilesSaved}
                readOnly={access === 'read'}
              />
            )}
            {tab === 'connections' && (
              <div className="h-full overflow-y-auto p-4">
                <ConnectionsPanel workspaceId={params.id} />
                {access !== 'read' && (
                  <>
                    <div className="mt-4">
                      <ScheduledTasksPanel workspaceId={params.id} />
                    </div>
                    <div className="mt-4">
                      <PublishPanel workspaceId={params.id} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
