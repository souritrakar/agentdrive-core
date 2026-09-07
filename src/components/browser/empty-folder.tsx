"use client";

import { UploadPicker } from "@/components/upload";

/**
 * The empty folder state.
 *
 * An empty folder is the best opportunity the product gets to teach the upload
 * flow: it is the one moment the user definitely wants to put something here
 * and has nothing else to look at. Four elements, in descending size — picture,
 * heading, one line, one button.
 *
 * All three input paths are still covered, but each is stated exactly once.
 * Drag and paste have no visible affordance anywhere in the product, so the
 * sentence names them; browsing is the button, so the sentence does not. An
 * earlier version listed all three as equal-weighted items above the button and
 * repeated the third — which read as a list of chores rather than an
 * invitation.
 */
export function EmptyFolder() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <EmptyFolderIllustration />

      <div className="mt-8 flex flex-col gap-2">
        <h2 className="type-title">
          This folder is empty
        </h2>
        {/*
          One line, naming only the two paths that have no visible affordance.
          Browsing is the button directly below, so spelling it out here as
          well was the same instruction given twice — and a list of three
          equally-weighted routes turned out to read as more work to do, not
          less.
        */}
        <p className="type-body mx-auto max-w-[46ch] text-pretty text-muted-foreground">
          Drop files anywhere, or paste from your clipboard.
        </p>
      </div>

      {/*
        Secondary, not primary. Upload lives in the sidebar and is the page's
        one filled button; a second lime button here would be two things
        competing to be the obvious next move.
      */}
      <UploadPicker variant="outline" className="mt-6" label="Choose files" />
    </div>
  );
}

/**
 * Two documents settling into an open folder.
 *
 * Deliberately drawn from the same vocabulary as everything else — rounded
 * rectangles, one lime accent, the card surface and hairline the tiles use — so
 * it reads as part of the product rather than as stock art dropped into it. The
 * folder's front panel is painted over the documents, which is what makes them
 * look like they are going *in* rather than sitting behind.
 *
 * `aria-hidden` because the heading underneath already says what this is; a
 * described illustration would just make a screen reader say it twice.
 */
function EmptyFolderIllustration() {
  return (
    <svg
      viewBox="0 0 220 150"
      aria-hidden="true"
      // `strokeWidth` is set once here and inherited. Left at the SVG default
      // of 1, every outline renders at well under a pixel once the drawing is
      // scaled down to 160px, and the whole thing turns into a dark smudge.
      strokeWidth="2.5"
      strokeLinejoin="round"
      className="h-40 w-auto shrink-0"
    >
      {/* Back document, tilted away. */}
      <g transform="rotate(-10 101 46)">
        <rect
          x="76"
          y="14"
          width="50"
          height="66"
          rx="7"
          className="fill-card stroke-white/20"
        />
        <rect x="86" y="32" width="30" height="3.5" rx="1.75" className="fill-white/20" />
        <rect x="86" y="42" width="20" height="3.5" rx="1.75" className="fill-white/20" />
      </g>

      {/* Front document, tilted the other way, carrying the one accent. */}
      <g transform="rotate(10 121 42)">
        <rect
          x="96"
          y="10"
          width="50"
          height="66"
          rx="7"
          className="fill-card stroke-white/30"
        />
        <rect x="106" y="24" width="18" height="6" rx="3" className="fill-lime" />
        <rect x="106" y="38" width="30" height="3.5" rx="1.75" className="fill-white/25" />
        <rect x="106" y="48" width="22" height="3.5" rx="1.75" className="fill-white/25" />
      </g>

      {/*
        Folder back panel and its tab. Filled with the page background rather
        than left transparent, so the documents are occluded by it and read as
        being *behind* the folder rather than floating over it.
      */}
      <path
        d="M38 92V60A8 8 0 0 1 46 52H72A6 6 0 0 1 76.6 54.2L82 60H174A8 8 0 0 1 182 68V92Z"
        className="fill-background stroke-white/20"
      />

      {/* Front lip, painted last so the documents tuck in behind it. */}
      <rect
        x="38"
        y="80"
        width="144"
        height="52"
        rx="10"
        className="fill-card stroke-white/30"
      />
    </svg>
  );
}
