// Object CRUD over the S3-compatible backend.
//
// WIP: the object layer is being reworked to sit under the unified node model,
// so the key-derivation and read/write paths here are stubbed out on this
// branch. The old per-drive key layout was removed and the digest-addressed
// layout is not wired in yet. Do not rely on anything in this module building
// or running until the storage-mapping rework lands.

import { StorageError } from "./errors";

const PENDING = "storage object layer is mid-migration (node-model rework)";

export async function putObject(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function getObject(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function headObject(): Promise<never> {
  throw new StorageError(PENDING);
}

export async function deleteObject(): Promise<never> {
  throw new StorageError(PENDING);
}

// TODO: reinstate copy/move once the node key layout is settled.
