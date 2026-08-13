import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { getPublicCaptchaConfig } from '@/lib/settings';
import { verifyCaptcha, type CaptchaProvider } from '@/lib/captcha';
import { sendEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import { writeAudit } from '@/lib/audit';
import { ticketLimiter } from '@/lib/rate-limit';
import { z } from 'zod';

const TICKET_TYPES = ['feedback', 'emailChange', 'appeal', 'other'] as const;

const createSchema = z.object({
  type: z.enum(TICKET_TYPES),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(5000),
  captchaProvider: z.enum(['turnstile', 'recaptcha']).optional(),
  captchaToken: z.string().min(1).optional(),
});

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

// GET /api/tickets — list the current user's own tickets.
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const tickets = await prisma.ticket.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      ip: true,
      status: true,
      reply: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { username: true, displayName: true, email: true } },
    },
  });
  return NextResponse.json({ tickets });
}

// POST /api/tickets — submit a support ticket (feedback / email-change appeal / other).
// Human verification is enforced; the ticket is emailed to all admins with a link to
// the admin Tickets panel.
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    // Rate-limit ticket submissions (each emails every admin) to prevent inbox spam.
    if (ticketLimiter.tryCall(session.userId) === 0) {
      return NextResponse.json({ error: 'Too many tickets. Please try again later.' }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = createSchema.parse(await req.json());

    // Human verification.
    const captcha = await getPublicCaptchaConfig();
    if (captcha.turnstileEnabled || captcha.recaptchaEnabled) {
      const effective: CaptchaProvider | null =
        captcha.turnstileEnabled && captcha.recaptchaEnabled
          ? body.captchaProvider === 'turnstile'
            ? 'turnstile'
            : 'recaptcha'
          : captcha.turnstileEnabled
            ? 'turnstile'
            : captcha.recaptchaEnabled
              ? 'recaptcha'
              : null;
      if (effective) {
        if (!body.captchaToken) {
          return NextResponse.json({ error: '请完成人机验证' }, { status: 400 });
        }
        try {
          await verifyCaptcha(effective, body.captchaToken);
        } catch {
          return NextResponse.json({ error: '人机验证未通过，请重试' }, { status: 400 });
        }
      }
    }

    const ip = clientIp(req);
    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        type: body.type,
        title: body.title,
        content: body.content,
        ip,
      },
      select: { id: true },
    });

    await writeAudit({
      userId: user.id,
      username: user.username,
      action: 'ticket.submit',
      detail: `Submitted ${body.type} ticket: ${body.title}`,
    });

    // Notify all admins by email with a link to handle it. Failures here are non-fatal.
    try {
      await notifyAdmins({ ticketId: ticket.id, user, type: body.type, title: body.title, content: body.content, ip });
    } catch (e) {
      console.error('ticket email notify error', e);
    }

    return NextResponse.json({ ticket: { id: ticket.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Invalid request' }, { status: 400 });
    }
    console.error('ticket submit error', e);
    return NextResponse.json({ error: '提交失败，请稍后再试' }, { status: 500 });
  }
}

const TYPE_LABELS: Record<string, string> = {
  feedback: '反馈',
  emailChange: '更改邮箱',
  appeal: '申诉',
  other: '其他',
};

// Email every admin (isAdmin=true, super-admin group, or ADMIN_USERNAME) that has a
// verified email, telling them a new ticket needs handling and linking to the panel.
async function notifyAdmins(args: {
  ticketId: string;
  user: { username: string; displayName: string; email: string | null };
  type: string;
  title: string;
  content: string;
  ip: string | null;
}) {
  const admins = await prisma.user.findMany({
    where: {
      email: { not: null },
      OR: [
        { isAdmin: true },
        { group: { is: { isAdminGroup: true } } },
        { username: { in: (process.env.ADMIN_USERNAME || '').split(',').map((s) => s.trim()).filter(Boolean) } },
      ],
    },
    select: { email: true },
  });
  const emails = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
  if (emails.length === 0) return;

  const typeLabel = TYPE_LABELS[args.type] || args.type;
  const from = process.env.RESEND_FROM_EMAIL || 'no-reply@example.com';
  const link = siteUrl('/admin/tickets');
  const handleLink = `${link}?focus=${args.ticketId}`;

  await sendEmail({
    from,
    to: emails,
    subject: `【Cloudflare OS】新的${typeLabel}工单：${args.title}`,
    text: `有用户提交了一则${typeLabel}工单。\n\n提交人：${args.user.displayName}（@${args.user.username}）\nIP 地址：${args.ip || '未知'}\n标题：${args.title}\n内容：${args.content}\n\n点击前往处理：${handleLink}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff;border:1px solid #eee;border-radius:12px;">
        <h2 style="margin:0 0 16px;color:#111;">新的${typeLabel}工单</h2>
        <p style="color:#555;line-height:1.6;margin:0 0 16px;">有用户提交了一则工单，请及时处理。</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
          <tr><td style="padding:6px 0;color:#888;width:90px;">提交人</td><td style="padding:6px 0;">${args.user.displayName}（@${args.user.username}）</td></tr>
          <tr><td style="padding:6px 0;color:#888;">IP 地址</td><td style="padding:6px 0;">${args.ip || '未知'}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">标题</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(args.title)}</td></tr>
        </table>
        <div style="margin:16px 0;padding:14px;background:#f7f7f7;border-radius:8px;font-size:14px;line-height:1.7;color:#444;">
          ${escapeHtml(args.content).replace(/\n/g, '<br/>')}
        </div>
        <a href="${handleLink}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">点击前往处理</a>
        <p style="color:#999;font-size:12px;margin:20px 0 0;">此邮件由系统自动发送，请勿直接回复。</p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
