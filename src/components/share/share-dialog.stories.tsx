import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { within } from "storybook/test";

import { drive, files, folders, share, shareToken } from "@/fixtures";

import { ShareDialog } from "./share-dialog";
import type { Share } from "./types";

/**
 * The owner's whole sharing interface.
 *
 * Every action is a prop, so each state below is reached by handing the dialog
 * a different set of promises rather than by putting a backend into a
 * particular mood. The states that matter and are otherwise hard to see —
 * pending, revoke-confirm, a failed toggle — are all one story each.
 */
const shared: Share = { ...share, token: shareToken };

/*
  The action props are annotated rather than inferred. Left to inference, the
  meta narrows `loadShare` to `() => Promise<null>` and `createShare` to the
  exact shape of the fixture — and then every story handing back a different
  share fails to typecheck against the component it is a story for.
*/
const meta = {
  title: "Components/Share dialog",
  component: ShareDialog,
  parameters: { layout: "centered" },
  args: {
    name: files[1].name,
    targetKind: "file",
    open: true,
    onOpenChange: () => {},
    shareUrl: (token: string) => `https://agentdrive.app/share/${token}`,
    loadShare: (): Promise<Share | null> => Promise.resolve(null),
    createShare: (): Promise<Share> => Promise.resolve(shared),
    setAllowDownload: (): Promise<Share> => Promise.resolve(shared),
    revokeShare: (): Promise<void> => Promise.resolve(),
  },
} satisfies Meta<typeof ShareDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const pending = <T,>() => () => new Promise<T>(() => {});

/*
  Radix portals dialog content to `document.body`, which is outside the story
  canvas — a `canvas`-scoped query finds an empty `aria-hidden` shell and
  nothing else. Every interaction below therefore reaches for the document.
*/
const dialog = () => within(document.body);

const failing = () => () =>
  Promise.reject(
    Object.assign(new Error("Backend unavailable"), {
      status: 503,
      code: "unavailable",
    }),
  );

/**
 * State A — nothing shared yet. One sentence about what a link would mean, and
 * one button. The sentence is the whole consent moment, so it says the subtree
 * consequence out loud.
 */
export const NotShared: Story = {};

/**
 * A folder rather than a file: the copy gains "and everything inside it",
 * which is the one thing an owner must understand before minting a link.
 */
export const NotSharedFolder: Story = {
  args: { name: folders[1].name, targetKind: "folder" },
};

/** A whole drive. Same shape, biggest consequence. */
export const NotSharedDrive: Story = {
  args: { name: drive.name, targetKind: "drive" },
};

/** Opening. Two rows of skeleton rather than an empty dialog that pops. */
export const Loading: Story = {
  args: { loadShare: pending<Share | null>() },
};

/** Minting the link. The button carries the wait; nothing else moves. */
export const Creating: Story = {
  args: { createShare: pending<Share>() },
};

/**
 * State B — shared. The field is focused and pre-selected on arrival, because
 * the next act after minting a link is always copying it.
 */
export const Shared: Story = {
  args: { loadShare: (): Promise<Share> => Promise.resolve(shared) },
};

/**
 * Downloads off. The helper line makes the honest claim — the button goes
 * away, the bytes do not. Copy that promised more would be a promise the
 * product cannot keep.
 */
export const DownloadDisabled: Story = {
  args: {
    loadShare: (): Promise<Share> =>
      Promise.resolve({ ...shared, allowDownload: false }),
  },
};

/**
 * The toggle failed. It flips optimistically, so the interesting behaviour is
 * the reconciliation: the switch goes back to where it was and the reason
 * appears inline rather than as a toast that outlives the dialog.
 */
export const ToggleFailed: Story = {
  args: {
    loadShare: (): Promise<Share> => Promise.resolve(shared),
    setAllowDownload: failing(),
  },
};

/**
 * Revoke, confirmed inline.
 *
 * The row becomes the question rather than opening an AlertDialog on top of a
 * Dialog — nesting them moves focus twice and leaves the owner two Escapes
 * from where they started.
 */
export const RevokeConfirm: Story = {
  args: { loadShare: (): Promise<Share> => Promise.resolve(shared) },
  play: async ({ userEvent }) => {
    await userEvent.click(
      await dialog().findByRole("button", { name: "Revoke link" }),
    );
  },
};

/**
 * After revoking. Back to state A, plus the one line that teaches the rule the
 * owner is about to meet: the next link will be a different link.
 */
export const JustRevoked: Story = {
  args: { loadShare: (): Promise<Share> => Promise.resolve(shared) },
  play: async ({ userEvent }) => {
    await userEvent.click(
      await dialog().findByRole("button", { name: "Revoke link" }),
    );
    await userEvent.click(await dialog().findByRole("button", { name: "Revoke" }));
  },
};

/** The create failed. Inline, under the control that failed, dialog stays put. */
export const CreateFailed: Story = {
  args: { createShare: failing() },
  play: async ({ userEvent }) => {
    await userEvent.click(
      await dialog().findByRole("button", { name: "Create link" }),
    );
  },
};

/**
 * Live, so the transition from A to B can be judged as a movement rather than
 * by comparing two static stories — including the focus landing in the field.
 */
export const Interactive: Story = {
  render: function Interactive(args) {
    const [current, setCurrent] = useState<Share | null>(null);

    return (
      <ShareDialog
        {...args}
        loadShare={() => Promise.resolve(current)}
        createShare={() => {
          setCurrent(shared);
          return Promise.resolve(shared);
        }}
        setAllowDownload={(allow) => {
          const next = { ...shared, allowDownload: allow };
          setCurrent(next);
          return Promise.resolve(next);
        }}
        revokeShare={() => {
          setCurrent(null);
          return Promise.resolve();
        }}
      />
    );
  },
};
