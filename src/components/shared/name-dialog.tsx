"use client";

import { CircleNotch } from "@phosphor-icons/react/ssr";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { failureSentence } from "@/lib/api-error";

type Props = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
};

/**
 * "Give it a name" dialog, shared by drive and folder creation.
 *
 * Errors render inline beneath the field rather than as a toast: the mistake is
 * in the field, so the correction belongs there, and the dialog stays open with
 * what the user typed intact.
 */
export function NameDialog({
  trigger,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  function reset() {
    setName("");
    setError(null);
    setPending(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setOpen(false);
      reset();
    } catch (cause) {
      // Same source of truth as the full-page error state, so an outage is
      // described one way whether you hit it browsing or submitting. A raw
      // `cause.message` here used to surface whatever the network threw.
      setError(failureSentence(cause));
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{label}</Label>
            <Input
              id={fieldId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              autoFocus
              autoComplete="off"
              maxLength={255}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} role="alert" className="type-body text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <CircleNotch className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
