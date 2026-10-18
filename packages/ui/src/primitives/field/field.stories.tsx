import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { Input } from "../input/input";
import { Switch } from "../switch/switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "./field";

const meta = {
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field {...args} className="w-72">
      <FieldLabel htmlFor="field-username">Username</FieldLabel>
      <Input id="field-username" placeholder="ada" />
      <FieldDescription>Choose a unique name for your account.</FieldDescription>
    </Field>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <Field {...args} className="w-72" data-invalid>
      <FieldLabel htmlFor="field-email-invalid">Email</FieldLabel>
      <Input id="field-email-invalid" type="email" defaultValue="ada@" aria-invalid />
      <FieldError>Enter a valid email address.</FieldError>
    </Field>
  ),
};

export const Horizontal: Story = {
  render: (args) => (
    <FieldGroup className="w-80">
      <Field {...args} orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="field-notifications">Notifications</FieldLabel>
          <FieldDescription>Receive emails about account activity.</FieldDescription>
        </FieldContent>
        <Switch id="field-notifications" defaultChecked />
      </Field>
      <Field {...args} orientation="horizontal">
        <Checkbox id="field-terms" />
        <FieldLabel htmlFor="field-terms">Accept terms and conditions</FieldLabel>
      </Field>
    </FieldGroup>
  ),
};

export const Form: Story = {
  render: (args) => (
    <form className="w-80" onSubmit={(event) => event.preventDefault()}>
      <FieldSet>
        <FieldLegend>Profile</FieldLegend>
        <FieldDescription>This information will be displayed publicly.</FieldDescription>
        <FieldGroup>
          <Field {...args}>
            <FieldLabel htmlFor="field-form-name">Name</FieldLabel>
            <Input id="field-form-name" placeholder="Ada Lovelace" />
          </Field>
          <Field {...args}>
            <FieldLabel htmlFor="field-form-email">Email</FieldLabel>
            <Input id="field-form-email" type="email" placeholder="ada@example.com" />
            <FieldDescription>We&apos;ll never share your email.</FieldDescription>
          </Field>
          <FieldSeparator>Optional</FieldSeparator>
          <Field {...args} data-disabled>
            <FieldLabel htmlFor="field-form-website">Website</FieldLabel>
            <Input id="field-form-website" placeholder="https://example.com" disabled />
          </Field>
          <Field {...args} orientation="horizontal">
            <Button type="submit">Save</Button>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  ),
};
