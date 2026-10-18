import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "../checkbox/checkbox";
import { Input } from "../input/input";
import { Label } from "./label";

const meta = {
  component: Label,
  args: { children: "Email" },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: (args) => (
    <div className="grid w-64 gap-2">
      <Label {...args} htmlFor="label-email" />
      <Input id="label-email" type="email" placeholder="ada@example.com" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  args: { children: "Accept terms and conditions" },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-terms" />
      <Label {...args} htmlFor="label-terms" />
    </div>
  ),
};
