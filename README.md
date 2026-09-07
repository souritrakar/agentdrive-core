# agentdrive-core

A programmable filesystem substrate for autonomous agents. A POSIX-shaped virtual filesystem layered over commodity object storage, so an agent gets a real tree with namespaces, capabilities, and integrity guarantees instead of a flat key-value bucket it has to babysit.

Object storage is the right block device and the wrong interface. This is the VFS that sits on top of it.

```
        agent / control plane
                 │
        ┌────────▼─────────┐        capability-scoped mounts
        │   mount / VFS    │  ◄───   per-agent namespaces
        └────────┬─────────┘
                 │  logical ops (open, stat, write, link, share)
        ┌────────▼─────────┐
        │   catalog (PG)   │        structure • naming • digests • tenancy
        └────────┬─────────┘
                 │  opaque digest-keyed blobs
        ┌────────▼─────────┐
        │  object store    │        S3 / R2 — dumb, durable, content-addressed
        └──────────────────┘
```

## Design

- **Content-addressed nodes.** Every blob is keyed by its digest. Writes dedupe, reads verify against the digest, and identical content is stored once regardless of how many paths point at it. The catalog holds the logical pointer, the object store holds bytes under an opaque key it never has to interpret.
- **Metadata / bytes split.** The catalog (Postgres) is the single source of truth for tree structure, names, and integrity. The object store only ever sees flat, opaque keys. Folder names never live in object keys, so a rename is a catalog transaction, not an O(n) copy across the bucket.
- **Per-agent namespaces.** Each agent (or run) gets an isolated mount rooted at its own namespace. No shared mutable root, no cross-tenant key collision, no "one bucket per drive" sprawl.
- **Capability-scoped mounts.** A mount is issued with an explicit capability set — `read`, `write`, `list`, `share`. No ambient authority: a call that needs to write carries the write capability or it is refused at the boundary.
- **Two-phase writes.** Large objects go through `initiate → sign → commit`. Parts are presigned and uploaded straight to the store; the node only becomes visible on commit. A dropped connection leaves an orphaned upload session, never a half-written, readable file.
- **Edge-resident data plane.** The API runs on Cloudflare Workers (Hono) next to the object store, so signing and metadata round-trips do not bounce through a central origin.

## Stack

| Layer | Choice |
| --- | --- |
| Control plane | Next.js 16 (App Router, Turbopack, TypeScript) |
| Data plane | Cloudflare Workers + Hono, edge-resident |
| Catalog | Postgres via the Neon serverless driver (`@prisma/adapter-neon`) |
| Object store | S3-compatible — Cloudflare R2 (`S3_REGION=auto`), AWS S3 drop-in |
| Auth | Clerk (nullable account scope when unconfigured) |
| UI | Tailwind v4 + shadcn/ui, Storybook workbench |

## Prerequisites

- Node `24.x` (see `.nvmrc`) and `pnpm`
- A Postgres database — Neon project, or any Postgres reachable over the serverless driver
- An S3-compatible bucket + credentials (R2 API token, or an AWS IAM user)
- `wrangler` for the Worker (bundled via `pnpm`)
- Clerk keys are optional in dev — without them the app runs in a null-auth single-tenant scope

## Setup

```bash
nvm use                      # pins Node to .nvmrc
pnpm install                 # postinstall runs prisma generate

cp .env.example .env.local   # then fill in the values below
```

Required environment (see `.env.example` for the full annotated set):

```bash
DATABASE_URL=            # Neon POOLED connection (host has "-pooler"); runtime
DIRECT_URL=              # same DB, NON-pooled host; Prisma Migrate needs session state
S3_ENDPOINT=             # https://<account>.r2.cloudflarestorage.com
S3_REGION=auto           # R2 requires "auto"; a real region for AWS
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
```

Migrate the catalog and set bucket CORS so the browser can talk to the store directly:

```bash
pnpm db:migrate              # apply migrations over DIRECT_URL
pnpm db:generate             # regenerate the client into src/generated/prisma
pnpm storage:cors            # push the CORS policy to the bucket
```

## Running locally

Two long-lived processes. Neither starts the other — run them in separate panes.

```bash
# pane 1 — the edge data plane (Hono on Workers)
pnpm worker:dev              # binds :8787

# pane 2 — the control plane (Next.js)
pnpm dev                     # binds :3001
```

Then open `http://localhost:3001`. The frontend talks to the Worker over `NEXT_PUBLIC_API_URL`; if that port is wrong the tree loads empty and every mutation 502s.

| Process | Port | Pinned in |
| --- | --- | --- |
| Control plane (Next.js) | `3001` | `package.json` (`next dev --port 3001`) |
| Data plane (Worker) | `8787` | `NEXT_PUBLIC_API_URL` / `wrangler dev` |

## Common commands

```bash
pnpm db:studio               # inspect the catalog
pnpm db:status               # migration drift check
pnpm worker:deploy           # ship the data plane
pnpm worker:secrets          # sync Worker secrets from env
pnpm storybook               # component workbench
pnpm test:storage            # object-store contract tests
pnpm test:filesystem         # VFS integration tests
pnpm test:transfer           # two-phase upload tests
pnpm test:sharing            # capability / share-token tests
pnpm typecheck && pnpm lint
```

## Layout

```
src/
  storage/        S3 client, buckets, objects, two-phase multipart, presigning
  filesystem/     the VFS: nodes, trails, cursors, invariants
  transfer/       upload orchestration + object-store limits
  sharing/        capability tokens, share previews, scoped access
  foundations/    design tokens + Storybook specimens
workers/api/      the edge data plane (Hono): routes, auth, validation, scope
prisma/           the catalog schema
docs/             design system + operating notes
```

## Notes

- The object-store layer is deliberately backend-agnostic: nothing in `src/storage` or its call sites changes between R2 and AWS S3. Swap the endpoint and region.
- Key derivation is private to the storage layer. The catalog never sees an object key and code above `src/storage` never constructs one.
- `pnpm test:db` refuses the application database and only runs against `TEST_DATABASE_URL` (a disposable Neon branch), so a test run can never truncate real tenant data.
- Built mostly for my own agents. Raw buckets are a fine substrate and a hostile interface; this is the interface.
