import { createFileRoute } from "@tanstack/react-router";

import { startLogin } from "../../railway/railway-oauth";

/** Starts "Login with Railway" by redirecting to Railway's consent screen. */
export const Route = createFileRoute("/auth/login")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 302, headers: { location: startLogin() } }),
    },
  },
});
