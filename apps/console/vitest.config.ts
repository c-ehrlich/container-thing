import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't boot TanStack Start, Nitro or Tailwind.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
