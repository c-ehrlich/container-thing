import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

const meta = {
  component: HoverCard,
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <HoverCard {...args}>
      <HoverCardTrigger
        href="https://github.com/shadcn"
        className="text-sm font-medium underline underline-offset-4"
      >
        @shadcn
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        <div className="flex gap-3">
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <div className="font-medium">@shadcn</div>
            <p>Beautifully designed components built with Base UI and Tailwind CSS.</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarIcon className="size-3.5" /> Joined December 2021
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const Open: Story = {
  ...Default,
  args: { defaultOpen: true },
};
