import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { getRailway } from "./backend";

/**
 * Server-function middleware for signed-in-only functions: provides `context.railway`, a typed
 * GraphQL client using the user's (auto-refreshed) access token, or the mock if they picked it.
 */
export const requireRailway = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const railway = await getRailway();
  if (!railway) {
    setResponseStatus(401);
    throw new Error("Not signed in to Railway");
  }

  return next({ context: { railway } });
});
