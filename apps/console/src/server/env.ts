import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Server-only configuration, validated when the server starts. */
export const env = createEnv({
  server: {
    RAILWAY_OAUTH_CLIENT_ID: z.string().min(1),
    RAILWAY_OAUTH_CLIENT_SECRET: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    /** Public origin of this app. Must match the redirect URI registered on the Railway OAuth app. */
    APP_URL: z.url().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
