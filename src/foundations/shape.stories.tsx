import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Group, Sheet, useTokenValue } from "./specimen";

const meta = {
  title: "Foundations/Shape & Elevation",
  parameters: { layout: "fullscreen", controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function RadiusSpecimen({ utility, use }: { utility: string; use: string }) {
  const value = useTokenValue(`--radius-${utility.replace("rounded-", "")}`);
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`h-20 w-full bg-card inset-ring inset-ring-white/8 ${utility}`} />
      <div className="flex flex-col gap-0.5">
        <code className="type-caption text-foreground">{utility}</code>
        <span className="type-caption text-muted-foreground">{use}</span>
        <span className="type-caption text-muted-foreground/60">{value || " "}</span>
      </div>
    </div>
  );
}

/**
 * One base value with every step derived from it, so changing `--radius` alone
 * moves the whole product between sharp and soft.
 */
export const Radius: Story = {
  render: () => (
    <Sheet
      title="Shape"
      intro="Radius is a single token, --radius, with every step calculated from it. That is what makes 'try this a bit softer' a one-line experiment rather than a search across every component."
    >
      <Group
        title="Steps"
        note="Kept on Tailwind's size names rather than role names, because the vendored shadcn components in src/components/ui are generated against rounded-lg and rounded-xl — re-mapping them would be overwritten on the next registry update."
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-5">
          <RadiusSpecimen utility="rounded-sm" use="badges, small chips" />
          <RadiusSpecimen utility="rounded-md" use="menu items, inline controls" />
          <RadiusSpecimen utility="rounded-lg" use="buttons, inputs, menus" />
          <RadiusSpecimen utility="rounded-xl" use="cards and tiles" />
          <RadiusSpecimen utility="rounded-2xl" use="large panels" />
          <RadiusSpecimen utility="rounded-3xl" use="feature surfaces" />
        </div>
      </Group>
    </Sheet>
  ),
};

/**
 * Two shadows. That is the complete set.
 */
export const Elevation: Story = {
  render: () => (
    <Sheet
      title="Elevation"
      intro="Two shadows, and no third. If something needs another to read as separate from what is behind it, the spacing around it is wrong — fix the spacing."
    >
      <Group
        title="The set"
        note="On a near-black page a shadow cannot darken its way to separation; there is very little left to darken. Both tokens carry a hairline of light along the top edge, which is what actually reads as 'nearer to you', with the cast shadow anchoring it."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            ["shadow-soft", "A resting raised surface — a card, a tile."],
            ["shadow-modal", "Anything floating over the page: dialogs, menus, the upload tray."],
          ].map(([cls, use]) => (
            <div key={cls} className="flex flex-col gap-3">
              <div className={`grid h-32 place-items-center rounded-xl bg-card ${cls}`}>
                <code className="type-caption text-muted-foreground">{cls}</code>
              </div>
              <span className="type-caption text-pretty text-muted-foreground">
                {use}
              </span>
            </div>
          ))}
        </div>
      </Group>

      <Group
        title="Inset ring, the alternative"
        note="Most raised surfaces in this product use an inset ring rather than a shadow. It catches the top edge the way real light would and costs no blur, which keeps a grid of eighty tiles cheap to paint."
      >
        <div className="grid h-32 max-w-sm place-items-center rounded-xl bg-card inset-ring inset-ring-white/5">
          <code className="type-caption text-muted-foreground">
            inset-ring inset-ring-white/5
          </code>
        </div>
      </Group>

      <Group
        title="Layout"
        note="Ordinary spacing uses Tailwind's 4px scale as-is. Only composite spacings that carry a design decision are tokens."
      >
        <div className="flex flex-col gap-3">
          {[
            ["--page-measure", "max-w-measure", "the widest a page's content column gets"],
            ["--page-gutter", "page-gutter", "the page's edge padding, as a three-breakpoint ramp"],
            ["--sidebar-width", "w-(--sidebar-width)", "the rail, its content offset, and the sticky header origin"],
          ].map(([token, utility, use]) => (
            <div
              key={token}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-card px-4 py-3 inset-ring inset-ring-white/5"
            >
              <code className="type-caption text-foreground">{token}</code>
              <code className="type-caption text-muted-foreground">{utility}</code>
              <span className="type-caption text-muted-foreground/70">{use}</span>
            </div>
          ))}
        </div>
      </Group>
    </Sheet>
  ),
};
