import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Input } from "../input/input";
import { Label } from "../label/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

const meta = {
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger render={<Button variant="outline" />}>Dimensions</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
          <PopoverDescription>Set the dimensions for the layer.</PopoverDescription>
        </PopoverHeader>
        <div className="grid grid-cols-3 items-center gap-2">
          <Label htmlFor="popover-width">Width</Label>
          <Input id="popover-width" defaultValue="100%" className="col-span-2" />
          <Label htmlFor="popover-height">Height</Label>
          <Input id="popover-height" defaultValue="25px" className="col-span-2" />
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const Open: Story = {
  ...Default,
  args: { defaultOpen: true },
};

export const Sides: Story = {
  render: (args) => (
    <div className="flex gap-2">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Popover key={side} {...args}>
          <PopoverTrigger render={<Button variant="outline" className="capitalize" />}>
            {side}
          </PopoverTrigger>
          <PopoverContent side={side} className="w-auto">
            Opens on the {side}.
          </PopoverContent>
        </Popover>
      ))}
    </div>
  ),
};
