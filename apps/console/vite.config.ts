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

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react(), nitro()],
});
