import { Prisma } from "@/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "@/db/client";
import type { Scope } from "@/db/scope";
import { createFilesystem } from "./filesystem";
import { createFileMetadata } from "./file-metadata";
import {
  DriveNotFoundError,
  FolderCycleError,
  IdempotencyConflictError,
  InvalidParentKindError,
  InvalidUploadTransitionError,
  ItemNameConflictError,
  ItemNotFoundError,
} from "./errors";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

function databaseIdentity(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/-pooler(?=\.)/, "");
  return `${url.protocol}//${url.username}@${host}:${url.port}/${url.pathname.replace(/^\//, "")}`;
}

function refuseSharedDatabase(url: string | undefined): void {
  if (!url) return;

  const testIdentity = databaseIdentity(url);
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const shared = process.env[name]?.trim();
    if (shared && databaseIdentity(shared) === testIdentity) {
      throw new Error(
        `Refusing filesystem integration tests: TEST_DATABASE_URL identifies the same database as ${name}.`,
      );
    }
  }
}

refuseSharedDatabase(testDatabaseUrl);

const db = testDatabaseUrl ? createDb(testDatabaseUrl) : null;
const filesystem = db ? createFilesystem(db) : null;
const transfer = db ? createFileMetadata(db) : null;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

type Fixture = {
  accountId: string;
  podId: string;
  driveId: string;
  alphaId: string;
  leafId: string;
  fileId: string;
  scope: Scope;
};

function uuid(): string {
  return crypto.randomUUID();
}

async function createFixture(client: Db): Promise<Fixture> {
  const accountId = uuid();
  const podId = uuid();
  const driveId = uuid();
  const alphaId = uuid();
  const leafId = uuid();
  const zetaId = uuid();
  const fileId = uuid();

  await client.$transaction([
    client.$executeRaw(Prisma.sql`
      INSERT INTO accounts (id, email, updated_at)
      VALUES (${accountId}::uuid, ${`${accountId}@filesystem.test`}, now())
    `),
    client.$executeRaw(Prisma.sql`
      INSERT INTO pods (
        id, account_id, name, slug, is_default, updated_at
      ) VALUES (
        ${podId}::uuid, ${accountId}::uuid, 'Test', ${podId}, true, now()
      )
    `),
    client.$executeRaw(Prisma.sql`
      INSERT INTO drives (id, pod_id, name, slug, updated_at)
      VALUES (
        ${driveId}::uuid, ${podId}::uuid, 'Test Drive', ${driveId}, now()
      )
    `),
  ]);

  await client.$executeRaw(Prisma.sql`
    INSERT INTO items (
      id, pod_id, drive_id, parent_id, kind, name,
      storage_bucket, storage_key, upload_status, updated_at
    ) VALUES
      (${alphaId}::uuid, ${podId}::uuid, ${driveId}::uuid, NULL,
       'FOLDER'::item_kind, 'Alpha', NULL, NULL, NULL, now()),
      (${leafId}::uuid, ${podId}::uuid, ${driveId}::uuid, ${alphaId}::uuid,
       'FOLDER'::item_kind, 'Leaf', NULL, NULL, NULL, now()),
      (${zetaId}::uuid, ${podId}::uuid, ${driveId}::uuid, NULL,
       'FOLDER'::item_kind, 'zeta', NULL, NULL, NULL, now()),
      (${fileId}::uuid, ${podId}::uuid, ${driveId}::uuid, NULL,
       'FILE'::item_kind, 'beta.txt', 'test', ${`test/${fileId}`},
       'READY'::upload_status, now())
  `);

  return {
    accountId,
    podId,
    driveId,
    alphaId,
    leafId,
    fileId,
    scope: { accountId, podId },
  };
}

async function cleanupFixture(client: Db, fixture: Fixture): Promise<void> {
  await client.$executeRaw(Prisma.sql`
    DELETE FROM items WHERE pod_id = ${fixture.podId}::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM drives WHERE pod_id = ${fixture.podId}::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM pods WHERE id = ${fixture.podId}::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM accounts WHERE id = ${fixture.accountId}::uuid
  `);
}

describeDatabase("filesystem reads against Postgres", () => {
  it("keyset-pages scoped Drives and groups direct child counts", async () => {
    const fixture = await createFixture(db!);
    const olderDriveId = uuid();
    const olderFolderId = uuid();

    try {
      await db!.$executeRaw(Prisma.sql`
        INSERT INTO drives (id, pod_id, name, slug, updated_at)
        VALUES (
          ${olderDriveId}::uuid,
          ${fixture.podId}::uuid,
          'Older Drive',
          ${olderDriveId},
          now() - interval '1 day'
        )
      `);
      await db!.$executeRaw(Prisma.sql`
        INSERT INTO items (
          id, pod_id, drive_id, parent_id, kind, name, updated_at
        )
        VALUES (
          ${olderFolderId}::uuid,
          ${fixture.podId}::uuid,
          ${olderDriveId}::uuid,
          NULL,
          'FOLDER'::item_kind,
          'Only child',
          now()
        )
      `);

      const first = await filesystem!.listDrives(fixture.scope, {
        limit: 1,
        includeChildCounts: true,
      });
      expect(first.drives).toEqual([
        expect.objectContaining({ id: fixture.driveId, childCount: 3 }),
      ]);
      expect(first.nextCursor).toBeTypeOf("string");

      const second = await filesystem!.listDrives(fixture.scope, {
        limit: 1,
        cursor: first.nextCursor,
        includeChildCounts: true,
      });
      expect(second.drives).toEqual([
        expect.objectContaining({ id: olderDriveId, childCount: 1 }),
      ]);
      expect(second.nextCursor).toBeNull();
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("pages one unified folders-first root listing with grouped counts", async () => {
    const fixture = await createFixture(db!);

    try {
      const first = await filesystem!.listFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        limit: 2,
        includeChildCounts: true,
      });

      expect(first.currentFolder).toBeNull();
      expect(first.ancestors).toEqual([]);
      expect(first.items.map((item) => [item.kind, item.name])).toEqual([
        ["FOLDER", "Alpha"],
        ["FOLDER", "zeta"],
      ]);
      expect(first.items[0]?.childCount).toBe(1);
      expect(first.items[1]?.childCount).toBe(0);
      expect(first.nextCursor).toBeTypeOf("string");

      const second = await filesystem!.listFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        cursor: first.nextCursor,
        limit: 2,
        includeChildCounts: true,
      });

      expect(second.items.map((item) => [item.kind, item.name])).toEqual([
        ["FILE", "beta.txt"],
      ]);
      expect(second.nextCursor).toBeNull();
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("returns root-to-leaf breadcrumbs without exposing internal metadata", async () => {
    const fixture = await createFixture(db!);

    try {
      const page = await filesystem!.listFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: fixture.leafId,
      });

      expect(page.currentFolder).toMatchObject({
        id: fixture.leafId,
        kind: "FOLDER",
        contentType: null,
        sizeBytes: null,
        uploadStatus: null,
      });
      expect(page.ancestors).toEqual([
        { id: fixture.alphaId, name: "Alpha" },
      ]);
      expect(page.currentFolder).not.toHaveProperty("podId");
      expect(page.currentFolder).not.toHaveProperty("storageKey");
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("makes foreign and missing IDs indistinguishable", async () => {
    const own = await createFixture(db!);
    const foreign = await createFixture(db!);

    try {
      await expect(
        filesystem!.listFolder(own.scope, {
          driveId: foreign.driveId,
          parentId: null,
        }),
      ).rejects.toBeInstanceOf(DriveNotFoundError);

      await expect(
        filesystem!.listFolder(own.scope, {
          driveId: own.driveId,
          parentId: uuid(),
        }),
      ).rejects.toBeInstanceOf(ItemNotFoundError);

      await expect(
        transfer!.getDownload(own.scope, foreign.fileId),
      ).rejects.toBeInstanceOf(ItemNotFoundError);
    } finally {
      await cleanupFixture(db!, foreign);
      await cleanupFixture(db!, own);
    }
  });

  it("creates and mutates hierarchy metadata without changing byte pointers", async () => {
    const fixture = await createFixture(db!);
    try {
      const folder = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Launch",
      });
      const child = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: folder.id,
        name: "Plans",
      });
      const renamed = await filesystem!.renameItem(
        fixture.scope,
        child.id,
        "Roadmap",
      );
      expect(renamed.name).toBe("Roadmap");

      const moved = await filesystem!.moveItem(fixture.scope, child.id, null);
      expect(moved.previous).toEqual({
        parentId: folder.id,
        name: "Roadmap",
      });
      expect(moved.item.parentId).toBeNull();

      const reservation = await transfer!.reserveFile(
        fixture.scope,
        {
          driveId: fixture.driveId,
          parentId: folder.id,
          name: "release.txt",
          contentType: "text/plain",
          sizeBytes: 7,
          storageBucket: "test",
        },
      );
      const pointerBefore = await db!.item.findUniqueOrThrow({
        where: { id: reservation.item.id },
        select: { storageBucket: true, storageKey: true },
      });
      await transfer!.setFileStatus(
        fixture.scope,
        reservation.item.id,
        "READY",
      );
      await filesystem!.renameItem(
        fixture.scope,
        reservation.item.id,
        "release-final.txt",
      );
      await filesystem!.moveItem(fixture.scope, reservation.item.id, null);
      await filesystem!.trashItem(fixture.scope, reservation.item.id);
      await filesystem!.restoreItem(fixture.scope, reservation.item.id);
      const pointerAfter = await db!.item.findUniqueOrThrow({
        where: { id: reservation.item.id },
        select: { storageBucket: true, storageKey: true },
      });
      expect(pointerAfter).toEqual(pointerBefore);
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("enforces explicit conflicts, idempotency, cycles, and upload terminals", async () => {
    const fixture = await createFixture(db!);
    try {
      await expect(
        filesystem!.renameItem(fixture.scope, fixture.alphaId, "ZETA"),
      ).rejects.toBeInstanceOf(ItemNameConflictError);
      await expect(
        filesystem!.moveItem(fixture.scope, fixture.alphaId, fixture.leafId),
      ).rejects.toBeInstanceOf(FolderCycleError);
      await expect(
        transfer!.reserveFile(fixture.scope, {
          driveId: fixture.driveId,
          parentId: fixture.fileId,
          name: "nested.bin",
          contentType: null,
          sizeBytes: null,
          storageBucket: "test",
        }),
      ).rejects.toBeInstanceOf(InvalidParentKindError);

      const clientId = `folder-${uuid()}`;
      const first = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Idempotent",
        clientId,
      });
      const retry = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Idempotent",
        clientId,
      });
      expect(retry.id).toBe(first.id);
      await expect(
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: null,
          name: "Different",
          clientId,
        }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      const file = await transfer!.reserveFile(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "terminal.bin",
        contentType: null,
        sizeBytes: null,
        storageBucket: "test",
      });
      await transfer!.setFileStatus(
        fixture.scope,
        file.item.id,
        "READY",
      );
      await expect(
        transfer!.setFileStatus(
          fixture.scope,
          file.item.id,
          "FAILED",
        ),
      ).rejects.toBeInstanceOf(InvalidUploadTransitionError);
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("restores a trash cohort without reviving an independently trashed child", async () => {
    const fixture = await createFixture(db!);
    try {
      const root = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Trash root",
      });
      const independent = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: root.id,
        name: "Independent",
      });
      const inherited = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: root.id,
        name: "Inherited",
      });

      await filesystem!.trashItem(fixture.scope, independent.id);
      await filesystem!.trashItem(fixture.scope, root.id);
      await filesystem!.restoreItem(fixture.scope, root.id);

      const rows = await db!.item.findMany({
        where: { id: { in: [root.id, independent.id, inherited.id] } },
        select: { id: true, deletedAt: true, trashedRootId: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(root.id)?.deletedAt).toBeNull();
      expect(byId.get(inherited.id)?.deletedAt).toBeNull();
      expect(byId.get(independent.id)?.deletedAt).not.toBeNull();
      expect(byId.get(independent.id)?.trashedRootId).toBeNull();
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });

  it("serializes opposing Folder moves and create-versus-trash races", async () => {
    const fixture = await createFixture(db!);
    try {
      const sameNameCreates = await Promise.allSettled([
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: null,
          name: "Simultaneous",
        }),
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: null,
          name: "Simultaneous",
        }),
      ]);
      expect(
        sameNameCreates.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        sameNameCreates.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);

      const concurrentClientId = `concurrent-${uuid()}`;
      const identicalCreates = await Promise.all([
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: null,
          name: "One resource",
          clientId: concurrentClientId,
        }),
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: null,
          name: "One resource",
          clientId: concurrentClientId,
        }),
      ]);
      expect(identicalCreates[0]?.id).toBe(identicalCreates[1]?.id);

      const left = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Left",
      });
      const right = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Right",
      });
      const moves = await Promise.allSettled([
        filesystem!.moveItem(fixture.scope, left.id, right.id),
        filesystem!.moveItem(fixture.scope, right.id, left.id),
      ]);
      expect(moves.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(moves.filter((result) => result.status === "rejected")).toHaveLength(1);

      const parent = await filesystem!.createFolder(fixture.scope, {
        driveId: fixture.driveId,
        parentId: null,
        name: "Race parent",
      });
      await Promise.allSettled([
        filesystem!.createFolder(fixture.scope, {
          driveId: fixture.driveId,
          parentId: parent.id,
          name: "Race child",
        }),
        filesystem!.trashItem(fixture.scope, parent.id),
      ]);
      const invalidActiveChild = await db!.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`
          SELECT count(*)::integer AS count
          FROM items AS child
          JOIN items AS parent ON parent.id = child.parent_id
          WHERE child.drive_id = ${fixture.driveId}::uuid
            AND child.deleted_at IS NULL
            AND parent.deleted_at IS NOT NULL
        `,
      );
      expect(invalidActiveChild[0]?.count).toBe(0);
    } finally {
      await cleanupFixture(db!, fixture);
    }
  });
});

afterAll(async () => {
  await db?.$disconnect();
});
