"use client";

import { UploadSimple } from "@phosphor-icons/react/ssr";

import { useUpload } from "./upload-provider";

/**
 * The visible half of "drop anywhere".
 *
 * Hidden until a drag is actually in progress — a permanent dashed rectangle
 * takes up space to advertise something the user only needs to know at the moment
 * they are already dragging.
 *
 * `pointer-events-none` is essential: the overlay is feedback only, and the drop
 * itself is handled by the window listener underneath it.
 */
export function DropOverlay() {
  const { isDraggingOver } = useUpload();

  if (!isDraggingOver) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6 backdrop-blur-[2px] duration-100 animate-in fade-in-0"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-lime/60 bg-lime/5 px-10 py-12 duration-150 animate-in zoom-in-95">
        {/*
          A focal object, not inline chrome — this panel is 200px of empty
          space and a 16px glyph in the middle of it reads as an accident.
        */}
        <UploadSimple weight="duotone" className="size-8 shrink-0 text-lime" />
        <p className="type-label">Drop to upload</p>
        <p className="type-body text-muted-foreground">
          Files land in the folder you are viewing.
        </p>
      </div>
    </div>
  );
}
