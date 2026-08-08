import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from './db';

// R2 is S3-compatible. We use the AWS SDK pointed at the R2 endpoint.
// Configure via env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.

let cachedClient: S3Client | null = null;

function getBucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error('R2_BUCKET is not configured.');
  return b;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export interface R2UploadInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

export async function r2Put(input: R2UploadInput): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function r2Delete(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

// Generate a presigned download URL. This is a direct R2 link (does NOT proxy through Vercel),
// so download traffic does not consume your Vercel quota.
export async function r2GetPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

// List shared files for a user, deleting any that are already expired (lazy cleanup).
export async function listSharedFiles(ownerId: string) {
  const now = new Date();
  // Delete expired entries lazily.
  await prisma.sharedFile.deleteMany({ where: { ownerId, expiresAt: { lt: now } } });
  return prisma.sharedFile.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });
}

// Delete a shared file record + its R2 object.
export async function deleteSharedFile(id: string, ownerId: string): Promise<boolean> {
  const file = await prisma.sharedFile.findFirst({ where: { id, ownerId } });
  if (!file) return false;
  try {
    if (isR2Configured()) await r2Delete(file.r2Key);
  } catch (e) {
    console.error('r2 delete failed', e);
  }
  await prisma.sharedFile.delete({ where: { id } });
  return true;
}
