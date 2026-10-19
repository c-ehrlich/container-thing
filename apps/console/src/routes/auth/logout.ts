import { createFileRoute } from "@tanstack/react-router";

import { clearSession } from "../../server/session";

/** POST-only so a stray link or image can't sign the user out. */
export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      POST: () => {
        clearSession();
        return new Response(null, { status: 303, headers: { location: "/" } });
      },
    },
  },
});
