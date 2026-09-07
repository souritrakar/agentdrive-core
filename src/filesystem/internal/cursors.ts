import { InvalidFilesystemInputError } from "../errors";
import type { ItemKind } from "../types";

const CURSOR_VERSION = 1 as const;
const MAX_CURSOR_LENGTH = 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DriveCursor = {
  updatedAt: string;
  id: string;
};

export type ItemCursor = {
  kind: ItemKind;
  normalizedName: string;
  id: string;
};

export type TrashCursor = {
  deletedAt: string;
  id: string;
};

type EncodedDriveCursor = DriveCursor & {
  v: typeof CURSOR_VERSION;
  type: "drives";
};

type EncodedItemCursor = ItemCursor & {
  v: typeof CURSOR_VERSION;
  type: "items";
};

type EncodedTrashCursor = TrashCursor & {
  v: typeof CURSOR_VERSION;
  type: "trash";
};

function invalidCursor(): never {
  throw new InvalidFilesystemInputError("The cursor is invalid or unsupported.");
}

function toBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";

  // Chunking avoids exceeding the argument limit for String.fromCharCode.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(cursor: string): unknown {
  if (!cursor || cursor.length > MAX_CURSOR_LENGTH) invalidCursor();

  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    return invalidCursor();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function encodeDriveCursor(cursor: DriveCursor): string {
  return toBase64Url({
    v: CURSOR_VERSION,
    type: "drives",
    ...cursor,
  } satisfies EncodedDriveCursor);
}

export function decodeDriveCursor(cursor: string): DriveCursor {
  const value = fromBase64Url(cursor);

  if (
    !isRecord(value) ||
    value.v !== CURSOR_VERSION ||
    value.type !== "drives" ||
    !isUuidValue(value.id) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return invalidCursor();
  }

  return { id: value.id, updatedAt: new Date(value.updatedAt).toISOString() };
}

export function encodeItemCursor(cursor: ItemCursor): string {
  return toBase64Url({
    v: CURSOR_VERSION,
    type: "items",
    ...cursor,
  } satisfies EncodedItemCursor);
}

export function decodeItemCursor(cursor: string): ItemCursor {
  const value = fromBase64Url(cursor);

  if (
    !isRecord(value) ||
    value.v !== CURSOR_VERSION ||
    value.type !== "items" ||
    !isUuidValue(value.id) ||
    (value.kind !== "FOLDER" && value.kind !== "FILE") ||
    typeof value.normalizedName !== "string"
  ) {
    return invalidCursor();
  }

  return {
    id: value.id,
    kind: value.kind,
    normalizedName: value.normalizedName,
  };
}

export function encodeTrashCursor(cursor: TrashCursor): string {
  return toBase64Url({
    v: CURSOR_VERSION,
    type: "trash",
    ...cursor,
  } satisfies EncodedTrashCursor);
}

export function decodeTrashCursor(cursor: string): TrashCursor {
  const value = fromBase64Url(cursor);
  if (
    !isRecord(value) ||
    value.v !== CURSOR_VERSION ||
    value.type !== "trash" ||
    !isUuidValue(value.id) ||
    typeof value.deletedAt !== "string" ||
    !Number.isFinite(Date.parse(value.deletedAt))
  ) {
    return invalidCursor();
  }
  return { id: value.id, deletedAt: new Date(value.deletedAt).toISOString() };
}

export function isUuid(value: string): boolean {
  return isUuidValue(value);
}
