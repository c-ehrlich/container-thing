import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";

// The evals call the real model, so they need the OpenRouter key from the repo-root .env.
const rootEnvFile = new URL("../../.env", import.meta.url);
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

/** `pnpm eval`: the assistant against the mock, with the real model. Slow and costs tokens. */
export default defineConfig({
  test: {
    include: ["src/**/*.eval.ts"],
    testTimeout: 120_000,
  },
});
