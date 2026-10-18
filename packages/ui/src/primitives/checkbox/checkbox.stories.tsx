import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "../label/label";
import { Checkbox } from "./checkbox";

const meta = {
  component: Checkbox,
  args: { "aria-label": "Accept" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const WithLabel: Story = {
  args: { "aria-label": undefined },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} id="checkbox-terms" />
      <Label htmlFor="checkbox-terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true },
};

export const Invalid: Story = {
  args: { "aria-invalid": true },
};
