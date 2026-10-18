import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Toaster, toast } from "./toast";

const meta = {
  component: Toaster,
  decorators: [
    (Story) => (
      <Toaster>
        <Story />
      </Toaster>
    ),
  ],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.add({
          title: "Event created",
          description: "Sunday, December 3 at 9:00 AM",
        })
      }
    >
      Show toast
    </Button>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(["success", "info", "warning", "error", "loading"] as const).map((type) => (
        <Button
          key={type}
          variant="outline"
          className="capitalize"
          onClick={() =>
            toast.add({ type, title: `This is a ${type} toast`, description: "Just so you know." })
          }
        >
          {type}
        </Button>
      ))}
    </div>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => {
        const id = toast.add({
          title: "Message archived",
          description: "You can find it in the archive.",
          actionProps: { children: "Undo", onClick: () => toast.close(id) },
        });
      }}
    >
      Archive message
    </Button>
  ),
};

export const Async: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
          loading: "Saving changes...",
          success: "Changes saved",
          error: "Could not save changes",
        })
      }
    >
      Save changes
    </Button>
  ),
};
