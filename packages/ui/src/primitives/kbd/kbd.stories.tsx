import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandIcon } from "lucide-react";

import { Kbd, KbdGroup } from "./kbd";

const meta = {
  component: Kbd,
  args: { children: "K" },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <CommandIcon /> K
      </>
    ),
  },
};

export const Group: Story = {
  render: (args) => (
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <span>+</span>
      <Kbd {...args} />
    </KbdGroup>
  ),
};

export const InText: Story = {
  render: (args) => (
    <p className="text-sm text-muted-foreground">
      Press{" "}
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd {...args} />
      </KbdGroup>{" "}
      to open the command menu.
    </p>
  ),
};
