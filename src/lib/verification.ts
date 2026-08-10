// Email verification-code flow: generate, send, verify.
// Codes are stored hashed (sha256) with an expiry; verified codes are marked used.

import crypto from 'node:crypto';
import { prisma } from './db';
import { sendVerificationEmail, resendConfigured } from './email';

export const CODE_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes
const CODE_LENGTH = 6;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function randomCode(): string {
  // 6 digits, avoiding a leading zero not needed; simple random.
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// Generate a code for an email, store it (hashing prior rows), send it, return the code
// (so the caller can show it in dev, or return a masked result).
export async function issueVerificationCode(email: string): Promise<{ sent: boolean; code: string }> {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);

  // Mark any outstanding codes for this email as used so only the newest is valid.
  await prisma.emailVerification.updateMany({
    where: { email, used: false },
    data: { used: true },
  });
  await prisma.emailVerification.create({
    data: { email, code: hashCode(code), expiresAt },
  });

  let sent = false;
  if (resendConfigured()) {
    await sendVerificationEmail(email, code);
    sent = true;
  }
  // If Resend isn't configured, we still return the code so a dev/self-hosted setup
  // can log it; in production the email should be sent.
  return { sent, code };
}

// Verify a user-supplied code for an email. Returns true and consumes the code if valid.
export async function verifyCode(email: string, code: string): Promise<boolean> {
  const normEmail = email.trim().toLowerCase();
  const record = await prisma.emailVerification.findFirst({
    where: { email: normEmail, used: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return false;
  if (record.expiresAt.getTime() < Date.now()) return false;
  if (record.code !== hashCode(code.trim())) return false;

  await prisma.emailVerification.update({
    where: { id: record.id },
    data: { used: true },
  });
  return true;
}
