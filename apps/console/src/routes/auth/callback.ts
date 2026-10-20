import { createFileRoute } from "@tanstack/react-router";

import { finishLogin } from "../../railway/railway-oauth";

/** Railway redirects here after consent. */
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await finishLogin(new URL(request.url).searchParams);

        if (!result.ok) {
          return new Response(result.message, { status: result.status });
        }

        return new Response(null, { status: 302, headers: { location: "/" } });
      },
    },
  },
});
