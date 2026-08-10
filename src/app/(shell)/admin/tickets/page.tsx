'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Inbox, CheckCircle2, Clock, XCircle, Reply } from 'lucide-react';
import { api, type Ticket } from '@/lib/client/api';
import { getToken } from '@/lib/client/auth';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { useI18n } from '@/lib/client/i18n';

function typeLabel(t: (k: string) => string, type: string): string {
  const map: Record<string, string> = {
    feedback: t('ticket.typeFeedback'),
    emailChange: t('ticket.typeEmailChange'),
    appeal: t('ticket.typeAppeal'),
    other: t('ticket.typeOther'),
  };
  return map[type] || type;
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const focusId = searchParams.get('focus');
  const STATUS_META: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
    open: { label: t('ticket.statusOpen'), icon: Clock, cls: 'bg-amber-500/15 text-amber-600' },
    processing: { label: t('ticket.statusProcessing'), icon: Loader2, cls: 'bg-blue-500/15 text-blue-600' },
    closed: { label: t('ticket.statusClosed'), icon: CheckCircle2, cls: 'bg-green-500/15 text-green-600' },
  };
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [notAdmin, setNotAdmin] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api
      .me()
      .then((me) => {
        if (!me.permissions?.includes('tickets.manage')) {
          setNotAdmin(true);
          return;
        }
        api
          .listTickets()
          .then((res) => {
            setTickets(res.tickets);
            if (focusId) setSelectedId(focusId);
          })
          .catch(() => setTickets([]));
      })
      .catch(() => setNotAdmin(true));
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    if (filter === 'all') return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  const selected = useMemo(() => tickets?.find((t) => t.id === selectedId) || null, [tickets, selectedId]);

  async function save() {
    if (!selected) return;
    setError('');
    setSaving(true);
    try {
      await api.handleTicket(selected.id, { status: status || selected.status, reply: reply });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (notAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-muted-foreground">
        <XCircle className="mx-auto mb-4 h-10 w-10" />
        <p>{t('admin.noTicketsAccess')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('admin.tickets')}</h1>

      {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'open', 'processing', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {f === 'all' ? t('admin.ticketsAll') : STATUS_META[f].label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* List */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">{t('admin.ticketsList')}</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {!tickets ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p className="text-sm">{t('admin.noTickets')}</p>
              </div>
            ) : (
              filtered.map((tk) => {
                const st = STATUS_META[tk.status] || STATUS_META.open;
                return (
                  <button
                    key={tk.id}
                    onClick={() => {
                      setSelectedId(tk.id);
                      setStatus(tk.status);
                      setReply(tk.reply || '');
                    }}
                    className={clsx(
                      'flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-secondary/50',
                      selectedId === tk.id && 'bg-secondary/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{tk.title}</span>
                      <span className={clsx('flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px]', st.cls)}>
                        <st.icon className="h-3 w-3" /> {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-secondary px-1.5 py-0.5">{typeLabel(t, tk.type)}</span>
                      <span>@{tk.user.username}</span>
                      <span>{new Date(tk.createdAt).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="rounded-lg border bg-card p-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">{t('admin.selectTicket')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold">{selected.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {typeLabel(t, selected.type)} · {t('admin.by')} @{selected.user.username}
                  {selected.user.email ? ` (${selected.user.email})` : ''} · IP {selected.ip || t('admin.unknown')}
                  <br />
                  {t('admin.submittedAt')} {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="rounded-md bg-secondary/50 p-3 text-sm whitespace-pre-wrap">{selected.content}</div>

              {selected.reply && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1 font-medium text-primary">
                    <Reply className="h-3.5 w-3.5" /> {t('admin.adminReply')}
                  </p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{selected.reply}</p>
                </div>
              )}

              <div className="space-y-2 border-t pt-4">
                <label className="block text-xs font-medium text-muted-foreground">{t('admin.status')}</label>
                <div className="flex flex-wrap gap-2">
                  {(['open', 'processing', 'closed'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={clsx(
                        'rounded-md px-3 py-1.5 text-sm font-medium',
                        status === s
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">{t('admin.replyContent')}</label>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  placeholder={t('admin.replyPlaceholder')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <button
                onClick={save}
                disabled={saving}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? t('saving') : t('admin.saveResult')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
