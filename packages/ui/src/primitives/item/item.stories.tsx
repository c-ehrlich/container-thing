import type { Meta, StoryObj } from "@storybook/react-vite";
import { BadgeCheckIcon, ChevronRightIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar";
import { Button } from "../button/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./item";

const meta = {
  component: Item,
  args: { className: "w-96" },
} satisfies Meta<typeof Item>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: "outline" },
  render: (args) => (
    <Item {...args}>
      <ItemContent>
        <ItemTitle>Basic item</ItemTitle>
        <ItemDescription>A simple item with a title and description.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm">
          Action
        </Button>
      </ItemActions>
    </Item>
  ),
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {(["default", "outline", "muted"] as const).map((variant) => (
        <Item {...args} key={variant} variant={variant}>
          <ItemContent>
            <ItemTitle className="capitalize">{variant}</ItemTitle>
            <ItemDescription>Item with the {variant} variant.</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </div>
  ),
};

export const AsLink: Story = {
  args: { variant: "outline", size: "sm" },
  render: (args) => (
    <Item {...args} render={<a href="/profile" aria-label="View your verified profile" />}>
      <ItemMedia variant="icon">
        <BadgeCheckIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Your profile has been verified.</ItemTitle>
      </ItemContent>
      <ItemActions>
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  ),
};

const people = [
  { name: "Ada Lovelace", email: "ada@example.com", initials: "AL" },
  { name: "Grace Hopper", email: "grace@example.com", initials: "GH" },
  { name: "Alan Turing", email: "alan@example.com", initials: "AT" },
];

export const List: Story = {
  render: (args) => (
    <ItemGroup className="w-96">
      {people.map((person, index) => (
        <div key={person.email}>
          {index > 0 && <ItemSeparator />}
          <Item {...args} className={undefined} size="sm" role="listitem">
            <ItemMedia>
              <Avatar>
                <AvatarImage src="" alt="" />
                <AvatarFallback>{person.initials}</AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{person.name}</ItemTitle>
              <ItemDescription>{person.email}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="ghost" size="sm">
                Invite
              </Button>
            </ItemActions>
          </Item>
        </div>
      ))}
    </ItemGroup>
  ),
};
