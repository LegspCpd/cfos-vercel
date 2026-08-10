// Server-side human-verification (CAPTCHA) verification.
// Supports Cloudflare Turnstile and Google reCAPTCHA.
// Secrets are admin-configured (stored in AppSetting via the admin panel), NOT env vars.

import { getCaptchaSecret } from './settings';

export type CaptchaProvider = 'turnstile' | 'recaptcha';

// Verify a CAPTCHA token with the given provider's verification endpoint.
// Throws if the token is invalid.
export async function verifyCaptcha(
  provider: CaptchaProvider,
  token: string | undefined,
): Promise<void> {
  if (!token) {
    throw new Error('Human verification is required.');
  }

  const secret = await getCaptchaSecret(provider);
  if (!secret) {
    throw new Error('Human verification is not configured on the server.');
  }

  if (provider === 'turnstile') {
    await verifyTurnstile(token, secret);
  } else {
    await verifyRecaptcha(token, secret);
  }
}

async function verifyTurnstile(token: string, secret: string): Promise<void> {
  const form = new URLSearchParams({ secret, response: token });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!json.success) {
    throw new Error(`Human verification failed (${(json['error-codes'] || []).join(', ') || 'invalid token'})`);
  }
}

async function verifyRecaptcha(token: string, secret: string): Promise<void> {
  const form = new URLSearchParams({ secret, response: token });
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!json.success) {
    throw new Error(`Human verification failed (${(json['error-codes'] || []).join(', ') || 'invalid token'})`);
  }
}
