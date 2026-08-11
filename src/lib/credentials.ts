// Encrypt/decrypt sensitive credentials (SSH passwords, private keys) at rest.
//
// Uses AES-256-GCM with a key derived from AUTH_SECRET via SHA-256. The ciphertext is
// base64 `iv:tag:data`, so no plaintext ever hits the database. AUTH_SECRET is required
// in production (see src/lib/auth.ts for the same enforcement).
//
// SECURITY: the encryption key is derived from the same secret that protects session
// tokens, so a DB leak alone does not expose credentials — an attacker needs the secret.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  const raw = process.env.AUTH_SECRET;
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production to encrypt credentials.');
  }
  const secret = raw || 'insecure-dev-secret-change-me';
  return createHash('sha256').update(`credentials:${secret}`).digest();
}

// Encrypt a plaintext string. Returns base64 "iv:authTag:ciphertext".
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

// Decrypt a value produced by encryptSecret. Returns null on any failure (bad format,
// wrong key, tampered ciphertext) rather than throwing.
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv(ALGO, deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
