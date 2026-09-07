export type Bindings = {
  DATABASE_URL: string;
  // Object storage over the S3 API — same vars for R2 today, AWS S3 later.
  S3_ENDPOINT: string;
  S3_REGION: string;
  /** The bucket created during setup. Only used to seed an empty sidebar. */
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  /**
   * Comma-separated origins allowed to upload directly to R2 via presigned
   * URLs. Written into each bucket's CORS policy at creation time, and also
   * the list of `azp` values a session token may carry — see lib/auth.ts.
   */
  APP_ORIGIN?: string;
  /**
   * Clerk. Required: every data route refuses to serve without it, rather
   * than falling back to a shared tenant the way this Worker used to.
   *
   * `verifyToken` uses the secret only to fetch and cache Clerk's public JWKS.
   * The signature check itself is local, so this is not on the network path of
   * a normal request.
   */
  CLERK_SECRET_KEY?: string;
  /** Not used for verification — carried so `clerk doctor`-style checks can. */
  CLERK_PUBLISHABLE_KEY?: string;
  /**
   * Opt-in for the raw `/buckets/*` storage routes, which are a debugging
   * surface and not part of the product API.
   *
   * Off unless this is exactly "true". They take a bucket and an object key
   * straight from the request, and today's key layout (`drives/<id>/<id>`)
   * carries no tenant prefix — so there is nothing for an authenticated
   * request to be constrained *to*. Any signed-in user could therefore mint a
   * presigned URL for any other user's object. Authentication alone does not
   * fix that; only a tenant-prefixed key layout would, and that is a storage
   * change rather than an auth one.
   *
   * Until then the honest default is off, so the surface cannot be reached in
   * a deployment at all. See workers/api/src/index.ts.
   */
  ENABLE_RAW_STORAGE_ROUTES?: string;
};

export type AppEnv = { Bindings: Bindings };

const DEFAULT_ORIGIN = "http://localhost:3000";

export function allowedOrigins(env: Bindings): string[] {
  return (env.APP_ORIGIN ?? DEFAULT_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** See the field note above. Exact string match, so a typo fails closed. */
export function rawStorageRoutesEnabled(env: Bindings): boolean {
  return env.ENABLE_RAW_STORAGE_ROUTES === "true";
}
