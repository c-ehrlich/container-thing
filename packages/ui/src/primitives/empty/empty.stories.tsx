import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderIcon, PlusIcon, SearchXIcon } from "lucide-react";

import { Button } from "../button/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

const meta = {
  component: Empty,
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderIcon />
        </EmptyMedia>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>
          You haven&apos;t created any projects. Get started by creating your first one.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <PlusIcon data-icon="inline-start" /> New project
        </Button>
      </EmptyContent>
    </Empty>
  ),
};

export const Outline: Story = {
  ...Default,
  args: { className: "border" },
};

export const Minimal: Story = {
  render: (args) => (
    <Empty {...args}>
      <EmptyHeader>
        <EmptyMedia>
          <SearchXIcon className="size-8 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>
          Try a different search term or <a href="/search">clear your filters</a>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
};
