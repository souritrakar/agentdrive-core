import { Prisma } from "@/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "@/db/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

function databaseIdentity(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/-pooler(?=\.)/, "");
  return `${url.protocol}//${url.username}@${host}:${url.port}/${url.pathname.replace(/^\//, "")}`;
}

if (testDatabaseUrl) {
  const testIdentity = databaseIdentity(testDatabaseUrl);
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const shared = process.env[name]?.trim();
    if (shared && databaseIdentity(shared) === testIdentity) {
      throw new Error(
        `Refusing database invariant tests: TEST_DATABASE_URL identifies the same database as ${name}.`,
      );
    }
  }
}

const db = testDatabaseUrl ? createDb(testDatabaseUrl) : null;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

type Fixture = {
  accountId: string;
  podId: string;
  driveId: string;
  rootId: string;
  fileId: string;
};

function uuid(): string {
  return crypto.randomUUID();
}

async function createFixture(client: Db): Promise<Fixture> {
  const fixture = {
    accountId: uuid(),
    podId: uuid(),
    driveId: uuid(),
    rootId: uuid(),
    fileId: uuid(),
  };

  await client.account.create({
    data: {
      id: fixture.accountId,
      email: `${fixture.accountId}@invariants.test`,
      pods: {
        create: {
          id: fixture.podId,
          name: "Test",
          slug: fixture.podId,
          isDefault: true,
          drives: {
            create: {
              id: fixture.driveId,
              name: "Test Drive",
              slug: fixture.driveId,
            },
          },
        },
      },
    },
  });
  await client.item.createMany({
    data: [
      {
        id: fixture.rootId,
        podId: fixture.podId,
        driveId: fixture.driveId,
        kind: "FOLDER",
        name: "Root",
      },
      {
        id: fixture.fileId,
        podId: fixture.podId,
        driveId: fixture.driveId,
        kind: "FILE",
        name: "bytes.bin",
        storageBucket: "test",
        storageKey: `test/${fixture.fileId}`,
        uploadStatus: "PENDING",
      },
    ],
  });
  return fixture;
}

async function cleanupFixture(client: Db, fixture: Fixture): Promise<void> {
  await client.item.deleteMany({ where: { podId: fixture.podId } });
  await client.drive.deleteMany({ where: { podId: fixture.podId } });
  await client.pod.delete({ where: { id: fixture.podId } });
  await client.account.delete({ where: { id: fixture.accountId } });
}

async function expectDatabaseRejection(
  operation: Promise<unknown>,
  marker?: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (marker) {
      expect(`${String(error)} ${JSON.stringify(error)}`).toContain(marker);
    }
    return;
  }
  throw new Error("Expected Postgres to reject an invalid write.");
}

describeDatabase("Drive/Item database invariants", () => {
  it("rejects out-of-scope and non-Folder parents", async () => {
    const first = await createFixture(db!);
    const second = await createFixture(db!);
    try {
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          INSERT INTO items (id, pod_id, drive_id, parent_id, kind, name, updated_at)
          VALUES (${uuid()}::uuid, ${first.podId}::uuid, ${first.driveId}::uuid,
                  ${second.rootId}::uuid, 'FOLDER'::item_kind, 'Escaped', now())
        `),
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          INSERT INTO items (id, pod_id, drive_id, parent_id, kind, name, updated_at)
          VALUES (${uuid()}::uuid, ${first.podId}::uuid, ${first.driveId}::uuid,
                  ${first.fileId}::uuid, 'FOLDER'::item_kind, 'Bad parent', now())
        `),
        "items_parent_must_be_folder",
      );
      const selfId = uuid();
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          INSERT INTO items (id, pod_id, drive_id, parent_id, kind, name, updated_at)
          VALUES (${selfId}::uuid, ${first.podId}::uuid, ${first.driveId}::uuid,
                  ${selfId}::uuid, 'FOLDER'::item_kind, 'Self', now())
        `),
        "items_not_self_parent_check",
      );
    } finally {
      await cleanupFixture(db!, second);
      await cleanupFixture(db!, first);
    }
  });

  it("rejects cycles and a sixty-fifth Folder level", async () => {
    const fixture = await createFixture(db!);
    try {
      const childId = uuid();
      await db!.item.create({
        data: {
          id: childId,
          podId: fixture.podId,
          driveId: fixture.driveId,
          parentId: fixture.rootId,
          kind: "FOLDER",
          name: "Child",
        },
      });
      await expectDatabaseRejection(
        db!.$transaction((tx) =>
          tx.item.update({
            where: { id: fixture.rootId },
            data: { parentId: childId },
          }),
        ),
        "items_hierarchy_acyclic",
      );

      let parentId: string | null = null;
      for (let depth = 1; depth <= 64; depth += 1) {
        const id = uuid();
        await db!.item.create({
          data: {
            id,
            podId: fixture.podId,
            driveId: fixture.driveId,
            parentId,
            kind: "FOLDER",
            name: `Depth ${depth}`,
          },
        });
        parentId = id;
      }
      await expectDatabaseRejection(
        db!.item.create({
          data: {
            podId: fixture.podId,
            driveId: fixture.driveId,
            parentId,
            kind: "FOLDER",
            name: "Depth 65",
          },
        }),
        "items_hierarchy_max_depth_64",
      );
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("enforces kind payloads, immutable kind, and metadata validation", async () => {
    const fixture = await createFixture(db!);
    try {
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          INSERT INTO items (
            id, pod_id, drive_id, kind, name, storage_bucket, storage_key,
            upload_status, updated_at
          ) VALUES (
            ${uuid()}::uuid, ${fixture.podId}::uuid, ${fixture.driveId}::uuid,
            'FOLDER'::item_kind, 'Payload folder', 'test', 'invalid/folder',
            'PENDING'::upload_status, now()
          )
        `),
        "items_kind_payload_check",
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          INSERT INTO items (id, pod_id, drive_id, kind, name, updated_at)
          VALUES (${uuid()}::uuid, ${fixture.podId}::uuid, ${fixture.driveId}::uuid,
                  'FILE'::item_kind, 'pointerless.bin', now())
        `),
        "items_kind_payload_check",
      );
      await expectDatabaseRejection(
        db!.item.update({
          where: { id: fixture.rootId },
          data: { kind: "FILE" },
        }),
        "items_kind_immutable",
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          UPDATE items SET size_bytes = -1 WHERE id = ${fixture.fileId}::uuid
        `),
        "items_size_bytes_nonnegative_check",
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          UPDATE items SET checksum_sha256 = 'wrong' WHERE id = ${fixture.fileId}::uuid
        `),
        "items_checksum_sha256_format_check",
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          UPDATE items SET name = 'bad/name' WHERE id = ${fixture.fileId}::uuid
        `),
        "items_name_no_path_separator_check",
      );
      await expectDatabaseRejection(
        db!.$executeRaw(Prisma.sql`
          UPDATE items SET client_id = 'retry' WHERE id = ${fixture.fileId}::uuid
        `),
        "items_client_id_request_hash_pair_check",
      );
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("enforces live sibling uniqueness but permits reuse after trash", async () => {
    const fixture = await createFixture(db!);
    try {
      await expectDatabaseRejection(
        db!.item.create({
          data: {
            podId: fixture.podId,
            driveId: fixture.driveId,
            kind: "FILE",
            name: "ROOT",
            storageBucket: "test",
            storageKey: `test/${uuid()}`,
            uploadStatus: "PENDING",
          },
        }),
        "items_unique_live_name_per_parent",
      );
      await db!.item.update({
        where: { id: fixture.rootId },
        data: { deletedAt: new Date() },
      });
      const replacement = await db!.item.create({
        data: {
          podId: fixture.podId,
          driveId: fixture.driveId,
          kind: "FOLDER",
          name: "root",
        },
      });
      expect(replacement.name).toBe("root");
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("guards upload terminals and refuses hard Drive deletion", async () => {
    const fixture = await createFixture(db!);
    try {
      await db!.item.update({
        where: { id: fixture.fileId },
        data: { uploadStatus: "READY" },
      });
      await expectDatabaseRejection(
        db!.item.update({
          where: { id: fixture.fileId },
          data: { uploadStatus: "FAILED" },
        }),
        "items_upload_status_transition",
      );
      await expectDatabaseRejection(
        db!.drive.delete({ where: { id: fixture.driveId } }),
      );
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });
});

afterAll(async () => {
  await db?.$disconnect();
});
