"use client";

import {
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Warning,
  X,
} from "@phosphor-icons/react/ssr";
import { useState } from "react";

import { useUpload } from "./upload-provider";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Upload progress, docked bottom-right.
 *
 * A tray rather than a modal or a toast stack: uploads run while you keep
 * working, so the UI has to stay out of the way while remaining glanceable. It
 * only exists while there is something to report, and it never auto-dismisses a
 * failure — the one case the user has to act on.
 */
export function UploadTray() {
  const { tasks, retry, dismiss, clearCompleted } = useUpload();
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  // Queued counts as active: the work is accepted and outstanding, and a tray
  // that says "Uploaded 3 files" while four more wait their turn is lying.
  const active = tasks.filter(
    (t) => t.status === "uploading" || t.status === "queued",
  );
  const failed = tasks.filter((t) => t.status === "failed");
  const done = tasks.filter((t) => t.status === "done");

  const heading =
    active.length > 0
      ? `Uploading ${active.length} ${active.length === 1 ? "file" : "files"}`
      : failed.length > 0
        ? `${failed.length} ${failed.length === 1 ? "upload" : "uploads"} failed`
        : `Uploaded ${done.length} ${done.length === 1 ? "file" : "files"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-popover inset-ring inset-ring-white/10 duration-200 animate-in slide-in-from-bottom-2"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <p className="type-label min-w-0 flex-1 truncate">{heading}</p>

        {active.length === 0 && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={clearCompleted}
            aria-label="Clear finished uploads"
            className="text-muted-foreground hover:text-foreground"
          >
            <X />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show uploads" : "Hide uploads"}
          className="text-muted-foreground hover:text-foreground"
        >
          <CaretDown
            className={cn("transition-transform", collapsed && "-rotate-180")}
          />
        </Button>
      </div>

      {!collapsed && (
        <ul
          role="list"
          className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border"
        >
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="type-body truncate">{task.name}</p>

                {task.status === "uploading" ? (
                  // Native progress element would need restyling in every browser;
                  // a div pair is simpler and the width comes from a CSS variable
                  // rather than an inline style property.
                  <div
                    className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={Math.round(task.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${task.name}`}
                  >
                    <div
                      className="h-full w-(--progress) rounded-full bg-lime transition-[width] duration-200"
                      style={{ "--progress": `${task.progress * 100}%` } as React.CSSProperties}
                    />
                  </div>
                ) : (
                  <p className="type-meta mt-0.5 truncate text-muted-foreground">
                    {task.status === "failed"
                      ? (task.error ?? "Upload failed.")
                      : task.status === "queued"
                        ? // Named rather than shown as a bar frozen at zero,
                          // which reads as a stalled upload rather than a
                          // waiting one.
                          `Waiting · ${formatBytes(task.size)}`
                        : formatBytes(task.size)}
                  </p>
                )}
              </div>

              {task.status === "done" && (
                <Check className="size-4 shrink-0 text-lime" />
              )}
              {task.status === "failed" && (
                <>
                  <Warning
                    className="size-4 shrink-0 text-destructive"
                    weight="duotone"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => retry(task.id)}
                    aria-label={`Retry ${task.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowCounterClockwise />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => dismiss(task.id)}
                    aria-label={`Dismiss ${task.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
