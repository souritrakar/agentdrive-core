import { ArrowRight, Plus, Trash } from "@phosphor-icons/react";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "Upload files" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Lime, and only one per screen.
 *
 * The accent means "the action here". A second primary button on the same view
 * means the screen has not decided what it is for, and the colour stops
 * carrying information.
 */
export const Primary: Story = {};

export const Secondary: Story = { args: { variant: "secondary" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Link: Story = { args: { variant: "link" } };

/**
 * A tinted fill rather than a solid red one. Destroying something should read
 * as serious without shouting louder than the primary action does.
 */
export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete drive" },
};

export const Disabled: Story = { args: { disabled: true } };

/** Every variant beside every other — the only way to judge them as a set. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(
        (variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ),
      )}
    </div>
  ),
};

/** Sizes share a baseline. If one is off, it shows up here and nowhere else. */
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(["xs", "sm", "default", "lg"] as const).map((size) => (
        <Button key={size} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Plus data-icon="inline-start" />
        New drive
      </Button>
      <Button variant="secondary">
        Continue
        <ArrowRight data-icon="inline-end" />
      </Button>
      <Button variant="destructive" size="icon" aria-label="Delete">
        <Trash />
      </Button>
    </div>
  ),
};
