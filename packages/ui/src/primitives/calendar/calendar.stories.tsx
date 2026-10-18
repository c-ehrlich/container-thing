import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Calendar } from "./calendar";

const defaultMonth = new Date(2025, 5, 1);

function SingleCalendar() {
  const [date, setDate] = useState<Date | undefined>(new Date(2025, 5, 12));
  return (
    <Calendar
      mode="single"
      defaultMonth={defaultMonth}
      selected={date}
      onSelect={setDate}
      className="rounded-lg border"
    />
  );
}

function RangeCalendar() {
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(2025, 5, 9),
    to: new Date(2025, 5, 18),
  });
  return (
    <Calendar
      mode="range"
      defaultMonth={defaultMonth}
      numberOfMonths={2}
      selected={range}
      onSelect={setRange}
      className="rounded-lg border"
    />
  );
}

const meta = {
  component: Calendar,
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SingleCalendar />,
};

export const Range: Story = {
  render: () => <RangeCalendar />,
};

export const DropdownCaption: Story = {
  render: () => (
    <Calendar
      mode="single"
      defaultMonth={defaultMonth}
      captionLayout="dropdown"
      className="rounded-lg border"
    />
  ),
};

export const DisabledDays: Story = {
  render: () => (
    <Calendar
      mode="single"
      defaultMonth={defaultMonth}
      disabled={{ dayOfWeek: [0, 6] }}
      className="rounded-lg border"
    />
  ),
};
