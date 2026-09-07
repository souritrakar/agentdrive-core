import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ErrorState, InlineError } from "./error-state";

/**
 * The states you normally have to break the backend to see.
 *
 * Being able to open these from a sidebar — rather than by unplugging the
 * database — is most of the reason this workbench exists. Each story is a
 * different failure the product distinguishes between, because "something went
 * wrong" for all of them is how a user ends up with no idea what to do next.
 */
const meta = {
  title: "Sections/Error state",
  component: ErrorState,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

/** The network is gone. Retrying is the whole answer, so retry is offered. */
export const Offline: Story = {
  args: {
    error: new TypeError("Failed to fetch"),
    onRetry: async () => {
      await new Promise((r) => setTimeout(r, 900));
    },
  },
};

/**
 * The one case where the heading has to name the thing — "That folder isn't
 * here" tells the user something; "Not found" does not.
 */
export const NotFound: Story = {
  args: { error: httpError(404, "Not found"), noun: "folder" },
};

/** Signed in, but not for this. Retrying would not help, so it is not offered. */
export const Forbidden: Story = {
  args: { error: httpError(403, "Forbidden") },
};

/** The server broke. The user did nothing wrong and retry is worth a try. */
export const ServerError: Story = {
  args: {
    error: httpError(500, "Internal server error"),
    onRetry: async () => {
      await new Promise((r) => setTimeout(r, 900));
    },
  },
};

/** Something we did not anticipate — the fallback must still be plain English. */
export const Unexpected: Story = {
  args: { error: new Error("Cannot read properties of undefined") },
};

/**
 * The compact form, for a failure inside a region that still has a working
 * page around it — the sidebar's drive list, for instance.
 */
export const Inline: StoryObj<typeof InlineError> = {
  render: () => (
    <div className="max-w-72 p-6">
      <InlineError
        error={new TypeError("Failed to fetch")}
        onRetry={async () => {
          await new Promise((r) => setTimeout(r, 900));
        }}
      />
    </div>
  ),
};
