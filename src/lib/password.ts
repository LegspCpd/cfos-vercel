import argon2 from 'argon2';

// Server-side password hashing (argon2id). The original Cloudflare OS did client-side
// argon2 with a shared salt; here we hash on the server for simplicity and safety.
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    parallelism: 1,
    memoryCost: 64 * 1024, // 64 MiB
    timeCost: 3,
  });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
