import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

import { env } from '../env.js';

// Everything below talks to the bucket purely through the standard AWS S3
// API. Cloudflare R2 (what we use for free) and AWS S3 (where this may move
// to later) both speak that same API — so this file is the ENTIRE storage
// layer, for either host. Moving providers means changing S3_ENDPOINT /
// S3_REGION / credentials in .env, not this code. `forcePathStyle` is the
// one setting R2 needs that AWS S3 doesn't strictly require but also
// accepts, so it's safe to leave on for both.
//
// The S3_* vars are optional at boot (see env.ts) — auth, pairing, and the
// couple-proximity feature don't need a bucket at all, so a server with no
// R2 account yet can still serve those. Every exported function below
// throws a clear, catchable error instead of touching a null client when
// storage isn't configured; uploads.ts/generations.ts turn that into a 503
// rather than letting it 500 as an unhandled crash.
const isConfigured =
  !!env.S3_ENDPOINT && !!env.S3_REGION && !!env.S3_BUCKET && !!env.S3_ACCESS_KEY_ID && !!env.S3_SECRET_ACCESS_KEY;

const s3 = isConfigured
  ? new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export function isStorageConfigured(): boolean {
  return isConfigured;
}

function requireS3(): S3Client {
  if (!s3) {
    throw new Error(
      'Object storage isn’t configured yet — set S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY in server/.env.',
    );
  }
  return s3;
}

const PRESIGN_TTL_SECONDS = 5 * 60;

/**
 * Builds a short-lived, one-time upload URL for a client to PUT a photo
 * directly to storage. Doing it this way (rather than routing the raw photo
 * bytes through our own server) keeps our free-tier compute instance out of
 * the upload path entirely — it never sees the bytes, just the resulting key.
 */
export async function createUploadUrl(params: {
  userId: string;
  contentType: string;
}): Promise<{ key: string; uploadUrl: string }> {
  const extension = params.contentType === 'image/png' ? 'png' : 'jpg';
  const key = `uploads/${params.userId}/${randomUUID()}.${extension}`;

  const uploadUrl = await getSignedUrl(
    requireS3(),
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: params.contentType }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );

  return { key, uploadUrl };
}

/** Downloads an object's raw bytes — used server-side to hand input photos to the AI provider. */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const result = await requireS3().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Object body was empty for key: ${key}`);
  return Buffer.from(bytes);
}

/** Uploads a generated result image and returns the key it was stored under. */
export async function putObjectBytes(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await requireS3().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

/** Public URL a client can load an object from directly (bucket/CDN is public-read). */
export function publicUrlFor(key: string): string {
  return `${env.S3_PUBLIC_BASE_URL}/${key}`;
}
