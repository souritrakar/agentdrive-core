/**
 * Transfer planning: how big a file may be, how it should be carried, and how
 * a finished multipart upload is judged complete.
 *
 * Everything here is pure arithmetic over the provider's rules, kept out of
 * the database and storage paths so it can be tested exhaustively without
 * either. The numbers and their sources are in
 * docs/reference/r2-limits.md; the reasoning is in
 * docs/architecture/upload-storage-module-spec.md §7 and §12.
 */

import { FileTooLargeError, PartPlanInvalidError } from "./errors";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/**
 * R2 tops a single PUT out 5 MiB below 5 GiB. Above this, multipart is the
 * only transport, whatever the caller asks for.
 */
export const SINGLE_PUT_MAX_BYTES = 5 * GIB - 5 * MIB;

/**
 * Where multipart starts paying for itself.
 *
 * Below this a retry just re-sends the file, which is cheaper than the
 * bookkeeping; above it, resuming beats restarting and parallel parts beat one
 * stream. Cloudflare's own guidance puts the line in the same place.
 */
export const SINGLE_PUT_THRESHOLD_BYTES = 100 * MIB;

/**
 * A deliberate product ceiling, not a provider one — R2 objects go to ~5 TiB.
 *
 * Picking a number here means an oversized upload is refused up front with a
 * sentence a person can act on, instead of failing somewhere inside the
 * transfer as a provider error. Raise it when a real customer needs it.
 */
export const MAX_FILE_SIZE_BYTES = 1024 * GIB;

/** R2 caps a multipart upload at 10,000 parts; plan well inside it. */
export const MAX_PLANNED_PARTS = 9_500;

/**
 * Every non-final part must be exactly one of these, and every part in a given
 * upload must be the same size — an R2 rule that S3 does not impose. Writing
 * the strict version once means the same uploader runs on both.
 *
 * The floor is 5 MiB (the provider minimum) rounded up to a power of two so
 * part boundaries line up with how clients slice files.
 */
export const PART_SIZE_LADDER_BYTES = [
  8 * MIB,
  16 * MIB,
  32 * MIB,
  64 * MIB,
  128 * MIB,
  256 * MIB,
  512 * MIB,
  1 * GIB,
  2 * GIB,
  4 * GIB,
] as const;

/**
 * Part size for a stream whose length nobody knows yet — an agent piping
 * generated output, most often. Carries ~594 GiB before running out of parts,
 * which is far past anything that arrives without a declared size.
 */
export const UNKNOWN_SIZE_PART_BYTES = 64 * MIB;

/** How long a reserved session stays claimable before the reaper settles it. */
export const SESSION_TTL_SINGLE_MS = 24 * 60 * 60 * 1000;
/** Matches R2's own automatic abort of incomplete multipart uploads. */
export const SESSION_TTL_MULTIPART_MS = 7 * 24 * 60 * 60 * 1000;

/** Most part URLs one request will mint. Keeps a response bounded. */
export const MAX_PART_URLS_PER_CALL = 100;

export type TransferMode = "SINGLE" | "MULTIPART";
export type RequestedMode = "auto" | "single" | "multipart";

/**
 * Reject a file we will not carry, before any row or object exists.
 *
 * An unknown size is allowed through: it can only be a multipart stream, and
 * the part plan bounds it anyway.
 */
export function assertSizeAllowed(sizeBytes: number | null): void {
  if (sizeBytes === null) return;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new PartPlanInvalidError("sizeBytes must be a non-negative integer.");
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileTooLargeError(
      `Files are limited to ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
    );
  }
}

export function chooseMode(
  sizeBytes: number | null,
  requested: RequestedMode = "auto",
): TransferMode {
  if (requested === "multipart") return "MULTIPART";

  if (requested === "single") {
    if (sizeBytes === null) {
      throw new PartPlanInvalidError(
        "A single-part upload needs a declared sizeBytes.",
      );
    }
    if (sizeBytes > SINGLE_PUT_MAX_BYTES) {
      throw new FileTooLargeError(
        `A single upload tops out at ${formatBytes(SINGLE_PUT_MAX_BYTES)}. Omit "mode" to use multipart.`,
      );
    }
    return "SINGLE";
  }

  // auto: one round trip while that is safe, multipart the moment it is not.
  if (sizeBytes === null) return "MULTIPART";
  return sizeBytes <= SINGLE_PUT_THRESHOLD_BYTES ? "SINGLE" : "MULTIPART";
}

/**
 * The smallest ladder rung that carries this file within the part budget.
 *
 * Smallest wins because a smaller part is a smaller unit of retry: losing a
 * part to a dropped connection should cost as little re-upload as the part
 * count allows.
 */
export function choosePartSize(sizeBytes: number | null): number {
  if (sizeBytes === null) return UNKNOWN_SIZE_PART_BYTES;

  for (const candidate of PART_SIZE_LADDER_BYTES) {
    if (Math.ceil(sizeBytes / candidate) <= MAX_PLANNED_PARTS) return candidate;
  }
  throw new FileTooLargeError(
    `Files are limited to ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
  );
}

/** How many parts a known-size file will be cut into. Null when unknown. */
export function planPartCount(
  sizeBytes: number | null,
  partSizeBytes: number,
): number | null {
  if (sizeBytes === null) return null;
  if (sizeBytes === 0) return 1;
  return Math.ceil(sizeBytes / partSizeBytes);
}

export function assertValidPartNumbers(partNumbers: number[]): void {
  if (partNumbers.length === 0) {
    throw new PartPlanInvalidError("Name at least one part number.");
  }
  if (partNumbers.length > MAX_PART_URLS_PER_CALL) {
    throw new PartPlanInvalidError(
      `Ask for at most ${MAX_PART_URLS_PER_CALL} part URLs at a time.`,
    );
  }
  for (const partNumber of partNumbers) {
    if (
      !Number.isSafeInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10_000
    ) {
      throw new PartPlanInvalidError(
        "Part numbers run from 1 to 10000 inclusive.",
      );
    }
  }
}

export type PartAudit =
  | { complete: true; totalBytes: number }
  | { complete: false; missing: number[]; malformed: number[] };

/**
 * Decide whether what the provider is holding actually adds up to the file.
 *
 * This is the check that lets completion trust storage instead of the client.
 * Two failure shapes matter and are reported separately: parts that never
 * arrived, and parts that arrived the wrong size — which on R2 means the
 * upload would be rejected at assembly rather than quietly producing a
 * corrupt object.
 */
export function auditParts(
  parts: Array<{ partNumber: number; sizeBytes: number }>,
  partSizeBytes: number,
  expectedSizeBytes: number | null,
): PartAudit {
  const sizeByNumber = new Map(
    parts.map((part) => [part.partNumber, part.sizeBytes]),
  );
  const expectedCount =
    expectedSizeBytes === null
      ? sizeByNumber.size
      : planPartCount(expectedSizeBytes, partSizeBytes);

  if (expectedCount === null || expectedCount === 0) {
    return { complete: false, missing: [1], malformed: [] };
  }

  const missing: number[] = [];
  const malformed: number[] = [];

  for (let partNumber = 1; partNumber <= expectedCount; partNumber += 1) {
    const size = sizeByNumber.get(partNumber);
    if (size === undefined) {
      missing.push(partNumber);
      continue;
    }

    const isFinal = partNumber === expectedCount;
    const required =
      expectedSizeBytes === null
        ? isFinal
          ? null // a trailing part of any size is legal when we cannot predict it
          : partSizeBytes
        : isFinal
          ? expectedSizeBytes - (expectedCount - 1) * partSizeBytes
          : partSizeBytes;

    if (required !== null && size !== required) malformed.push(partNumber);
  }

  if (missing.length > 0 || malformed.length > 0) {
    return { complete: false, missing, malformed };
  }

  let totalBytes = 0;
  for (let partNumber = 1; partNumber <= expectedCount; partNumber += 1) {
    totalBytes += sizeByNumber.get(partNumber) ?? 0;
  }
  return { complete: true, totalBytes };
}

export function sessionTtlMs(mode: TransferMode): number {
  return mode === "SINGLE" ? SESSION_TTL_SINGLE_MS : SESSION_TTL_MULTIPART_MS;
}

function formatBytes(bytes: number): string {
  if (bytes >= GIB) {
    const value = bytes / GIB;
    return `${Number.isInteger(value) ? value : value.toFixed(2)} GiB`;
  }
  return `${Math.round(bytes / MIB)} MiB`;
}
