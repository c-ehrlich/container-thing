import type { Meta, StoryObj } from "@storybook/react-vite";

import { Progress, ProgressLabel, ProgressValue } from "./progress";

const meta = {
  component: Progress,
  args: { value: 60, "aria-label": "Upload progress", className: "w-72" },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: {
    "aria-label": undefined,
    children: (
      <>
        <ProgressLabel>Uploading files</ProgressLabel>
        <ProgressValue />
      </>
    ),
  },
};

export const Indeterminate: Story = {
  args: { value: null },
};

export const Complete: Story = {
  args: { value: 100 },
};
