import {
  CreateBucketCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

import type { StorageClient } from "./client";
import { StorageError, toStorageError } from "./errors";
import type { BucketSummary } from "./types";

export const BUCKET_NAME_MIN = 3;
export const BUCKET_NAME_MAX = 63;

/**
 * R2 bucket naming rules, checked before we spend a round trip.
 *
 * Runs in the browser for immediate feedback and again in the Worker as the
 * real gate — never trust the client-side pass.
 *
 * Returns null when valid, or a message written for a user to read.
 */
export function validateBucketName(name: string): string | null {
  if (name.length < BUCKET_NAME_MIN || name.length > BUCKET_NAME_MAX) {
    return `Name must be ${BUCKET_NAME_MIN}–${BUCKET_NAME_MAX} characters.`;
  }
  if (name !== name.toLowerCase()) {
    return "Name must be lowercase.";
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return "Use only lowercase letters, numbers, and hyphens.";
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return "Name must start and end with a letter or number.";
  }
  if (name.includes("--")) {
    return "Name cannot contain consecutive hyphens.";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    return "Name cannot look like an IP address.";
  }
  return null;
}

export async function listBuckets(client: StorageClient): Promise<BucketSummary[]> {
  try {
    const response = await client.send(new ListBucketsCommand({}));
    return (response.Buckets ?? [])
      .filter((bucket): bucket is { Name: string; CreationDate?: Date } =>
        Boolean(bucket.Name),
      )
      .map((bucket) => ({
        name: bucket.Name,
        createdAt: bucket.CreationDate?.toISOString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    throw toStorageError(error, "list buckets");
  }
}

/**
 * CORS policy allowing a browser to upload and download directly against a
 * bucket via presigned URLs. Without it the browser blocks the request before
 * it leaves — the presigned URL itself is valid either way.
 *
 * `ETag` is exposed so an upload response can be read; the rest of the headers
 * are what the S3 SDK sends on a presigned PUT.
 */
export async function putBucketCors(
  client: StorageClient,
  bucket: string,
  allowedOrigins: string[],
): Promise<void> {
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: allowedOrigins,
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch (error) {
    throw toStorageError(error, `configure CORS on bucket "${bucket}"`);
  }
}

/**
 * Create a bucket and immediately apply the CORS policy, so a bucket is
 * uploadable the moment it appears in the sidebar.
 *
 * A CORS failure is not swallowed: the bucket exists at that point, and a
 * caller that reported success would leave uploads failing for reasons the
 * user cannot see.
 */
export async function createBucket(
  client: StorageClient,
  name: string,
  allowedOrigins: string[],
): Promise<BucketSummary> {
  const invalid = validateBucketName(name);
  if (invalid) {
    throw new StorageError("bucket_name_invalid", invalid);
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: name }));
  } catch (error) {
    throw toStorageError(error, `create bucket "${name}"`);
  }

  await putBucketCors(client, name, allowedOrigins);

  return { name, createdAt: new Date().toISOString() };
}
