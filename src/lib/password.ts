import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

// Password hashing using Node's built-in crypto.scrypt.
//
// WHY: the original implementation used the `argon2` native module, which must be compiled
// per-platform. On serverless hosts like Vercel the native binary isn't built, causing a
// 500 error. `crypto.scrypt` is built into Node, is pure JS (no native compile), and is
// secure (NIST-approved KDF). This works on every platform with zero build issues.
//
// Format: scrypt$<salt_hex>$<hash_hex>  (salt + derived key, hex encoded)
const KEYLEN = 64; // 64-byte derived key
const N = 16384; // CPU/memory cost (scrypt N = 2^14)

// Promise wrapper around Node's callback-based scrypt.
function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keylen, { N, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const parts = hash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const derived = await scrypt(password, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
