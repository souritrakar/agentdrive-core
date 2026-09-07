import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Group, Sheet } from "./specimen";

const meta = {
  title: "Foundations/Typography",
  parameters: { layout: "fullscreen", controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ROLES = [
  ["type-display", "The page title. One per page.", "Drives"],
  ["type-title", "Dialog titles and major section headings.", "This folder is empty"],
  ["type-heading", "Card and panel headings.", "Recent activity"],
  ["type-metric", "A single figure that is the point of its container.", "1,284 files"],
  ["type-body", "Running text: descriptions, empty states, dialog bodies.", "Drop files anywhere on this page to upload them, or paste an image straight from your clipboard."],
  ["type-label", "The name of a thing in a list; a control's label.", "Quarterly report.pdf"],
  ["type-meta", "Row metadata with figures — size, date, count.", "4.2 MB · updated 3 hours ago"],
  ["type-detail", "Small secondary prose. Same level as meta, no figures.", "We could not reach the server. Check your connection and try again."],
  ["type-caption", "Helper text and fine print.", "Maximum 5 GB per file"],
  ["type-eyebrow", "A label above a group of items.", "Drives"],
] as const;

/**
 * Every type role at its real size, with copy of the kind it actually holds.
 *
 * Lorem ipsum would hide the two things worth checking here: whether a filename
 * fits, and whether the metadata still loses to the name it sits under.
 */
export const Scale: Story = {
  render: () => (
    <Sheet
      title="Typography"
      intro="Ten roles, each carrying size, line height, weight, tracking and numeric alignment together — a size on its own is not a decision. In product code `type-*` sets typography and `text-*` sets colour, so a class list can be read at a glance. Raw text-sm / text-base are blocked by pnpm check:tokens."
    >
      <Group
        title="Roles"
        note="Resize this pane below 640px to see the responsive step. Most roles run 16px on phones and 14px on desktop (13px for meta and detail) — comfortable at arm's length, dense at a desk, and large enough that iOS does not zoom a focused field."
      >
        <div className="flex flex-col divide-y divide-border">
          {ROLES.map(([role, use, sample]) => (
            <div
              key={role}
              className="grid gap-3 py-6 sm:grid-cols-[14rem_1fr] sm:gap-8"
            >
              <div className="flex flex-col gap-1">
                <code className="type-caption text-foreground">{role}</code>
                <span className="type-caption text-pretty text-muted-foreground">
                  {use}
                </span>
              </div>
              <p className={`${role} max-w-[52ch] text-pretty`}>{sample}</p>
            </div>
          ))}
        </div>
      </Group>
    </Sheet>
  ),
};

/**
 * The roles doing their actual job, at their actual relative sizes.
 *
 * A scale looks fine listed out and falls apart in composition — this is where
 * you find out whether the filename really wins over its metadata.
 */
export const InContext: Story = {
  render: () => (
    <Sheet
      title="Hierarchy in composition"
      intro="The same roles arranged the way a screen arranges them. If everything is the same weight, nothing is — this is the view that shows whether the hierarchy actually holds."
    >
      <Group title="A page header">
        <div className="flex flex-col gap-2">
          <h1 className="type-display">Drives</h1>
          <p className="type-body max-w-[60ch] text-pretty text-muted-foreground">
            Every file you and your agents put somewhere.
          </p>
        </div>
      </Group>

      <Group title="A row in a list">
        <div className="flex max-w-md flex-col gap-1 rounded-xl bg-card p-4 inset-ring inset-ring-white/5">
          <p className="type-label truncate">Q3 financial model.xlsx</p>
          <p className="type-meta truncate text-muted-foreground">
            4.2 MB · updated 3 hours ago
          </p>
        </div>
      </Group>

      <Group
        title="Figures in a column"
        note="type-meta and type-metric carry tabular figures. A column of sizes with proportional digits does not line up, and a column that does not line up is one the eye cannot scan."
      >
        <table className="w-full max-w-md text-left">
          <tbody className="divide-y divide-border">
            {[
              ["Q1 report.pdf", "812 KB"],
              ["annual-summary.xlsx", "11.4 MB"],
              ["notes.md", "3 KB"],
              ["archive.zip", "1.2 GB"],
            ].map(([name, size]) => (
              <tr key={name}>
                <td className="type-body py-2.5">{name}</td>
                <td className="type-meta py-2.5 text-right text-muted-foreground">
                  {size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
    </Sheet>
  ),
};
