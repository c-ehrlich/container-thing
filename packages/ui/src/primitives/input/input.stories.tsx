import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "../label/label";
import { Input } from "./input";

const meta = {
  component: Input,
  args: { placeholder: "Email", "aria-label": "Email", type: "email", className: "w-64" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid gap-2">
      <Label htmlFor="input-email">Email</Label>
      <Input {...args} id="input-email" aria-label={undefined} />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "ada@" },
};

export const File: Story = {
  args: { type: "file", "aria-label": "Upload file", placeholder: undefined },
};
