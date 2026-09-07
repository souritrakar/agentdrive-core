"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError } from "@/lib/api-error";
import { retryUpload, uploadFile } from "@/lib/drive-api";
import type { Item } from "@/lib/types";

export type UploadTask = {
  id: string;
  name: string;
  size: number;
  /** 0–1. */
  progress: number;
  status: "queued" | "uploading" | "done" | "failed";
  error?: string;
  /** Kept so a failed upload can be retried without re-picking the file. */
  file: File;
  /**
   * The server's idempotency key for this file, fixed when it was picked.
   *
   * Stable across attempts on purpose: a double-submit, or a reserve whose
   * response was lost, resolves to the same file instead of a second copy.
   */
  clientId: string;
  /**
   * Set once the server has a row for this file. Its presence is what lets a
   * retry replace the bytes of the existing file rather than upload a new one
   * beside it.
   */
  itemId?: string;
};

/**
 * Files transferring at once.
 *
 * Browsers cap connections per origin anyway, so a bigger number does not move
 * bytes faster — it just splits the same bandwidth across more progress bars
 * and makes every one of them slower and less honest.
 */
const FILE_CONCURRENCY = 3;

type UploadContextValue = {
  tasks: UploadTask[];
  isDraggingOver: boolean;
  addFiles: (files: File[]) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  clearCompleted: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUpload must be used inside UploadProvider");
  return context;
}

let taskSequence = 0;

/**
 * Owns the upload queue and the drop-anywhere behaviour.
 *
 * Two things make this feel like Drive rather than a form:
 *
 * 1. **The whole window is the drop target.** Listeners are on `window`, not on a
 *    bordered rectangle, so a file dropped anywhere lands. The visible affordance
 *    only appears once a drag is actually in progress.
 * 2. **Paste works.** A screenshot on the clipboard is the most common thing a
 *    person has and the thing most file UIs refuse to accept.
 *
 * Drag events fire constantly on every child element, so entry/exit is tracked
 * with a counter rather than by watching a single element's enter/leave — that is
 * the standard fix for the flicker you get otherwise.
 */
export function UploadProvider({
  driveId,
  parentId,
  children,
}: {
  driveId: string;
  parentId: string | null;
  children: React.ReactNode;
}) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDraggingOver, setDraggingOver] = useState(false);
  const dragDepth = useRef(0);

  // Queue state lives in refs, not state: it changes on every started and
  // finished upload, and none of those transitions are something to render.
  const queue = useRef<UploadTask[]>([]);
  const inFlight = useRef(0);
  const pumpRef = useRef<() => void>(() => {});

  // A mirror of `tasks` readable outside a state updater. Enqueuing a retry is
  // a side effect, and React may run an updater twice — which would queue the
  // same file twice.
  const tasksRef = useRef<UploadTask[]>([]);

  // Held in a ref so the window listeners always upload to the current folder
  // without being torn down and re-attached on every navigation.
  const target = useRef({ driveId, parentId });

  const patch = useCallback((id: string, changes: Partial<UploadTask>) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    );
  }, []);

  const run = useCallback(
    async (task: UploadTask) => {
      patch(task.id, { status: "uploading", progress: 0, error: undefined });
      const onProgress = (progress: number) => patch(task.id, { progress });
      const onReserved = (item: { id: string }) =>
        patch(task.id, { itemId: item.id });

      const fresh = () =>
        uploadFile(target.current, task.file, onProgress, {
          // Stable across attempts, so a reserve whose response was lost
          // resolves to the file already created rather than a second copy.
          clientId: task.clientId,
          onReserved,
        });

      try {
        /*
          A retry keeps the file. Going through the item's own retry route
          replaces the bytes of the row that already exists, where a fresh
          upload would leave the failed one behind and add "name (2)" next to
          it — which is what the user was trying to avoid by pressing retry.

          It only applies to a file the server has already marked failed. When
          the last attempt died without reaching the server — a dropped
          connection, a closed laptop — the file is still pending there and the
          retry route refuses it, so reserving again with the same key picks up
          the same file instead.
        */
        let item: Item;
        if (task.itemId) {
          try {
            item = await retryUpload(task.itemId, task.file, onProgress, {
              onReserved,
            });
          } catch (cause) {
            if (
              !(cause instanceof ApiError) ||
              cause.code !== "invalid_upload_transition"
            ) {
              throw cause;
            }
            item = await fresh();
          }
        } else {
          item = await fresh();
        }
        patch(task.id, { progress: 1, status: "done", itemId: item.id });
      } catch (cause) {
        patch(task.id, {
          status: "failed",
          error: cause instanceof Error ? cause.message : "Upload failed.",
        });
      }
    },
    [patch],
  );

  /**
   * Starts queued work up to the concurrency cap.
   *
   * Called when tasks arrive and again whenever one finishes, so the queue
   * drains at a steady width rather than in bursts.
   */
  const pump = useCallback(() => {
    while (inFlight.current < FILE_CONCURRENCY && queue.current.length > 0) {
      const next = queue.current.shift();
      if (!next) break;
      inFlight.current += 1;
      void run(next).finally(() => {
        inFlight.current -= 1;
        pumpRef.current();
      });
    }
  }, [run]);

  /*
    Mirrors, synced after the render rather than during it.

    Writing a ref while rendering is unsafe — React may discard that render —
    and every reader below runs from a DOM event or a promise callback, both of
    which happen after commit. `pumpRef` additionally lets an upload that
    finishes minutes from now reach the current `pump` rather than the one its
    `finally` closed over.
  */
  useEffect(() => {
    target.current = { driveId, parentId };
    tasksRef.current = tasks;
    pumpRef.current = pump;
  });

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const created = files.map<UploadTask>((file) => ({
        id: `up_${(taskSequence++).toString(36)}`,
        name: file.name || "pasted-file",
        size: file.size,
        progress: 0,
        status: "queued",
        file,
        // Fixed here rather than per attempt: this is the identity of the
        // upload the person asked for, not of any one try at it.
        clientId: crypto.randomUUID(),
      }));

      setTasks((current) => [...current, ...created]);
      queue.current.push(...created);
      pump();
    },
    [pump],
  );

  const retry = useCallback(
    (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task || task.status !== "failed") return;

      patch(id, { progress: 0, status: "queued", error: undefined });
      // Queued rather than started: a retry waits its turn like anything else,
      // so retrying ten failures does not open ten connections at once.
      queue.current.push({ ...task, progress: 0, error: undefined });
      pump();
    },
    [patch, pump],
  );

  const dismiss = useCallback((id: string) => {
    setTasks((current) => current.filter((t) => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((current) => current.filter((t) => t.status !== "done"));
  }, []);

  // Drop anywhere in the window.
  useEffect(() => {
    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }

    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setDraggingOver(true);
    }

    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      // Required, or the browser navigates to the file instead of dropping it.
      event.preventDefault();
    }

    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDraggingOver(false);
    }

    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDraggingOver(false);
      addFiles(Array.from(event.dataTransfer?.files ?? []));
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  // Paste — clipboard images and files.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      // Never hijack a paste the user meant for a text field.
      const node = event.target as HTMLElement | null;
      if (
        node &&
        (node.isContentEditable ||
          node.tagName === "INPUT" ||
          node.tagName === "TEXTAREA")
      ) {
        return;
      }

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;

      event.preventDefault();
      addFiles(
        files.map((file) => {
          if (file.name) return file;
          // Clipboard images arrive unnamed; give them something meaningful.
          const extension = file.type.split("/")[1] ?? "png";
          return new File([file], `pasted-image.${extension}`, {
            type: file.type,
          });
        }),
      );
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const value = useMemo<UploadContextValue>(
    () => ({
      tasks,
      isDraggingOver,
      addFiles,
      retry,
      dismiss,
      clearCompleted,
    }),
    [tasks, isDraggingOver, addFiles, retry, dismiss, clearCompleted],
  );

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}
