import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "../label/label";
import { Textarea } from "./textarea";

const meta = {
  component: Textarea,
  args: { placeholder: "Type your message here.", "aria-label": "Message", className: "w-80" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { "aria-label": undefined },
  render: (args) => (
    <div className="grid gap-2">
      <Label htmlFor="textarea-message">Your message</Label>
      <Textarea {...args} id="textarea-message" />
    </div>
  ),
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "Too short" },
};

export const Disabled: Story = {
  args: { disabled: true },
};
