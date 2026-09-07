/**
 * The inline allowlist.
 *
 * The only thing standing between an uploaded HTML file and a script running
 * when someone opens a share link — origin isolation is the second wall, not
 * the first. Every case here is a rule from
 * docs/architecture/sharing/02-public-access-security.md §3.
 */

import { describe, expect, it } from "vitest";

import {
  attachmentContentType,
  FALLBACK_CONTENT_TYPE,
  inlineContentType,
  isInlinePreviewable,
} from "./preview";

describe("inlineContentType", () => {
  it("passes the types a browser renders passively", () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "application/pdf",
      "text/plain",
    ]) {
      expect(inlineContentType(type)).toBe(type);
    }
  });

  it("refuses everything that can execute", () => {
    for (const type of [
      "text/html",
      "application/xhtml+xml",
      "image/svg+xml",
      "application/x-msdownload",
      "application/zip",
    ]) {
      expect(inlineContentType(type)).toBeNull();
      expect(isInlinePreviewable(type)).toBe(false);
    }
  });

  it("re-types text-ish formats to text/plain rather than echoing them", () => {
    for (const type of [
      "text/markdown",
      "text/csv",
      "application/json",
      "text/javascript",
      "text/css",
    ]) {
      expect(inlineContentType(type)).toBe("text/plain");
    }
  });

  it("ignores parameters and casing", () => {
    expect(inlineContentType("Image/PNG")).toBe("image/png");
    expect(inlineContentType("text/plain; charset=UTF-8")).toBe("text/plain");
    // A parameter must not smuggle a type past the list.
    expect(inlineContentType("text/html; charset=utf-8")).toBeNull();
  });

  it("refuses a missing type", () => {
    expect(inlineContentType(null)).toBeNull();
    expect(inlineContentType("")).toBeNull();
  });
});

describe("attachmentContentType", () => {
  it("keeps a recognised type", () => {
    expect(attachmentContentType("application/pdf")).toBe("application/pdf");
    expect(attachmentContentType("text/markdown")).toBe("text/markdown");
  });

  it("never repeats back a type it does not recognise", () => {
    expect(attachmentContentType("application/zip")).toBe(FALLBACK_CONTENT_TYPE);
    expect(attachmentContentType(null)).toBe(FALLBACK_CONTENT_TYPE);
    expect(attachmentContentType("nonsense/made-up")).toBe(
      FALLBACK_CONTENT_TYPE,
    );
  });

  it("declines to declare active types even as an attachment", () => {
    // Disposition alone would stop these rendering. Declaring them anyway would
    // leave the safety of the response resting on one header instead of two.
    expect(attachmentContentType("text/html")).toBe(FALLBACK_CONTENT_TYPE);
    expect(attachmentContentType("image/svg+xml")).toBe(FALLBACK_CONTENT_TYPE);
  });
});
