import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card, CardContent } from "../card/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";

const slides = [1, 2, 3, 4, 5];

const meta = {
  component: Carousel,
  render: (args) => (
    <Carousel {...args} className="w-64">
      <CarouselContent>
        {slides.map((n) => (
          <CarouselItem key={n}>
            <Card>
              <CardContent className="flex aspect-square items-center justify-center">
                <span className="text-4xl font-semibold">{n}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleItems: Story = {
  args: { opts: { align: "start" } },
  render: (args) => (
    <Carousel {...args} className="w-96">
      <CarouselContent>
        {slides.map((n) => (
          <CarouselItem key={n} className="basis-1/3">
            <Card>
              <CardContent className="flex aspect-square items-center justify-center">
                <span className="text-2xl font-semibold">{n}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};

export const Vertical: Story = {
  args: { orientation: "vertical", opts: { align: "start" } },
  render: (args) => (
    <div className="py-14">
      <Carousel {...args} className="w-64">
        <CarouselContent className="h-48">
          {slides.map((n) => (
            <CarouselItem key={n} className="basis-1/2">
              <Card>
                <CardContent className="flex items-center justify-center">
                  <span className="text-2xl font-semibold">{n}</span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
};

export const Loop: Story = {
  args: { opts: { loop: true } },
};
