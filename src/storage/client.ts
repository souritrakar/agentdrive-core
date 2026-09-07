import { S3Client } from "@aws-sdk/client-s3";

export type StorageConfig = {
  /** R2: https://<account-id>.r2.cloudflarestorage.com — omit for AWS S3. */
  endpoint?: string;
  /** R2 requires "auto"; AWS S3 wants a real region like "us-east-1". */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * S3-API storage client, runtime-agnostic (Node, serverless, Workers).
 *
 * Points at Cloudflare R2 today. Migrating to AWS S3 means dropping `endpoint`
 * and using a real region — no call-site changes.
 *
 * The bucket is deliberately not part of the config: this app manages many
 * buckets, so every operation in `buckets.ts` and `objects.ts` names its own.
 */
export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    /*
      Both default to "WHEN_SUPPORTED" in SDK v3, which adds x-amz-checksum-*
      and x-amz-sdk-checksum-algorithm to the *signature* of a presigned PUT.
      The browser then PUTs without those headers and R2 rejects the request as
      SignatureDoesNotMatch — a failure that looks like a CORS or credentials
      problem and is neither.

      "WHEN_REQUIRED" keeps checksums for the operations that genuinely need
      them and leaves presigned URLs signing only what the client will actually
      send. Non-AWS S3 implementations are exactly why these knobs exist.
    */
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // R2 accepts virtual-hosted style (the SDK default); flip this to true if
    // a provider ever needs path-style URLs instead.
    forcePathStyle: false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export type StorageClient = S3Client;
