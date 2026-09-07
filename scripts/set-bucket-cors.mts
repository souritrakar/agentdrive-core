import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";

/**
 * Applies the CORS policy the browser needs to PUT directly to object storage.
 *
 * Presigned uploads go from the browser straight to R2, so the *bucket* has to
 * allow the app's origin — the Worker's own CORS headers are irrelevant to that
 * request. A bucket whose policy names one dev port therefore blocks uploads
 * from any other, and the failure is confusing: listing works, uploading fails
 * with an opaque network error.
 *
 * Uses the AWS SDK directly rather than `src/storage` because that module's
 * barrel re-exports are extensionless and Node's ESM loader can't resolve them
 * outside a bundler.
 *
 * Usage:
 *   node scripts/set-bucket-cors.mts http://localhost:3002 http://localhost:3000
 *
 * With no arguments it applies APP_ORIGIN from .env.local, falling back to the
 * local dev ports.
 */

loadEnv({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const origins =
  args.length > 0
    ? args
    : (process.env.APP_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
        "http://localhost:3002",
        "http://127.0.0.1:3002",
      ]);

const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error("S3_BUCKET is not set in .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["*"],
          // The upload response's ETag is how a client can verify what landed.
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log(`CORS applied to bucket "${bucket}":`);
for (const origin of origins) console.log(`  ${origin}`);
