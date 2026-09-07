import type { Icon } from "@phosphor-icons/react";
import {
  File,
  FileAudio,
  FileCode,
  FileCss,
  FileCsv,
  FileDoc,
  FileHtml,
  FileImage,
  FileJs,
  FileJsx,
  FileMd,
  FilePdf,
  FilePpt,
  FilePy,
  FileRs,
  FileSql,
  FileSvg,
  FileText,
  FileTs,
  FileTsx,
  FileVideo,
  FileXls,
  FileZip,
} from "@phosphor-icons/react/ssr";

/**
 * Everything the UI needs to draw a file: its glyph, its tint, and its label.
 *
 * One function rather than the three lookups this replaces, because all three
 * answers come from the same evidence (content type, then extension) and
 * splitting them meant walking that evidence three times and risking three
 * different verdicts — an icon saying "code" beside a label saying "Text".
 */

/**
 * The four material tints.
 *
 * Deliberately coarse. Tints group files into families you can pick out of a
 * grid at a glance; the *specific* glyph is what tells you `.ts` from `.py`.
 * Splitting the tints any finer would push their hues closer together until
 * they stopped being distinguishable, which is the failure mode that makes
 * per-type colour look like noise.
 */
export type FileTint = "document" | "media" | "code" | "archive";

export type FileKind = {
  /** Short, human, and never the raw MIME type — "PDF", "TypeScript". */
  label: string;
  Icon: Icon;
  tint: FileTint;
};

/**
 * Tint token → Tailwind class.
 *
 * Kept as whole literal class names in one exported record because Tailwind
 * only ships classes it can see in the source. Building them by interpolation
 * (`text-tint-${tint}`) compiles fine and renders colourless in production —
 * the exact bug that is invisible in dev.
 */
export const TINT_TEXT: Record<FileTint, string> = {
  document: "text-tint-document",
  media: "text-tint-media",
  code: "text-tint-code",
  archive: "text-tint-archive",
};

const CODE: FileTint = "code";
const DOC: FileTint = "document";
const MEDIA: FileTint = "media";
const ARCHIVE: FileTint = "archive";

/**
 * Extension → kind. The long tail is intentional: a folder of source files
 * where every entry is the same grey page icon is precisely the flat listing
 * this design replaces, and Phosphor gives us the per-language glyphs for
 * free.
 */
const BY_EXTENSION: Record<string, FileKind> = {
  // Documents
  pdf: { label: "PDF", Icon: FilePdf, tint: DOC },
  doc: { label: "Word", Icon: FileDoc, tint: DOC },
  docx: { label: "Word", Icon: FileDoc, tint: DOC },
  rtf: { label: "Rich text", Icon: FileText, tint: DOC },
  txt: { label: "Text", Icon: FileText, tint: DOC },
  md: { label: "Markdown", Icon: FileMd, tint: DOC },
  mdx: { label: "MDX", Icon: FileMd, tint: DOC },
  ppt: { label: "Slides", Icon: FilePpt, tint: DOC },
  pptx: { label: "Slides", Icon: FilePpt, tint: DOC },
  key: { label: "Keynote", Icon: FilePpt, tint: DOC },

  // Data — grouped with code rather than documents. A spreadsheet is closer
  // to a table you query than to a page you read.
  csv: { label: "CSV", Icon: FileCsv, tint: CODE },
  tsv: { label: "TSV", Icon: FileCsv, tint: CODE },
  xls: { label: "Spreadsheet", Icon: FileXls, tint: CODE },
  xlsx: { label: "Spreadsheet", Icon: FileXls, tint: CODE },
  json: { label: "JSON", Icon: FileCode, tint: CODE },
  yml: { label: "YAML", Icon: FileCode, tint: CODE },
  yaml: { label: "YAML", Icon: FileCode, tint: CODE },
  toml: { label: "TOML", Icon: FileCode, tint: CODE },
  sql: { label: "SQL", Icon: FileSql, tint: CODE },

  // Code
  js: { label: "JavaScript", Icon: FileJs, tint: CODE },
  mjs: { label: "JavaScript", Icon: FileJs, tint: CODE },
  cjs: { label: "JavaScript", Icon: FileJs, tint: CODE },
  jsx: { label: "JSX", Icon: FileJsx, tint: CODE },
  ts: { label: "TypeScript", Icon: FileTs, tint: CODE },
  tsx: { label: "TSX", Icon: FileTsx, tint: CODE },
  py: { label: "Python", Icon: FilePy, tint: CODE },
  rs: { label: "Rust", Icon: FileRs, tint: CODE },
  go: { label: "Go", Icon: FileCode, tint: CODE },
  rb: { label: "Ruby", Icon: FileCode, tint: CODE },
  sh: { label: "Shell", Icon: FileCode, tint: CODE },
  html: { label: "HTML", Icon: FileHtml, tint: CODE },
  css: { label: "CSS", Icon: FileCss, tint: CODE },

  // Media
  png: { label: "PNG", Icon: FileImage, tint: MEDIA },
  jpg: { label: "JPEG", Icon: FileImage, tint: MEDIA },
  jpeg: { label: "JPEG", Icon: FileImage, tint: MEDIA },
  gif: { label: "GIF", Icon: FileImage, tint: MEDIA },
  webp: { label: "WebP", Icon: FileImage, tint: MEDIA },
  avif: { label: "AVIF", Icon: FileImage, tint: MEDIA },
  heic: { label: "HEIC", Icon: FileImage, tint: MEDIA },
  // SVG is markup, but people look for it among their images.
  svg: { label: "SVG", Icon: FileSvg, tint: MEDIA },
  mp4: { label: "Video", Icon: FileVideo, tint: MEDIA },
  mov: { label: "Video", Icon: FileVideo, tint: MEDIA },
  webm: { label: "Video", Icon: FileVideo, tint: MEDIA },
  mkv: { label: "Video", Icon: FileVideo, tint: MEDIA },
  mp3: { label: "Audio", Icon: FileAudio, tint: MEDIA },
  wav: { label: "Audio", Icon: FileAudio, tint: MEDIA },
  flac: { label: "Audio", Icon: FileAudio, tint: MEDIA },
  m4a: { label: "Audio", Icon: FileAudio, tint: MEDIA },

  // Archives
  zip: { label: "Archive", Icon: FileZip, tint: ARCHIVE },
  tar: { label: "Archive", Icon: FileZip, tint: ARCHIVE },
  gz: { label: "Archive", Icon: FileZip, tint: ARCHIVE },
  rar: { label: "Archive", Icon: FileZip, tint: ARCHIVE },
  "7z": { label: "Archive", Icon: FileZip, tint: ARCHIVE },
};

/** Content types worth recognising by name, where the extension may be absent. */
const BY_CONTENT_TYPE: Record<string, FileKind> = {
  "application/pdf": BY_EXTENSION.pdf,
  "application/json": BY_EXTENSION.json,
  "application/zip": BY_EXTENSION.zip,
  "text/markdown": BY_EXTENSION.md,
  "text/csv": BY_EXTENSION.csv,
  "text/html": BY_EXTENSION.html,
  "text/css": BY_EXTENSION.css,
  "text/plain": BY_EXTENSION.txt,
  "image/svg+xml": BY_EXTENSION.svg,
};

const UNKNOWN: FileKind = { label: "File", Icon: File, tint: ARCHIVE };

/**
 * Resolves a file's visual identity.
 *
 * Extension is consulted *before* the generic `image/*` family checks, so a
 * `.svg` still gets the SVG glyph rather than collapsing into the same picture
 * icon as a JPEG. Content type only wins where it is specific enough to say
 * something the extension does not — browsers report `""` for anything they
 * don't recognise, which is common enough that extension has to be able to
 * carry the answer alone.
 */
export function fileKind(name: string, contentType?: string | null): FileKind {
  const type = (contentType ?? "").toLowerCase().split(";")[0].trim();

  const named = BY_CONTENT_TYPE[type];
  if (named) return named;

  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const byExtension = BY_EXTENSION[extension];
  if (byExtension) return byExtension;

  // Family fallbacks, for types we have no specific entry for — an
  // `image/tiff` should still read as media rather than as an unknown blob.
  if (type.startsWith("image/")) {
    return { label: subtype(type) || "Image", Icon: FileImage, tint: MEDIA };
  }
  if (type.startsWith("video/")) {
    return { label: subtype(type) || "Video", Icon: FileVideo, tint: MEDIA };
  }
  if (type.startsWith("audio/")) {
    return { label: subtype(type) || "Audio", Icon: FileAudio, tint: MEDIA };
  }
  if (type.startsWith("text/")) {
    return { label: "Text", Icon: FileText, tint: DOC };
  }

  // Nothing recognised the type, but there is still an extension worth
  // showing — "BIN" tells the user more than "File" does.
  if (extension) {
    return { label: extension.toUpperCase(), Icon: File, tint: ARCHIVE };
  }

  return UNKNOWN;
}

/** `image/png` → `PNG`. Empty for vendor types too long to read as a label. */
function subtype(type: string): string {
  const value = type.slice(type.indexOf("/") + 1);
  return value.length <= 5 ? value.toUpperCase() : "";
}
