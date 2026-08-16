// In-app notifications + optional email digests.
//
// Every meaningful event (collaborator added, context doc approved, ticket answered…)
// creates a Notification row for the affected user. When the user has opted into email
// for that event type (NotificationPref.emailPrefs) AND Resend is configured, the same
// event also sends an email. Email is best-effort: a failure never fails the action
// that triggered the notification.

import { prisma } from './db';
import { sendEmail, resendConfigured } from './email';
import { invalidateCache } from './kv-cache';

// The event types that can produce a notification. Keep in sync with the frontend's
// notification bell and the profile email-preference toggles.
export const NOTIFICATION_TYPES = [
  'collab.added',
  'collab.removed',
  'context.approved',
  'context.rejected',
  'ticket.reply',
  'share.added',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

// Parse a user's email-preference JSON, tolerating legacy/empty values.
export function parseEmailPrefs(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (isNotificationType(k)) out[k] = Boolean(v);
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

export function serializeEmailPrefs(prefs: Record<string, boolean>): string {
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (isNotificationType(k)) clean[k] = Boolean(v);
  }
  return JSON.stringify(clean);
}

// Create an in-app notification and, if the recipient opted into email for this type,
// send an email too. `href` is the in-app link; the email links to the same place.
export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  const { userId, type, title, body = '', href } = params;

  await prisma.notification.create({
    data: { userId, type, title, body, href },
  });
  // Drop the cached notification list so the bell picks up the new item immediately.
  await invalidateCache('notifications', userId).catch(() => {});

  // Email is best-effort and only when the user opted in for this type.
  try {
    const pref = await prisma.notificationPref.findUnique({ where: { userId } });
    const prefs = parseEmailPrefs(pref?.emailPrefs);
    if (!prefs[type]) return;
    if (!resendConfigured()) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user?.email) return;

    const from = process.env.RESEND_FROM_EMAIL || 'no-reply@example.com';
    await sendEmail({
      from,
      to: user.email,
      subject: `【Cloudflare OS】${title}`,
      text: `${body}\n\n${href ? `打开：${href}` : ''}`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border:1px solid #eee;border-radius:12px;">
          <h2 style="margin:0 0 16px;color:#111;">${title}</h2>
          <p style="color:#555;line-height:1.6;margin:0 0 20px;">${body}</p>
          ${href ? `<a href="${href}" style="display:inline-block;background:#f6821f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">打开查看</a>` : ''}
        </div>
      `,
    });
  } catch {
    // Email failures must never break the action that triggered the notification.
  }
}

// Mark a user's notifications as read (all, or just one).
export async function markNotificationsRead(userId: string, id?: string): Promise<void> {
  if (id) {
    await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  } else {
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  }
}