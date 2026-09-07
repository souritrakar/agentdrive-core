import { describe, expect, it } from "vitest";

import { InvalidFilesystemInputError } from "../errors";
import {
  decodeDriveCursor,
  decodeItemCursor,
  encodeDriveCursor,
  encodeItemCursor,
} from "./cursors";

const FIRST_ID = "019910b7-922a-7705-90e8-79dbac7a5c10";

describe("filesystem cursors", () => {
  it("round-trips and canonicalizes a Drive cursor", () => {
    const encoded = encodeDriveCursor({
      id: FIRST_ID,
      updatedAt: "2026-08-23T12:34:56.123-07:00",
    });

    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(decodeDriveCursor(encoded)).toEqual({
      id: FIRST_ID,
      updatedAt: "2026-08-23T19:34:56.123Z",
    });
  });

  it("round-trips Unicode normalized names without exposing JSON", () => {
    const value = {
      id: FIRST_ID,
      kind: "FOLDER" as const,
      normalizedName: "résumés/東京",
    };
    const encoded = encodeItemCursor(value);

    expect(encoded).not.toContain("résumés");
    expect(decodeItemCursor(encoded)).toEqual(value);
  });

  it("rejects a cursor from the other listing family", () => {
    const encoded = encodeItemCursor({
      id: FIRST_ID,
      kind: "FILE",
      normalizedName: "report.pdf",
    });

    expect(() => decodeDriveCursor(encoded)).toThrowError(
      InvalidFilesystemInputError,
    );
  });

  it.each(["not-base64", "e30", "x".repeat(1025)])(
    "rejects malformed cursor %s",
    (cursor) => {
      try {
        decodeItemCursor(cursor);
        expect.unreachable("cursor should have been rejected");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidFilesystemInputError);
        expect((error as InvalidFilesystemInputError).code).toBe(
          "invalid_input",
        );
      }
    },
  );
});
