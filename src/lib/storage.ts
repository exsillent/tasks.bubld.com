import "server-only";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.S3_ATTACHMENTS_BUCKET;
const region = process.env.AWS_REGION ?? "us-east-1";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) client = new S3Client({ region });
  return client;
}

function requireBucket(): string {
  if (!BUCKET) {
    throw new Error("S3_ATTACHMENTS_BUCKET is not configured.");
  }
  return BUCKET;
}

/**
 * A short-lived (5 min) presigned PUT URL so uploads go browser -> S3
 * directly -- the file never passes through this Node process. `key` is
 * generated server-side (never trusts a client-supplied path) so an
 * attacker can't overwrite an unrelated object.
 */
export async function createUploadUrl(
  ownerContext: "task" | "comment",
  contentType: string,
): Promise<{ url: string; key: string }> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Only image uploads (png/jpeg/webp/gif) are allowed.");
  }

  const key = `${ownerContext}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const url = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  return { url, key };
}

/** Short-lived (5 min) presigned GET URL for viewing a private attachment. */
export async function createViewUrl(key: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: requireBucket(), Key: key }),
    { expiresIn: 300 },
  );
}

export async function deleteAttachment(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: requireBucket(), Key: key }));
}

/**
 * Verifies an object actually exists at `key` and isn't oversized, by
 * asking S3 directly -- never trusts a client-reported size, since the
 * upload itself happened browser-to-S3 with no server involvement.
 * Deletes and rejects anything over the limit.
 */
export async function verifyUploadedObject(key: string): Promise<void> {
  const result = await getClient().send(
    new HeadObjectCommand({ Bucket: requireBucket(), Key: key }),
  );
  if ((result.ContentLength ?? 0) > MAX_UPLOAD_BYTES) {
    await deleteAttachment(key);
    throw new Error("File is too large (max 15MB).");
  }
}

export const MAX_ATTACHMENT_BYTES = MAX_UPLOAD_BYTES;
