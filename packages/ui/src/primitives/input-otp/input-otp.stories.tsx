import type { Meta, StoryObj } from "@storybook/react-vite";

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "./input-otp";

const meta = {
  component: InputOTP,
  args: { maxLength: 6, "aria-label": "One-time password", children: null },
} satisfies Meta<typeof InputOTP>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: ({ maxLength, defaultValue, disabled, "aria-label": ariaLabel }) => (
    <InputOTP
      maxLength={maxLength}
      defaultValue={defaultValue}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
};

export const Filled: Story = {
  ...Default,
  args: { defaultValue: "123456" },
};

export const Disabled: Story = {
  ...Default,
  args: { disabled: true, defaultValue: "123" },
};

export const Invalid: Story = {
  render: ({ maxLength, "aria-label": ariaLabel }) => (
    <InputOTP maxLength={maxLength} aria-label={ariaLabel} defaultValue="000000">
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <InputOTPSlot key={index} index={index} aria-invalid />
        ))}
      </InputOTPGroup>
    </InputOTP>
  ),
};
