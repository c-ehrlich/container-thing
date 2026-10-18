import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDownIcon } from "lucide-react";

import { Button } from "../button/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const meta = {
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Collapsible {...args} className="flex w-72 flex-col gap-2">
      <div className="flex items-center justify-between gap-4 px-2">
        <span className="text-sm font-medium">3 starred repositories</span>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Toggle repositories" />}
        >
          <ChevronsUpDownIcon />
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border px-3 py-2 font-mono text-sm">base-ui/base-ui</div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-3 py-2 font-mono text-sm">shadcn-ui/ui</div>
        <div className="rounded-md border px-3 py-2 font-mono text-sm">storybookjs/storybook</div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const Open: Story = {
  ...Default,
  args: { defaultOpen: true },
};

export const Disabled: Story = {
  ...Default,
  args: { disabled: true },
};
