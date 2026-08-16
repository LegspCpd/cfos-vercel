'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/lib/client/i18n';
import { clsx } from 'clsx';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

// The notification bell in the top bar. Polls /api/notifications every 30s so new
// events (collaborator added, context approved, ticket answered…) show up without a
// page refresh. Clicking a notification marks it read and navigates to its href.
export default function NotificationBell() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const res = await api.listNotifications();
      setNotifications(res.notifications);
      setUnread(res.unread);
    } catch {
      /* ignore — the bell just stays quiet */
    }
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function markAll() {
    setLoading(true);
    try {
      const res = await api.markNotificationsRead();
      setUnread(res.unread);
      setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    } finally {
      setLoading(false);
    }
  }

  async function openOne(n: Notification) {
    if (!n.read) {
      try {
        const res = await api.markNotificationsRead(n.id);
        setUnread(res.unread);
        setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    if (n.href) window.location.href = n.href;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        title={t('notif.title')}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-sm font-semibold">{t('notif.title')}</p>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  {t('notif.markAll')}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('notif.empty')}</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openOne(n)}
                    className={clsx(
                      'block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-secondary',
                      !n.read && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={clsx(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}