import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, ItalicIcon } from "lucide-react";
import { Fragment } from "react";

import { Toggle } from "./toggle";

const meta = {
  component: Toggle,
  args: { "aria-label": "Toggle bold", children: <BoldIcon /> },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Both variants at every size, off and on. */
export const Variants: Story = {
  render: (args) => (
    <div className="grid grid-cols-[auto_repeat(3,auto)] items-center gap-x-4 gap-y-3">
      {(["default", "outline"] as const).map((variant) => (
        <Fragment key={variant}>
          <span className="text-xs text-muted-foreground">{variant}</span>
          {(["sm", "default", "lg"] as const).map((size) => (
            <div key={size} className="flex gap-1">
              <Toggle {...args} variant={variant} size={size} />
              <Toggle {...args} variant={variant} size={size} defaultPressed />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  ),
};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const WithText: Story = {
  args: {
    "aria-label": undefined,
    children: (
      <>
        <ItalicIcon data-icon="inline-start" />
        Italic
      </>
    ),
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Toggle {...args} size="sm" />
      <Toggle {...args} />
      <Toggle {...args} size="lg" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};
