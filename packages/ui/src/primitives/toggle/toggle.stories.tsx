import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, ItalicIcon } from "lucide-react";

import { Toggle } from "./toggle";

const meta = {
  component: Toggle,
  args: { "aria-label": "Toggle bold", children: <BoldIcon /> },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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
