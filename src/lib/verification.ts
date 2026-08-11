// Email verification-code flow: generate, send, verify.
// Codes are stored hashed (sha256) with an expiry; verified codes are marked used.

import crypto from 'node:crypto';
import { prisma } from './db';
import { shardForTable } from './db-secondary';
import { sendVerificationEmail, resendConfigured } from './email';

// Verification-code lifetime, configurable via VERIFY_CODE_TTL_MINUTES (default 10 min).
export const CODE_LIFETIME_MS =
  (Number(process.env.VERIFY_CODE_TTL_MINUTES) || 10) * 60 * 1000;
const CODE_LENGTH = 6;

// The delegate for the secondary verification table, or null if not routed.
function secondaryVerification() {
  return shardForTable('verification')?.emailVerification ?? null;
}

// Structural type covering only the EmailVerification operations we use. The primary
// and secondary Prisma delegates are distinct TS types but share this shape, so typing
// against it lets us use either client interchangeably without casts.
interface VerificationOps {
  updateMany(args: { where: { email: string; used?: boolean }; data: { used: boolean } }): Promise<{ count: number }>;
  create(args: { data: { email: string; code: string; expiresAt: Date } }): Promise<{ id: string }>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  findFirst(args: {
    where: { email: string; used: boolean };
    orderBy: { createdAt: 'desc' };
  }): Promise<VerificationRow | null>;
  update(args: { where: { id: string }; data: { used: boolean } }): Promise<unknown>;
}

interface VerificationRow {
  id: string;
  email: string;
  code: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function randomCode(): string {
  // 6 digits; simple random.
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// Generate a code for an email, store it (hashing prior rows), send it, return the code
// (so the caller can show it in dev, or return a masked result).
// Throws if sending fails, and cleans up the just-created record in that case.
// STABILITY: if the configured secondary is unreachable, we transparently fall back
// to the primary so signup/email-change never breaks because of a cold-DB outage.
export async function issueVerificationCode(email: string): Promise<{ sent: boolean; code: string }> {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);

  // Choose the target: secondary if routed, else primary.
  const primary: VerificationOps = prisma.emailVerification;
  const secondaryRaw = secondaryVerification();
  const secondary: VerificationOps | null = secondaryRaw ? (secondaryRaw as unknown as VerificationOps) : null;
  const target: VerificationOps = secondary ?? primary;

  const write = async <T>(fn: (m: VerificationOps) => Promise<T>, fallback: (m: VerificationOps) => Promise<T>): Promise<T> => {
    try {
      return await fn(target);
    } catch (e) {
      // If the secondary failed (down / missing schema), fall back to primary so the
      // feature keeps working. Log once, then continue on the primary.
      if (secondary) {
        console.error('[multi-db] secondary verification write failed, falling back to primary', e);
        return await fallback(primary);
      }
      throw e;
    }
  };

  // Mark any outstanding codes for this email as used so only the newest is valid.
  const updateMany = (m: VerificationOps) => m.updateMany({ where: { email, used: false }, data: { used: true } });
  await write((m) => updateMany(m), (m) => updateMany(m));

  const record = await write(
    (m) => m.create({ data: { email, code: hashCode(code), expiresAt } }),
    (m) => m.create({ data: { email, code: hashCode(code), expiresAt } }),
  );

  let sent = false;
  if (resendConfigured()) {
    try {
      await sendVerificationEmail(email, code);
      sent = true;
    } catch (e) {
      // Sending failed — remove the orphaned code so a retry isn't blocked, then rethrow.
      await target.delete({ where: { id: record.id } }).catch(() => {});
      throw e;
    }
  }
  // If Resend isn't configured, we still return the code so a dev/self-hosted setup
  // can log it; in production the email should be sent.
  return { sent, code };
}

// Verify a user-supplied code for an email. Returns true and consumes the code if valid.
// Searches across the primary and any secondary that holds verification rows, so codes
// issued before/after multi-db enabling both verify correctly.
export async function verifyCode(email: string, code: string): Promise<boolean> {
  const normEmail = email.trim().toLowerCase();
  const codeHash = hashCode(code.trim());
  const lookups: { find: () => Promise<VerificationRow | null>; markUsed: (id: string) => Promise<void> }[] = [
    {
      find: () => prisma.emailVerification.findFirst({ where: { email: normEmail, used: false }, orderBy: { createdAt: 'desc' } }) as Promise<VerificationRow | null>,
      markUsed: (id) => prisma.emailVerification.update({ where: { id }, data: { used: true } }).then(() => undefined),
    },
  ];
  const secondary = secondaryVerification();
  if (secondary) {
    lookups.push({
      find: () => secondary.findFirst({ where: { email: normEmail, used: false }, orderBy: { createdAt: 'desc' } }) as Promise<VerificationRow | null>,
      markUsed: (id) => secondary.update({ where: { id }, data: { used: true } }).then(() => undefined),
    });
  }

  for (const lookup of lookups) {
    const record = await lookup.find().catch(() => null);
    if (!record) continue;
    if (record.expiresAt.getTime() < Date.now()) continue;
    if (record.code !== codeHash) continue;
    await lookup.markUsed(record.id).catch(() => {});
    return true;
  }
  return false;
}
