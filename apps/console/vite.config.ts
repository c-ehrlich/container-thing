import { existsSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Server-only secrets live in the repo-root .env. Load them into process.env for dev and build;
// in production they come from the host's environment instead.
const rootEnvFile = new URL("../../.env", import.meta.url);
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

export default defineConfig(({ command }) => ({
  environments: {
    ssr: {
      resolve: {
        // In the production build, bundle every server dependency so there's exactly one React. Vite
        // only externalizes what it can resolve from this app, so packages reached through packages/ui
        // (Base UI and its CommonJS useSyncExternalStore shim) were bundled while React wasn't. The
        // shim's `require("react")` then loaded a second React from node_modules at runtime, and its
        // hooks crashed with "Cannot read properties of null". Not in dev: Vite's dev server can't run
        // CommonJS dependencies as source.
        noExternal: command === "build" ? true : undefined,
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    react(),
    nitro({
      features: { websocket: true },
      handlers: [{ route: "/api/live", handler: "./src/domains/live/relay.ts" }],
    }),
  ],
}));
