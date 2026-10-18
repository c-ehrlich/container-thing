import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "./navigation-menu";

const meta = {
  component: NavigationMenu,
} satisfies Meta<typeof NavigationMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const components = [
  { title: "Dialog", href: "#dialog", description: "A window overlaid on the page." },
  { title: "Popover", href: "#popover", description: "Rich content anchored to a trigger." },
  { title: "Tabs", href: "#tabs", description: "Layered sections shown one at a time." },
  { title: "Tooltip", href: "#tooltip", description: "A short hint shown on hover." },
];

export const Default: Story = {
  render: (args) => (
    <NavigationMenu {...args}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-72 gap-1">
              <li>
                <NavigationMenuLink href="#introduction" className="flex-col items-start gap-1">
                  <div className="font-medium">Introduction</div>
                  <div className="text-muted-foreground">Reusable components built on Base UI.</div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#installation" className="flex-col items-start gap-1">
                  <div className="font-medium">Installation</div>
                  <div className="text-muted-foreground">Add the package to your app.</div>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[28rem] grid-cols-2 gap-1">
              {components.map((component) => (
                <li key={component.title}>
                  <NavigationMenuLink href={component.href} className="flex-col items-start gap-1">
                    <div className="font-medium">{component.title}</div>
                    <div className="text-muted-foreground">{component.description}</div>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#docs" className={navigationMenuTriggerStyle()}>
            Docs
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};
