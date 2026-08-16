'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X, BookOpen, RefreshCw } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';

interface PendingDoc {
  id: string;
  title: string;
  tags: string;
  content: string;
  createdAt: string;
  owner: { username: string; displayName: string };
}

// Admin review queue for public context documents. Users mark a doc "public" and it
// lands here as pending; an admin approves it (it becomes visible in the public
// library) or rejects it (the owner is notified and the doc goes back to draft).
export default function ContextReviewPanel() {
  const { t } = useI18n();
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.listPendingContext();
      setDocs(res.docs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError('');
    try {
      await api.reviewContext(id, action);
      setDocs((ds) => ds.filter((d) => d.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t('ctx.reviewTitle')}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          {t('ctx.reviewRefresh')}
        </button>
      </div>

      {error && <p className="border-b px-4 py-2 text-xs text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('ctx.reviewEmpty')}</p>
      ) : (
        <div className="divide-y">
          {docs.map((d) => (
            <div key={d.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    @{d.owner.username} · {new Date(d.createdAt).toLocaleString()}
                  </p>
                  {d.tags && <p className="mt-1 text-xs text-primary">{d.tags}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => review(d.id, 'approve')}
                    disabled={busyId === d.id}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busyId === d.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    {t('ctx.reviewApprove')}
                  </button>
                  <button
                    onClick={() => review(d.id, 'reject')}
                    disabled={busyId === d.id}
                    className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    {t('ctx.reviewReject')}
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-secondary/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                {d.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}