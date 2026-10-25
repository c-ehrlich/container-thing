import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Server-only configuration, validated when the server starts. */
export const env = createEnv({
  server: {
    RAILWAY_OAUTH_CLIENT_ID: z.string().min(1),
    RAILWAY_OAUTH_CLIENT_SECRET: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    /**
     * Public origin of this app. Must match the redirect URI registered on the Railway OAuth app.
     * On Railway it defaults to the service's generated domain, so PR environments get their own.
     */
    APP_URL: z
      .url()
      .default(
        process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : "http://localhost:3000",
      ),
    OPENROUTER_API_KEY: z.string().min(1),
    /** Any tool-capable model on OpenRouter. */
    OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-haiku-5.5"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
