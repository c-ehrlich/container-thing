import { createFileRoute } from "@tanstack/react-router";

/**
 * Railway calls this before switching traffic to a new deployment (see `.railway/railway.ts`). No
 * sign-in needed, and it doesn't call Railway's API, so a slow upstream can't fail a deploy.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => new Response("ok"),
    },
  },
});
