import type { Meta, StoryObj } from "@storybook/react-vite";

import { AspectRatio } from "./aspect-ratio";

const meta = {
  component: AspectRatio,
  args: { ratio: 16 / 9 },
  render: (args) => (
    <div className="w-80">
      <AspectRatio
        {...args}
        className="flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
      >
        {args.children ?? "16:9"}
      </AspectRatio>
    </div>
  ),
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Square: Story = {
  args: { ratio: 1, children: "1:1" },
};

export const WithImage: Story = {
  render: (args) => (
    <div className="w-80">
      <AspectRatio {...args} className="overflow-hidden rounded-lg bg-muted">
        <img
          src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=640&q=80"
          alt="Mountain landscape"
          className="size-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
};
