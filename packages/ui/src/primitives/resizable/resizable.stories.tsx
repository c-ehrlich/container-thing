import type { Meta, StoryObj } from "@storybook/react-vite";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable";

const meta = {
  component: ResizablePanelGroup,
  args: { className: "h-[200px] w-[400px] rounded-lg border" },
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ResizablePanelGroup {...args}>
      <ResizablePanel defaultSize="50%">
        <div className="flex h-full items-center justify-center p-6 text-sm font-medium">One</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="50%">
        <div className="flex h-full items-center justify-center p-6 text-sm font-medium">Two</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const Vertical: Story = {
  ...Default,
  args: { orientation: "vertical" },
};

export const WithHandle: Story = {
  render: (args) => (
    <ResizablePanelGroup {...args}>
      <ResizablePanel defaultSize="25%" minSize="15%">
        <div className="flex h-full items-center justify-center p-6 text-sm font-medium">
          Sidebar
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="75%">
        <div className="flex h-full items-center justify-center p-6 text-sm font-medium">
          Content
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
