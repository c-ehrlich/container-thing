import type { Meta, StoryObj } from "@storybook/react-vite";

import { Slider } from "./slider";

const meta = {
  component: Slider,
  args: { defaultValue: [50], "aria-label": "Volume", className: "w-64" },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Range: Story = {
  args: { defaultValue: [25, 75], "aria-label": "Price range" },
};

export const Steps: Story = {
  args: { defaultValue: [40], step: 10 },
};

export const Vertical: Story = {
  args: { orientation: "vertical", className: undefined },
  render: (args) => (
    <div className="h-40">
      <Slider {...args} />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};
