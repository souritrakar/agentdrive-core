"use client";

import { UploadSimple } from "@phosphor-icons/react/ssr";
import { useRef } from "react";

import { useUpload } from "./upload-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The explicit path to uploading, for people who don't drag.
 *
 * Drag-and-drop and paste are faster once you know they exist, but a visible
 * button is the only one that's discoverable, so it stays the page's primary
 * action.
 *
 * Parameterised because there are up to three of these in play — the sidebar's
 * filled button, the same one collapsed to an icon, and an outline copy in the
 * empty state — and they must not look alike. Sharing the component rather than
 * the markup means the hidden input and its reset-on-change exist once.
 */
export function UploadPicker({
  variant = "default",
  size = "lg",
  label = "Upload",
  tooltip,
  className,
}: {
  variant?: "default" | "outline";
  size?: "sm" | "lg" | "icon-lg";
  /** Empty renders an icon-only button; pass `tooltip` to keep it named. */
  label?: string;
  tooltip?: string;
  className?: string;
}) {
  const { addFiles } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const isIconOnly = size === "icon-lg" || label === "";

  const button = (
    <Button
      variant={variant}
      size={size}
      aria-label={isIconOnly ? (tooltip ?? "Upload") : undefined}
      className={cn(
        !isIconOnly && (size === "lg" ? "py-2 pr-3 pl-2" : "py-1.5 pr-2.5 pl-1.5"),
        className,
      )}
      onClick={() => inputRef.current?.click()}
    >
      <UploadSimple data-icon={isIconOnly ? undefined : "inline-start"} />
      {isIconOnly ? null : label}
    </Button>
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // Reset, or picking the same file twice in a row is a no-op.
          event.target.value = "";
        }}
      />
      {tooltip ? (
        <Tooltip>
          {/*
            The Button is the trigger, not a wrapper around it. Radix's
            `asChild` does not make a non-focusable element focusable, so a
            `<span>` here would put the label out of reach of the keyboard.
          */}
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </>
  );
}
