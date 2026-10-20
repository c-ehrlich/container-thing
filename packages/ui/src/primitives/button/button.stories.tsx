import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRightIcon, PlusIcon, RocketIcon } from "lucide-react";
import { Fragment } from "react";

import { Button } from "./button";

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const sizes = ["xs", "sm", "default", "lg"] as const;
const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const meta = {
  component: Button,
  args: { children: "Button" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <Button {...args}>Default</Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args}>Default</Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        Continue <ArrowRightIcon data-icon="inline-end" />
      </>
    ),
  },
};

export const IconOnly: Story = {
  args: { size: "icon", "aria-label": "Add", children: <PlusIcon /> },
};

export const Disabled: Story = {
  args: { disabled: true },
};

/** Every variant at every size, with and without icons. */
export const Matrix: Story = {
  render: (args) => (
    <div className="grid grid-cols-[auto_repeat(5,auto)] items-center gap-x-4 gap-y-3">
      <span />
      {sizes.map((size) => (
        <span key={size} className="text-xs text-muted-foreground">
          {size}
        </span>
      ))}
      <span className="text-xs text-muted-foreground">icon sizes</span>
      {variants.map((variant) => (
        <Fragment key={variant}>
          <span className="text-xs text-muted-foreground">{variant}</span>
          {sizes.map((size) => (
            <Button {...args} key={size} variant={variant} size={size}>
              <RocketIcon data-icon="inline-start" />
              Deploy
            </Button>
          ))}
          <div className="flex items-center gap-2">
            {iconSizes.map((size) => (
              <Button {...args} key={size} variant={variant} size={size} aria-label="Add">
                <PlusIcon />
              </Button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  ),
};

export const DisabledVariants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <Button {...args} key={variant} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** How the variants sit on the surfaces they usually appear on. */
export const OnSurfaces: Story = {
  render: (args) => (
    <div className="grid gap-3">
      {(
        ["bg-background", "bg-card ring-1 ring-foreground/10", "bg-muted", "bg-sidebar"] as const
      ).map((surface) => (
        <div
          key={surface}
          className={`flex flex-wrap items-center gap-2 rounded-xl p-4 ${surface}`}
        >
          <span className="w-28 text-xs text-muted-foreground">{surface.split(" ")[0]}</span>
          {variants.map((variant) => (
            <Button {...args} key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};
