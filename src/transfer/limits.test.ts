/**
 * The planning rules, tested at their edges.
 *
 * These are pure functions over provider limits, so the interesting cases are
 * boundaries — exactly at a threshold, one byte past it, the last part of an
 * uneven file — and every one of them is cheaper to get right here than to
 * discover as a 400 from R2 halfway through a 6 GB upload.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_FILE_SIZE_BYTES,
  MAX_PLANNED_PARTS,
  PART_SIZE_LADDER_BYTES,
  SINGLE_PUT_MAX_BYTES,
  SINGLE_PUT_THRESHOLD_BYTES,
  UNKNOWN_SIZE_PART_BYTES,
  assertSizeAllowed,
  assertValidPartNumbers,
  auditParts,
  chooseMode,
  choosePartSize,
  planPartCount,
} from "./limits";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe("chooseMode", () => {
  it("keeps small files on one round trip", () => {
    expect(chooseMode(0)).toBe("SINGLE");
    expect(chooseMode(SINGLE_PUT_THRESHOLD_BYTES)).toBe("SINGLE");
  });

  it("switches to multipart one byte past the threshold", () => {
    expect(chooseMode(SINGLE_PUT_THRESHOLD_BYTES + 1)).toBe("MULTIPART");
  });

  it("uses multipart when the size is unknown, since nothing else can", () => {
    expect(chooseMode(null)).toBe("MULTIPART");
  });

  it("refuses a forced single PUT past the provider ceiling", () => {
    expect(() => chooseMode(SINGLE_PUT_MAX_BYTES + 1, "single")).toThrow(
      /tops out/,
    );
    expect(chooseMode(SINGLE_PUT_MAX_BYTES, "single")).toBe("SINGLE");
  });

  it("refuses a forced single PUT with no declared size", () => {
    expect(() => chooseMode(null, "single")).toThrow(/sizeBytes/);
  });

  it("honours a forced multipart, whatever the size", () => {
    expect(chooseMode(1, "multipart")).toBe("MULTIPART");
  });
});

describe("assertSizeAllowed", () => {
  it("allows an unknown size through to the part planner", () => {
    expect(() => assertSizeAllowed(null)).not.toThrow();
  });

  it("rejects the product ceiling being exceeded", () => {
    expect(() => assertSizeAllowed(MAX_FILE_SIZE_BYTES)).not.toThrow();
    expect(() => assertSizeAllowed(MAX_FILE_SIZE_BYTES + 1)).toThrow(
      /limited to/,
    );
  });

  it("rejects sizes that are not counts of bytes", () => {
    expect(() => assertSizeAllowed(-1)).toThrow();
    expect(() => assertSizeAllowed(1.5)).toThrow();
  });
});

describe("choosePartSize", () => {
  it("starts at the smallest rung, so a lost part costs the least", () => {
    expect(choosePartSize(200 * MIB)).toBe(PART_SIZE_LADDER_BYTES[0]);
  });

  it("keeps every plan inside the part budget", () => {
    for (const size of [
      1,
      200 * MIB,
      50 * GIB,
      100 * GIB,
      MAX_FILE_SIZE_BYTES,
    ]) {
      const partSize = choosePartSize(size);
      expect(Math.ceil(size / partSize)).toBeLessThanOrEqual(MAX_PLANNED_PARTS);
    }
  });

  it("steps up exactly when the previous rung runs out of parts", () => {
    const first = PART_SIZE_LADDER_BYTES[0];
    const lastFit = first * MAX_PLANNED_PARTS;
    expect(choosePartSize(lastFit)).toBe(first);
    expect(choosePartSize(lastFit + 1)).toBe(PART_SIZE_LADDER_BYTES[1]);
  });

  it("has a fixed answer for an unknown length", () => {
    expect(choosePartSize(null)).toBe(UNKNOWN_SIZE_PART_BYTES);
  });
});

describe("planPartCount", () => {
  it("counts an uneven tail as its own part", () => {
    expect(planPartCount(8 * MIB + 1, 8 * MIB)).toBe(2);
  });

  it("treats an empty file as one part rather than none", () => {
    expect(planPartCount(0, 8 * MIB)).toBe(1);
  });

  it("cannot count what it cannot measure", () => {
    expect(planPartCount(null, 8 * MIB)).toBeNull();
  });
});

describe("assertValidPartNumbers", () => {
  it("rejects part numbers outside the provider's range", () => {
    expect(() => assertValidPartNumbers([0])).toThrow();
    expect(() => assertValidPartNumbers([10_001])).toThrow();
    expect(() => assertValidPartNumbers([1.5])).toThrow();
  });

  it("rejects an empty or oversized batch", () => {
    expect(() => assertValidPartNumbers([])).toThrow();
    expect(() =>
      assertValidPartNumbers(Array.from({ length: 101 }, (_, i) => i + 1)),
    ).toThrow();
  });

  it("accepts a normal batch", () => {
    expect(() => assertValidPartNumbers([1, 2, 3])).not.toThrow();
  });
});

describe("auditParts", () => {
  const partSize = 8 * MIB;

  it("accepts a complete upload with an uneven final part", () => {
    const total = partSize * 2 + 123;
    const audit = auditParts(
      [
        { partNumber: 1, sizeBytes: partSize },
        { partNumber: 2, sizeBytes: partSize },
        { partNumber: 3, sizeBytes: 123 },
      ],
      partSize,
      total,
    );
    expect(audit).toEqual({ complete: true, totalBytes: total });
  });

  it("names the gap rather than just refusing", () => {
    const audit = auditParts(
      [
        { partNumber: 1, sizeBytes: partSize },
        { partNumber: 3, sizeBytes: 10 },
      ],
      partSize,
      partSize * 2 + 10,
    );
    expect(audit).toEqual({ complete: false, missing: [2], malformed: [] });
  });

  it("catches a short middle part, which R2 would reject at assembly", () => {
    const audit = auditParts(
      [
        { partNumber: 1, sizeBytes: partSize - 1 },
        { partNumber: 2, sizeBytes: 10 },
      ],
      partSize,
      partSize + 10,
    );
    expect(audit).toEqual({ complete: false, missing: [], malformed: [1] });
  });

  it("treats an empty part list as missing the first part", () => {
    expect(auditParts([], partSize, null)).toEqual({
      complete: false,
      missing: [1],
      malformed: [],
    });
  });

  it("accepts any trailing size when the length was never declared", () => {
    const audit = auditParts(
      [
        { partNumber: 1, sizeBytes: partSize },
        { partNumber: 2, sizeBytes: 7 },
      ],
      partSize,
      null,
    );
    expect(audit).toEqual({ complete: true, totalBytes: partSize + 7 });
  });

  it("still requires contiguity when the length was never declared", () => {
    const audit = auditParts(
      [
        { partNumber: 1, sizeBytes: partSize },
        { partNumber: 3, sizeBytes: 7 },
      ],
      partSize,
      null,
    );
    expect(audit).toEqual({ complete: false, missing: [2], malformed: [] });
  });
});
