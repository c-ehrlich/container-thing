import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "../badge/badge";
import { StatusDot } from "./status-dot";

const meta = {
  component: StatusDot,
  args: { tone: "success" },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

const tones = ["success", "warning", "destructive", "primary", "muted"] as const;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-4">
      {tones.map((tone) => (
        <span key={tone} className="flex items-center gap-2 text-sm">
          <StatusDot {...args} tone={tone} />
          {tone}
        </span>
      ))}
    </div>
  ),
};

export const Pulse: Story = {
  args: { pulse: true },
};

/** The connection indicator on the console's project page. */
export const InBadge: Story = {
  render: (args) => (
    <div className="flex gap-2">
      <Badge variant="outline">
        <StatusDot {...args} tone="success" pulse />
        Live
      </Badge>
      <Badge variant="outline">
        <StatusDot {...args} tone="warning" />
        Polling every 30s
      </Badge>
      <Badge variant="outline">
        <StatusDot {...args} tone="muted" />
        Connecting
      </Badge>
    </div>
  ),
};
