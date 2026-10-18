import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircleIcon, InfoIcon } from "lucide-react";

import { Button } from "../button/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";

const meta = {
  component: Alert,
  render: (args) => (
    <Alert {...args} className="w-96">
      <InfoIcon />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>A new version is available. Refresh to update.</AlertDescription>
    </Alert>
  ),
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args} className="w-96">
      <AlertCircleIcon />
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>Your card was declined. Update your billing details.</AlertDescription>
    </Alert>
  ),
};

export const WithAction: Story = {
  render: (args) => (
    <Alert {...args} className="w-96">
      <InfoIcon />
      <AlertTitle>Update available</AlertTitle>
      <AlertDescription>Version 2.0 is ready to install.</AlertDescription>
      <AlertAction>
        <Button size="xs">Update</Button>
      </AlertAction>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: (args) => (
    <Alert {...args} className="w-96">
      <InfoIcon />
      <AlertTitle>Your changes have been saved.</AlertTitle>
    </Alert>
  ),
};
