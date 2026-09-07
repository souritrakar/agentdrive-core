import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Group, Sheet, Swatch, SwatchGrid } from "./specimen";

const meta = {
  title: "Foundations/Colour",
  parameters: {
    layout: "fullscreen",
    // A specimen sheet is the documentation. Controls would imply these are
    // configurable, and they are not — they are what the product is made of.
    controls: { disable: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The colours almost all UI should use. Reach for these first; most screens
 * never need anything else.
 */
export const Semantic: Story = {
  render: () => (
    <Sheet
      title="Colour"
      intro="Every colour in the product is declared once in src/styles/tokens.css and consumed by name. The values below are read live out of the document, so this page cannot drift from the code — if a swatch looks wrong, the token is wrong."
    >
      <Group
        title="Surfaces"
        note="Surfaces step up from the page, never down. Each is one rung lighter than the one it sits on, which is what lets a card read as raised without a border doing the work."
      >
        <SwatchGrid>
          <Swatch token="--background" utility="bg-background" use="the page" />
          <Swatch token="--card" utility="bg-card" use="raised surfaces, tiles" />
          <Swatch token="--popover" utility="bg-popover" use="menus, tooltips, dialogs" />
          <Swatch token="--secondary" utility="bg-secondary" use="quiet fills, secondary buttons" />
          <Swatch token="--muted" utility="bg-muted" use="recessed panels" />
          <Swatch token="--accent" utility="bg-accent" use="hover fills, active rows" />
        </SwatchGrid>
      </Group>

      <Group
        title="Ink"
        note="Two levels, not five. Hierarchy past this point is carried by size, weight and spacing — a third grey would be a step nobody can reliably tell from the second."
      >
        <SwatchGrid>
          <Swatch token="--foreground" utility="text-foreground" use="primary text" />
          <Swatch token="--muted-foreground" utility="text-muted-foreground" use="secondary text, metadata" />
        </SwatchGrid>
      </Group>

      <Group
        title="Lines"
        note="Opacity-based rather than a fixed grey, so a border sits correctly on any surface without a seam where two surfaces meet."
      >
        <SwatchGrid>
          <Swatch token="--border" utility="border-border" use="hairlines, dividers" />
          <Swatch token="--input" utility="border-input" use="field outlines" />
          <Swatch token="--ring" utility="ring-ring" use="focus ring" />
        </SwatchGrid>
      </Group>

      <Group
        title="Destructive"
        note="The only status colour in the palette. Never used alone — a destructive action always carries a word as well, because roughly one user in twelve cannot rely on hue."
      >
        <SwatchGrid>
          <Swatch token="--destructive" utility="text-destructive" use="errors, delete actions" />
        </SwatchGrid>
      </Group>
    </Sheet>
  ),
};

/**
 * Three accents, each with exactly one job. That constraint is what stops three
 * colours from reading as noise.
 */
export const Brand: Story = {
  render: () => (
    <Sheet
      title="Brand accents"
      intro="Three colours, and each means one thing. Used for a second purpose, an accent stops being a signal — the user learns that lime means 'the action' only if lime never means anything else."
    >
      <Group title="Accents">
        <SwatchGrid>
          <Swatch token="--brand-lime" utility="bg-lime / text-lime" use="the primary action; upload and progress" />
          <Swatch token="--brand-teal" utility="ring-teal / text-teal" use="focus, and 'you are here'" />
          <Swatch token="--brand-peacock" utility="bg-peacock" use="selection, informational emphasis" />
        </SwatchGrid>
      </Group>

      <Group
        title="File-type tints"
        note="These say what a thing is, never what state it is in — type glyphs only, never a border, a control, or a status. The boundary is chroma 0.09: accents sit at or above it, tints at or below, which is what keeps a tint from being read as a weak selection."
      >
        <SwatchGrid>
          <Swatch token="--tint-document" utility="text-tint-document" use="PDF, Word, text, spreadsheets" />
          <Swatch token="--tint-media" utility="text-tint-media" use="images, audio, video" />
          <Swatch token="--tint-code" utility="text-tint-code" use="source files" />
          <Swatch token="--tint-archive" utility="text-tint-archive" use="zips, and anything unrecognised" />
        </SwatchGrid>
      </Group>

      <Group
        title="In context"
        note="Chroma that reads as colour on a large fill can disappear entirely on a thin duotone glyph — perceived saturation falls with the area you paint. This row is the check that matters; the swatches above flatter the tints."
      >
        <div className="flex flex-wrap gap-3">
          {[
            ["text-tint-document", "Document"],
            ["text-tint-media", "Media"],
            ["text-tint-code", "Code"],
            ["text-tint-archive", "Archive"],
          ].map(([cls, label]) => (
            <div
              key={cls}
              className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2.5 inset-ring inset-ring-white/5"
            >
              <span className={`size-4 rounded-sm ${cls.replace("text-", "bg-")}`} />
              <span className="type-meta text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </Group>
    </Sheet>
  ),
};

/**
 * The sidebar's own ramp. Any region that can invert needs one — a token that
 * happens to look right on the rail today is not a guarantee after a restyle.
 */
export const Sidebar: Story = {
  render: () => (
    <Sheet
      title="Sidebar ramp"
      intro="The rail shares the page background and is separated by a divider rather than a fill — a large tinted panel is the thing that makes dark UIs look cheap. It still carries its own scoped tokens, so it can diverge later without every sidebar component having to be found and edited."
    >
      <Group title="Tokens">
        <SwatchGrid>
          <Swatch token="--sidebar" utility="bg-sidebar" use="the rail" />
          <Swatch token="--sidebar-foreground" utility="text-sidebar-foreground" use="rail text" />
          <Swatch token="--sidebar-accent" utility="bg-sidebar-accent" use="hover and active rows" />
          <Swatch token="--sidebar-primary" utility="bg-sidebar-primary" use="the rail's primary action" />
          <Swatch token="--sidebar-border" utility="border-sidebar-border" use="the divider" />
          <Swatch token="--sidebar-ring" utility="ring-sidebar-ring" use="focus inside the rail" />
        </SwatchGrid>
      </Group>
    </Sheet>
  ),
};
