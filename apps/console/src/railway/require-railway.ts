import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { createRailwayClient } from "./railway-api";
import { getFreshSession } from "./railway-oauth";

/**
 * Server-function middleware for signed-in-only functions: provides `context.railway`, a typed
 * GraphQL client using the user's (auto-refreshed) access token.
 */
export const requireRailway = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getFreshSession();
  if (!session) {
    setResponseStatus(401);
    throw new Error("Not signed in to Railway");
  }

  return next({
    context: { railway: createRailwayClient(session.accessToken) },
  });
});
