// Email sending via Resend (https://resend.com). The API key lives in the Vercel
// environment variable RESEND_API_KEY — never in the admin panel or the codebase.

const RESEND_API = 'https://api.resend.com/emails';

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

interface ResendPayload {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

// Send an email through the Resend API. Throws on failure.
export async function sendEmail(payload: ResendPayload): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured on the server.');
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

// Compose + send a verification-code email.
export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL || 'no-reply@legspcpd.top';
  await sendEmail({
    from,
    to,
    subject: '【Cloudflare OS】你的验证码',
    text: `你的验证码是：${code}\n\n验证码 10 分钟内有效，请勿泄露给他人。\n如果你没有请求此验证码，请忽略本邮件。`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border:1px solid #eee;border-radius:12px;">
        <h2 style="margin:0 0 16px;color:#111;">验证你的邮箱</h2>
        <p style="color:#555;line-height:1.6;margin:0 0 8px;">你好！</p>
        <p style="color:#555;line-height:1.6;margin:0 0 20px;">
          你正在使用此邮箱注册 <strong>Cloudflare OS</strong>。你的验证码是：
        </p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;color:#111;background:#f5f5f5;border-radius:8px;padding:16px 0;margin:0 0 20px;">
          ${code}
        </div>
        <p style="color:#888;font-size:13px;line-height:1.6;margin:0 0 4px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
        <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">如果你没有请求此验证码，请忽略本邮件。</p>
      </div>
    `,
  });
}
