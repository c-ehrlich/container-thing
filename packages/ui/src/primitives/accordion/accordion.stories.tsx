import type { Meta, StoryObj } from "@storybook/react-vite";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const meta = {
  component: Accordion,
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Accordion {...args} className="w-80">
      <AccordionItem value="shipping">
        <AccordionTrigger>How long does shipping take?</AccordionTrigger>
        <AccordionContent>Orders usually arrive within 3-5 business days.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>What is your return policy?</AccordionTrigger>
        <AccordionContent>You can return any item within 30 days of delivery.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="support">
        <AccordionTrigger>How do I contact support?</AccordionTrigger>
        <AccordionContent>
          Email us at support@example.com and we will reply within a day.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const DefaultOpen: Story = {
  ...Default,
  args: { defaultValue: ["shipping"] },
};

export const Multiple: Story = {
  ...Default,
  args: { multiple: true, defaultValue: ["shipping", "returns"] },
};

export const DisabledItem: Story = {
  render: (args) => (
    <Accordion {...args} className="w-80">
      <AccordionItem value="available">
        <AccordionTrigger>Available section</AccordionTrigger>
        <AccordionContent>This section can be expanded.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="locked" disabled>
        <AccordionTrigger>Locked section</AccordionTrigger>
        <AccordionContent>You should not be able to see this.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
