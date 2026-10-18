import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "../label/label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = {
  component: RadioGroup,
  args: { defaultValue: "comfortable", "aria-label": "Density" },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = [
  { value: "default", label: "Default" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args} className="w-fit">
      {options.map((option) => (
        <div key={option.value} className="flex items-center gap-2">
          <RadioGroupItem value={option.value} id={`radio-${option.value}`} />
          <Label htmlFor={`radio-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: (args) => (
    <RadioGroup {...args} className="flex gap-4">
      {options.map((option) => (
        <div key={option.value} className="flex items-center gap-2">
          <RadioGroupItem value={option.value} id={`radio-horizontal-${option.value}`} />
          <Label htmlFor={`radio-horizontal-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  ...Default,
  args: { disabled: true },
};
