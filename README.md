# agentdrive-core

A programmable filesystem substrate for autonomous agents.

Agents that touch files today drop straight to raw object storage and end up babysitting buckets, signed URLs, key layouts, and lifecycle rules by hand. agentdrive-core sits in that gap: a POSIX-shaped surface over commodity object storage, so an agent gets a real filesystem instead of a key-value bucket.

Content-addressed nodes, per-agent namespaces, and a capability-scoped mount API for scratch and durable state. The bucket is the block device. This is the VFS on top of it.

## Model

- **Content-addressed store.** Every object is keyed by its digest, so writes dedupe, reads verify, and history is cheap.
- **Namespaces.** Each agent (or run) gets an isolated mount. No shared mutable root, no cross-tenant key collisions.
- **Capability-scoped mounts.** A mount is handed out with an explicit capability set (read, write, list, share). No ambient authority.
- **Two-phase writes.** Large objects go through an initiate/sign/commit handshake so a partial upload never becomes a visible node.
- **Metadata in Postgres, bytes in object storage.** The catalog owns structure, naming, and integrity digests; the object store only ever sees opaque keys.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Cloudflare Workers (Hono), edge-resident |
| Catalog | Postgres (Neon serverless driver) |
| Object store | S3-compatible (R2) |
| Control plane | Next.js 16 (App Router, Turbopack, TS) |
| Auth | Clerk |

## Layout

```
src/          the VFS: storage, transfer, sharing, filesystem primitives
workers/api/  the edge data plane (Hono on Workers)
prisma/       the catalog schema
docs/         design system and notes
```

Built mostly for my own agents, because raw object storage is the right substrate and the wrong interface.
