import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getFreshSession } from "../auth/oauth";
import { cookieDefaults, getRequestCookie } from "../auth/session";
import { createMockRailwayClient, mockRailway } from "./mock-railway";
import { createRailwayClient } from "./railway-api";
import type { RailwayClient } from "./railway-api";

/**
 * Which Railway the console talks to: the real one, or the shared mock with far more data
 * (`@repo/railway-mock`). Each browser picks with a cookie. Mock mode still needs a Railway sign-in,
 * since public data like templates comes from the real API.
 */
export const Backend = z.enum(["railway", "mock"]);
export type Backend = z.infer<typeof Backend>;

const BACKEND_COOKIE = "railway_backend";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const parseBackend = (value: string | undefined): Backend =>
  value === "mock" ? "mock" : "railway";

export function readBackend(): Backend {
  return parseBackend(getCookie(BACKEND_COOKIE));
}

/** Same as `readBackend`, for the WebSocket upgrade in `domains/live/relay.ts`. */
export function readBackendFromRequest(request: Request): Backend {
  return parseBackend(getRequestCookie(request, BACKEND_COOKIE));
}

export function writeBackend(backend: Backend) {
  setCookie(BACKEND_COOKIE, backend, { ...cookieDefaults(), maxAge: ONE_YEAR_SECONDS });
}

/** A client for the backend this browser picked, as the signed-in user. Null when signed out. */
export async function getRailway(): Promise<RailwayClient | null> {
  const session = await getFreshSession();
  if (!session) return null;
  const railway = createRailwayClient(session.accessToken);
  return readBackend() === "mock" ? createMockRailwayClient(mockRailway(), railway) : railway;
}
