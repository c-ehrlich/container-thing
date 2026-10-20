import type { Meta, StoryObj } from "@storybook/react-vite";
import { BadgeCheckIcon, CircleAlertIcon, MoonIcon } from "lucide-react";

import { Spinner } from "../spinner/spinner";
import { Badge } from "./badge";

const meta = {
  component: Badge,
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <Badge {...args}>Default</Badge>
      <Badge {...args} variant="secondary">
        Secondary
      </Badge>
      <Badge {...args} variant="outline">
        Outline
      </Badge>
      <Badge {...args} variant="ghost">
        Ghost
      </Badge>
      <Badge {...args} variant="destructive">
        Destructive
      </Badge>
      <Badge {...args} variant="link">
        Link
      </Badge>
    </div>
  ),
};

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

export const VariantsWithIcons: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <Badge {...args} key={variant} variant={variant}>
          <BadgeCheckIcon data-icon="inline-start" />
          {variant}
        </Badge>
      ))}
    </div>
  ),
};

/** The deployment statuses the console app shows. */
export const DeploymentStatuses: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <Badge {...args}>Running</Badge>
      <Badge {...args} variant="secondary">
        <Spinner />
        Building <span className="tabular-nums">14s</span>
      </Badge>
      <Badge {...args} variant="destructive">
        <CircleAlertIcon data-icon="inline-start" />
        Failed
      </Badge>
      <Badge {...args} variant="outline">
        <MoonIcon data-icon="inline-start" />
        Sleeping
      </Badge>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    variant: "secondary",
    children: (
      <>
        <BadgeCheckIcon data-icon="inline-start" /> Verified
      </>
    ),
  },
};

export const AsLink: Story = {
  args: {
    children: "Release notes",
    render: ({ children, ...props }) => (
      <a {...props} href="https://example.com/changelog">
        {children}
      </a>
    ),
  },
};
