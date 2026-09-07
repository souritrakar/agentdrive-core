# Notes for agents working in this repo

A filesystem substrate over object storage. The catalog (Postgres) owns structure and integrity; the object store (S3/R2) only holds opaque, digest-keyed blobs.

- Next.js 16 + Turbopack, App Router, TypeScript. The control plane.
- The data plane is `workers/api` (Hono on Cloudflare Workers), edge-resident.
- Object keys are derived at the storage layer, never in the catalog. Treat the key layout as private to `src/storage`.
- Writes are two-phase (initiate, sign, commit). A partial upload must never surface as a node.
- Capabilities are explicit per mount. No ambient authority: if a call needs write or share, it carries the capability.
- Design system and tokens live under `docs/design-system` and `src/foundations`.

Keep the catalog and the object store decoupled. The whole point of the substrate is that the interface does not leak the storage backend.
