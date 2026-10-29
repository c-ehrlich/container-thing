import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { SIGNED_OUT_MESSAGE, goToSignIn, isSignedOutError } from "../../lib/sign-in";
import { getRailway } from "./backend";

/**
 * Server-function middleware for signed-in-only functions: provides `context.railway`, a typed
 * GraphQL client using the user's (auto-refreshed) access token, or the mock if they picked it.
 * In the browser, a call that finds the user signed out sends them to the sign-in screen.
 */
export const requireRailway = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isSignedOutError(error)) goToSignIn();
      throw error;
    }
  })
  .server(async ({ next }) => {
    const railway = await getRailway();
    if (!railway) {
      setResponseStatus(401);
      throw new Error(SIGNED_OUT_MESSAGE);
    }

    return next({ context: { railway } });
  });
