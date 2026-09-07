"use client";

import {
  ArrowRight,
  CaretRight,
  CircleNotch,
  DotsThreeVertical,
  Folder,
  HardDrive,
  LinkSimple,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShareDialog } from "@/components/share";
import { failureSentence } from "@/lib/api-error";
import {
  createShare,
  getFolderContents,
  getShare,
  moveItem,
  renameItem,
  restoreItem,
  revokeShare,
  setShareDownload,
  trashItem,
} from "@/lib/drive-api";
import { shareUrl } from "@/lib/share-url";
import type { FolderPage, Item, MoveItemResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type ActiveDialog = "share" | "rename" | "move" | "trash" | null;

/** The only metadata-action interface tiles and rows need to learn. */
export function ItemActions({
  driveId,
  item,
  className,
}: {
  driveId: string;
  item: Item;
  className?: string;
}) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  return (
    <div className={cn("shrink-0", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${item.name}`}
            className="relative text-muted-foreground"
          >
            <DotsThreeVertical />
            <span
              aria-hidden="true"
              className="pointer-fine:hidden pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {/* First, and above Rename: once sharing exists it is the action
              owners come to this menu for, and the menu is short enough that
              ordering it by intent costs nothing. */}
          <DropdownMenuItem onSelect={() => setActiveDialog("share")}>
            <LinkSimple />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActiveDialog("rename")}>
            <PencilSimple />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActiveDialog("move")}>
            <ArrowRight />
            Move
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setActiveDialog("trash")}
          >
            <Trash />
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareItemDialog
        item={item}
        open={activeDialog === "share"}
        onOpenChange={(open) => setActiveDialog(open ? "share" : null)}
      />
      <RenameItemDialog
        key={`${item.id}:${item.name}`}
        item={item}
        open={activeDialog === "rename"}
        onOpenChange={(open) => setActiveDialog(open ? "rename" : null)}
      />
      <MoveItemDialog
        driveId={driveId}
        item={item}
        open={activeDialog === "move"}
        onOpenChange={(open) => setActiveDialog(open ? "move" : null)}
      />
      <TrashItemDialog
        item={item}
        open={activeDialog === "trash"}
        onOpenChange={(open) => setActiveDialog(open ? "trash" : null)}
      />
    </div>
  );
}

/**
 * `ShareDialog`, wired to the API for one Item.
 *
 * The dialog itself is presentational — it takes four actions as props and owns
 * no data layer, which is what lets every one of its states be a story instead
 * of a backend condition someone has to reproduce. This is the seam where those
 * props become real requests, and it is deliberately the only place in the
 * browser feature that knows sharing has an API at all.
 */
function ShareItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const subject = { kind: "ITEM", itemId: item.id } as const;

  return (
    <ShareDialog
      name={item.name}
      targetKind={item.kind === "FOLDER" ? "folder" : "file"}
      open={open}
      onOpenChange={onOpenChange}
      loadShare={() => getShare(subject)}
      createShare={() => createShare(subject)}
      setAllowDownload={(allow) => setShareDownload(subject, allow)}
      revokeShare={() => revokeShare(subject)}
      shareUrl={shareUrl}
    />
  );
}

export function RenameItemDialog({
  item,
  open,
  onOpenChange,
  rename = renameItem,
}: {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rename?: (itemId: string, name: string) => Promise<Item>;
}) {
  const [name, setName] = useState(item.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (next) setName(item.name);
    setError(null);
    setPending(false);
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const nextName = name.trim();
    if (!nextName) {
      setError("Enter a name.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const updated = await rename(item.id, nextName);
      changeOpen(false);
      toast.success(`Renamed to ${updated.name}`);
    } catch (cause) {
      setError(failureSentence(cause));
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="type-title">Rename {item.kind === "FOLDER" ? "folder" : "file"}</DialogTitle>
          <DialogDescription className="type-body">
            This changes only the visible name. Existing links keep working.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`rename-${item.id}`}>Name</Label>
            <Input
              id={`rename-${item.id}`}
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              autoFocus
              autoComplete="off"
              maxLength={255}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `rename-error-${item.id}` : undefined}
            />
            {error && (
              <p id={`rename-error-${item.id}`} role="alert" className="type-body text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending || name.trim() === item.name}>
              {pending && <CircleNotch className="animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FolderLoader = (
  driveId: string,
  parentId: string | null,
  cursor?: string,
) => Promise<FolderPage>;

type MoveMutation = (
  itemId: string,
  newParentId: string | null,
) => Promise<MoveItemResult>;

type DestinationState = {
  parentId: string | null;
  page: FolderPage | null;
  folders: Array<Extract<Item, { kind: "FOLDER" }>>;
  nextCursor: string | null;
  pending: boolean;
  error: string | null;
};

export function MoveItemDialog({
  driveId,
  item,
  open,
  onOpenChange,
  loadFolder = getFolderContents,
  move = moveItem,
}: {
  driveId: string;
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadFolder?: FolderLoader;
  move?: MoveMutation;
}) {
  const [destination, setDestination] = useState<DestinationState>({
    parentId: null,
    page: null,
    folders: [],
    nextCursor: null,
    pending: false,
    error: null,
  });
  const [moving, setMoving] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (
    parentId: string | null,
    cursor?: string,
    append = false,
  ) => {
    const currentRequest = ++requestId.current;
    setDestination((current) => ({
      parentId,
      page: append ? current.page : null,
      folders: append ? current.folders : [],
      nextCursor: append ? current.nextCursor : null,
      pending: true,
      error: null,
    }));

    try {
      const page = await loadFolder(driveId, parentId, cursor);
      if (currentRequest !== requestId.current) return;
      const pageFolders = page.items.filter(
        (entry): entry is Extract<Item, { kind: "FOLDER" }> =>
          entry.kind === "FOLDER" && entry.id !== item.id,
      );
      setDestination((current) => ({
        parentId,
        page,
        folders: append ? [...current.folders, ...pageFolders] : pageFolders,
        nextCursor: page.nextCursor,
        pending: false,
        error: null,
      }));
    } catch (cause) {
      if (currentRequest !== requestId.current) return;
      setDestination((current) => ({
        ...current,
        pending: false,
        error: failureSentence(cause),
      }));
    }
  }, [driveId, item.id, loadFolder]);

  useEffect(() => {
    if (open) void load(null);
  }, [load, open]);

  function changeOpen(next: boolean) {
    if (!next) requestId.current += 1;
    setMoving(false);
    onOpenChange(next);
  }

  async function submitMove() {
    if (moving || destination.parentId === item.parentId) return;
    setMoving(true);
    try {
      const result = await move(item.id, destination.parentId);
      changeOpen(false);
      toast.success(`Moved ${result.item.name}`);
    } catch (cause) {
      setDestination((current) => ({
        ...current,
        error: failureSentence(cause),
      }));
      setMoving(false);
    }
  }

  const trail = destination.page
    ? [
        ...destination.page.ancestors,
        ...(destination.page.currentFolder
          ? [{ id: destination.page.currentFolder.id, name: destination.page.currentFolder.name }]
          : []),
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="type-title">Move {item.name}</DialogTitle>
          <DialogDescription className="type-body">
            Choose a folder in this drive. Moving metadata does not move file bytes.
          </DialogDescription>
        </DialogHeader>

        <nav aria-label="Destination" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load(null)}>
            <HardDrive />
            Drive root
          </Button>
          {trail.map((crumb) => (
            <div key={crumb.id} className="flex shrink-0 items-center gap-1">
              <CaretRight className="size-3.5 text-muted-foreground" />
              <Button type="button" variant="ghost" size="sm" onClick={() => void load(crumb.id)}>
                {crumb.name}
              </Button>
            </div>
          ))}
        </nav>

        <div className="min-h-48 rounded-lg bg-muted/40 p-1 inset-ring inset-ring-white/5">
          {destination.pending && destination.folders.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center">
              <CircleNotch className="size-5 animate-spin text-muted-foreground" />
              <span className="sr-only">Loading folders</span>
            </div>
          ) : destination.error && destination.folders.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
              <p role="alert" className="type-body text-destructive">{destination.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load(destination.parentId)}>
                Try again
              </Button>
            </div>
          ) : destination.folders.length > 0 ? (
            <ul role="list" className="divide-y divide-border">
              {destination.folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    onClick={() => void load(folder.id)}
                    className="type-body flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Folder weight="duotone" className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <CaretRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-48 items-center justify-center px-6 text-center">
              <p className="type-body text-muted-foreground">No folders here. You can move the item into this location.</p>
            </div>
          )}

          {destination.nextCursor && (
            <div className="flex justify-center p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={destination.pending}
                onClick={() => void load(destination.parentId, destination.nextCursor ?? undefined, true)}
              >
                {destination.pending ? "Loading…" : "Load more folders"}
              </Button>
            </div>
          )}
        </div>

        {destination.error && destination.folders.length > 0 && (
          <p role="alert" className="type-detail text-destructive">{destination.error}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={moving || destination.pending || destination.parentId === item.parentId}
            onClick={() => void submitMove()}
          >
            {moving && <CircleNotch className="animate-spin" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrashItemDialog({
  item,
  open,
  onOpenChange,
  trash = trashItem,
  restore = restoreItem,
}: {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trash?: typeof trashItem;
  restore?: typeof restoreItem;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (!next) {
      setPending(false);
      setError(null);
    }
    onOpenChange(next);
  }

  async function confirmTrash() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await trash(item.id);
      changeOpen(false);
      toast.success(`Moved ${item.name} to trash`, {
        action: {
          label: "Undo",
          onClick: () => {
            void restore(item.id)
              .then((restored) => toast.success(`Restored ${restored.name}`))
              .catch((cause) => toast.error(failureSentence(cause)));
          },
        },
      });
    } catch (cause) {
      setError(failureSentence(cause));
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="type-title">Move {item.name} to trash?</AlertDialogTitle>
          <AlertDialogDescription className="type-body">
            {item.kind === "FOLDER"
              ? "The folder and its active contents will disappear from normal browsing. You can undo this action."
              : "The file will disappear from normal browsing. Its stored bytes are not deleted."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="type-body text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void confirmTrash();
            }}
          >
            {pending && <CircleNotch className="animate-spin" />}
            Move to trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
