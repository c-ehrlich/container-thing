import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

export default {
  framework: "@storybook/react-vite",
  stories: [
    { directory: "../src/foundations", titlePrefix: "Foundations" },
    { directory: "../src/primitives", titlePrefix: "Primitives" },
  ],
  addons: ["@storybook/addon-a11y", "@storybook/addon-themes"],
  core: { disableTelemetry: true },
  viteFinal: (config) => ({
    ...config,
    plugins: [...(config.plugins ?? []), tailwindcss()],
  }),
} satisfies StorybookConfig;
