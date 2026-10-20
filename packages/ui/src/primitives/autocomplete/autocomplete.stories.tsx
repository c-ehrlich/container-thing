import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "./autocomplete";

const images = ["postgres", "redis", "nginx", "mongo", "traefik/whoami", "kennethreitz/httpbin"];

const meta = {
  component: Autocomplete,
  args: { items: images },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Autocomplete {...args}>
      <AutocompleteInput placeholder="kennethreitz/httpbin" aria-label="Image" />
      <AutocompleteContent>
        <AutocompleteEmpty>No matching images. Any image name works.</AutocompleteEmpty>
        <AutocompleteList>
          {(item: string) => (
            <AutocompleteItem key={item} value={item}>
              {item}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  ),
};
