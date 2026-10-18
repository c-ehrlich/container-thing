import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "../label/label";
import { Switch } from "./switch";

const meta = {
  component: Switch,
  args: { "aria-label": "Airplane mode" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { "aria-label": undefined },
  render: (args) => (
    <Label>
      <Switch {...args} />
      Airplane mode
    </Label>
  ),
};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Disabled: Story = {
  args: { disabled: true },
};
