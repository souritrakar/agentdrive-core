"use client";

import { CircleNotch, WarningCircle } from "@phosphor-icons/react/ssr";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fileKind, TINT_TEXT } from "@/lib/file-kind";
import { formatBytes } from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

type FileItem = Extract<Item, { kind: "FILE" }>;

/** How much of a text file the pane will render. */
export const TEXT_PREVIEW_LIMIT = 256 * 1024;

export type StageKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

/**
 * Types the browser renders passively, with no script execution context.
 *
 * This is the same allowlist the API enforces when it mints an inline URL
 * (docs/architecture/sharing/02-public-access-security.md §3). Keeping the two
 * in step is what stops the viewer from asking for a preview the server will
 * refuse and then rendering a broken frame instead of the honest no-preview
 * stage.
 *
 * `text/html`, `application/xhtml+xml` and `image/svg+xml` are deliberately
 * absent. They are the stored-XSS carriers: an uploaded page or SVG with a
 * `<script>` in it would execute in whoever opened the preview. The UI spec's
 * §3.2 table lists SVG among the renderable images; the security spec forbids
 * it, and the security spec wins — a preview the server will not grant is not
 * a preview.
 */
const INLINE_TYPES = new Set([
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
]);

/** `text/markdown; charset=utf-8` → `text/markdown`. */
function normalise(contentType: string | null | undefined): string {
  return (contentType ?? "").toLowerCase().split(";")[0].trim();
}

/**
 * Which stage a file gets.
 *
 * Branches on the content type rather than on `fileKind()`, because the two
 * answer different questions: the classifier says what a file *is* (glyph,
 * label, tint), and this says whether a browser can *render* it. A `.ts` file
 * is confidently "TypeScript" to the classifier and not renderable here,
 * which is exactly the distinction the no-preview stage exists to carry.
 */
export function previewStage(file: Pick<FileItem, "name" | "contentType">): StageKind {
  const type = normalise(file.contentType);
  // Markdown is served as `text/plain` so it cannot be interpreted as markup;
  // the pane shows its source, which is what a shared `.md` should read as
  // until there is a renderer worth having.
  const effective = type === "text/markdown" ? "text/plain" : type;

  if (!INLINE_TYPES.has(effective)) return "none";
  if (effective === "application/pdf") return "pdf";
  if (effective === "text/plain") return "text";
  if (effective.startsWith("image/")) return "image";
  if (effective.startsWith("video/")) return "video";
  if (effective.startsWith("audio/")) return "audio";
  return "none";
}

/** The stage while the first URL is being minted. Shape-known, so no spinner. */
export function LoadingStage() {
  return <Skeleton className="size-full rounded-xl" />;
}

/**
 * A file whose bytes are not in storage yet, or never arrived.
 *
 * Mirrors the tile vocabulary — the same spinner and warning glyph a listing
 * uses — so a visitor who saw "Uploading…" in a folder meets the same language
 * when they open it. No download is offered either way: there is nothing to
 * download.
 */
export function NotReadyStage({ file }: { file: FileItem }) {
  const isFailed = file.uploadStatus === "FAILED";

  return (
    <StageFrame>
      {isFailed ? (
        <WarningCircle
          weight="duotone"
          aria-hidden="true"
          className="size-16 shrink-0 text-destructive"
        />
      ) : (
        <CircleNotch aria-hidden="true" className="size-16 shrink-0 animate-spin text-lime" />
      )}
      <div className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">
          {isFailed ? "This file failed to upload" : "This file isn't available yet"}
        </h2>
        <p className="type-body mx-auto max-w-[46ch] text-pretty text-muted-foreground">
          {isFailed
            ? "Its owner will need to upload it again before this link shows anything."
            : "It is still being uploaded. Check back in a moment."}
        </p>
      </div>
    </StageFrame>
  );
}

/**
 * Everything with no browser preview: archives, binaries, office documents,
 * and any type the inline allowlist does not admit.
 *
 * The one stage that repeats the Download button mid-page, because without it
 * the stage is a picture and a shrug. Outline, not lime — the header already
 * holds the page's one filled action, and two filled limes is two things
 * claiming to be the obvious next move.
 */
export function NoPreviewStage({
  file,
  onDownload,
  isDownloading,
}: {
  file: FileItem;
  onDownload?: () => void;
  isDownloading?: boolean;
}) {
  const kind = fileKind(file.name, file.contentType);

  return (
    <StageFrame>
      <kind.Icon
        weight="duotone"
        aria-hidden="true"
        className={cn("size-16 shrink-0", TINT_TEXT[kind.tint])}
      />
      <div className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">No preview for this file type</h2>
        <p className="type-meta text-muted-foreground">
          {kind.label} · {formatBytes(file.sizeBytes)}
        </p>
      </div>
      {onDownload && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-6"
          disabled={isDownloading}
          onClick={onDownload}
        >
          {isDownloading && <CircleNotch className="animate-spin" />}
          Download
        </Button>
      )}
    </StageFrame>
  );
}

export function ImageStage({
  url,
  name,
  onMediaError,
}: {
  url: string;
  name: string;
  onMediaError: () => void;
}) {
  /*
    No checkerboard behind a transparent PNG: a transparency checker is an
    editor idiom, and this product's answer to "what is behind this" is the
    same background everything else sits on.

    A plain `<img>` rather than `next/image`: the source is a short-lived
    presigned URL on the storage origin, which the optimiser cannot fetch and
    must not cache — a cached copy would outlive the credential that granted
    it, which is the whole property 02's expiry rule is protecting.
  */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={onMediaError}
      className="max-h-full max-w-full object-contain"
    />
  );
}

export function VideoStage({
  url,
  name,
  onMediaError,
}: {
  url: string;
  name: string;
  onMediaError: () => void;
}) {
  return (
    <video
      key={url}
      src={url}
      controls
      playsInline
      preload="metadata"
      aria-label={name}
      onError={onMediaError}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/**
 * Audio, given a stage rather than left as a bare control.
 *
 * A 54px control alone in a viewport reads as a broken page. The empty-state
 * vocabulary — picture, heading, control — gives it somewhere to be.
 */
export function AudioStage({
  url,
  file,
  onMediaError,
}: {
  url: string;
  file: FileItem;
  onMediaError: () => void;
}) {
  const kind = fileKind(file.name, file.contentType);

  return (
    <StageFrame>
      <kind.Icon
        weight="duotone"
        aria-hidden="true"
        className={cn("size-16 shrink-0", TINT_TEXT[kind.tint])}
      />
      <p className="type-title mt-8 max-w-[40ch] truncate">{file.name}</p>
      <audio
        key={url}
        src={url}
        controls
        preload="metadata"
        aria-label={file.name}
        onError={onMediaError}
        className="mt-6 w-full max-w-md"
      />
    </StageFrame>
  );
}

/**
 * PDF, in the browser's own viewer.
 *
 * Sandboxed, and pointed at the storage origin rather than ours — the document
 * renders in a throwaway cross-origin context where it can reach nothing of
 * the app. A browser with no built-in PDF viewer shows its own fallback inside
 * the frame; that is not detectable from here, which is why the Download
 * button in the header is never conditional on it.
 */
/** Whether `<embed>` will paint a PDF here. Fixed for the life of a document. */
const subscribeToNothing = () => () => {};

/**
 * Older browsers predate the property. Those are the ones that *do* ship a
 * plugin, so absent reads as capable and the embed gets its chance.
 */
const readPdfViewerEnabled = (): boolean => navigator.pdfViewerEnabled ?? true;

/**
 * A PDF, or an honest admission that this browser will not show one.
 *
 * `<embed>` and not `<iframe sandbox="">`. The sandbox attribute reads like the
 * safer choice and is in fact the reason nothing rendered: **any** value of
 * `sandbox` — including `allow-scripts` — switches off Chromium's built-in PDF
 * viewer, so every shared PDF drew an empty grey box with a broken-document
 * glyph and no explanation. Measured A/B on one presigned URL in one browser:
 * no attribute renders, `sandbox=""` does not, `sandbox="allow-scripts"` does
 * not, `<embed type="application/pdf">` does.
 *
 * Dropping the sandbox costs nothing that was protecting us. The wall that
 * matters is the origin: the URL points at R2, not at this app, so a document
 * that somehow executed would execute against a throwaway cross-origin context
 * with no reach into our DOM, our storage, or the visitor's Clerk session
 * (02-public-access-security.md §3). `<embed>` is preferred over a plain
 * `<iframe>` for the same reason it is listed there: it hosts a plugin view
 * rather than a document, so there is no frame to navigate itself or open
 * windows.
 *
 * `navigator.pdfViewerEnabled` is the standard way to ask "will `<embed>`
 * actually paint a PDF here", and it answers **false** on iOS Safari, which
 * renders only the first page and no scroll. Without the check that platform
 * gets a silent half-preview; with it, it gets the download it can actually
 * use.
 *
 * It is read through `useSyncExternalStore` rather than an effect because
 * `navigator` does not exist during a server render: the server snapshot is
 * `null` (the skeleton), the client snapshot is the real answer, and React
 * swaps them after hydration without a setState-in-effect cascade. The
 * subscribe callback is a no-op hoisted to module scope — the value cannot
 * change for the life of a document, and an inline one would resubscribe on
 * every render.
 */
export function PdfStage({
  url,
  file,
  onDownload,
  isDownloading,
}: {
  url: string;
  file: FileItem;
  onDownload?: () => void;
  isDownloading?: boolean;
}) {
  // `null` is the server's answer — "not asked yet" — and it renders the
  // skeleton rather than guessing; one frame of the wrong stage is worse than
  // one frame of the loading one.
  const canRenderInline = useSyncExternalStore(
    subscribeToNothing,
    readPdfViewerEnabled,
    () => null,
  );

  if (canRenderInline === null) return <LoadingStage />;

  if (canRenderInline) {
    return (
      // `key` so a re-minted URL replaces the view; an <embed> does not reload
      // on a bare src change any more than a <video> does.
      <embed
        key={url}
        src={url}
        type="application/pdf"
        title={file.name}
        className="size-full rounded-xl border border-border bg-card"
      />
    );
  }

  const kind = fileKind(file.name, file.contentType);

  return (
    <StageFrame>
      <kind.Icon
        weight="duotone"
        aria-hidden="true"
        className={cn("size-16 shrink-0", TINT_TEXT[kind.tint])}
      />
      <div className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">This browser can&apos;t show PDFs</h2>
        <p className="type-body mx-auto max-w-[46ch] text-pretty text-muted-foreground">
          {onDownload
            ? "Download it to read it in your usual PDF app."
            : "Open this link on a desktop browser to read it here."}
        </p>
      </div>
      {onDownload && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-6"
          disabled={isDownloading}
          onClick={onDownload}
        >
          {isDownloading && <CircleNotch className="animate-spin" />}
          Download
        </Button>
      )}
    </StageFrame>
  );
}

/**
 * Text, fetched and rendered as text.
 *
 * This is the one stage that pulls bytes into our own document instead of
 * pointing an element at the storage origin, so it is worth being explicit
 * about why that is safe: the response is inserted as a React child of a
 * `<pre>`, which sets it as *text*. It is never parsed as markup and cannot
 * execute, and the server only grants an inline URL for `text/plain` in the
 * first place. Handing the same bytes to `dangerouslySetInnerHTML` would be
 * the stored-XSS hole the allowlist exists to close.
 *
 * Capped at 256 KB. A shared log file can be hundreds of megabytes, and a
 * viewer that tries to lay all of it out stops being a viewer.
 *
 * Requires the bucket's CORS policy to admit the app's origin for GET, the
 * same way uploads need it for PUT (`pnpm storage:cors`). Without it the fetch
 * fails and the stage shows its failure state, which is the honest outcome.
 *
 * **Mount one of these per URL** — the caller keys it on `url`. Resetting the
 * pane for a new source is then remounting rather than clearing state from
 * inside an effect, which is both simpler and the shape React actually wants.
 */
export function TextStage({
  url,
  onMediaError,
}: {
  url: string;
  onMediaError: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        if (!live) return;
        setTruncated(body.length > TEXT_PREVIEW_LIMIT);
        setText(body.slice(0, TEXT_PREVIEW_LIMIT));
      } catch {
        // Indistinguishable from an expired URL from here, so it takes the
        // same route: one silent re-mint upstream, then the failure state.
        if (live) onMediaError();
      }
    })();

    return () => {
      live = false;
    };
  }, [url, onMediaError]);

  if (text === null) {
    return <Skeleton className="size-full rounded-xl" />;
  }

  return (
    <div className="flex size-full min-h-0 flex-col gap-2">
      <pre className="type-body min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card p-4 font-mono whitespace-pre">
        {text}
      </pre>
      {truncated && (
        <p className="type-caption shrink-0 text-center text-muted-foreground">
          Showing the first part of this file — download to view all.
        </p>
      )}
    </div>
  );
}

/** The centred column the picture-heading-line stages share. */
function StageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center px-6 py-10 text-center">
      {children}
    </div>
  );
}
