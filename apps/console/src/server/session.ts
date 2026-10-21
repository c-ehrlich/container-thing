import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";

import { env } from "./env";

/**
 * The signed-in user's Railway tokens. Stored encrypted in a single httpOnly cookie,
 * so there is no session table and the tokens never reach browser JavaScript.
 */
const Session = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  /** Epoch milliseconds. Railway access tokens last one hour. */
  accessTokenExpiresAt: z.number(),
});
export type Session = z.infer<typeof Session>;

const SESSION_COOKIE = "railway_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const cookieDefaults = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/**
 * Hashes SESSION_SECRET into the 256-bit key that A256GCM requires.
 */
async function encryptionKey(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.SESSION_SECRET),
  );
  return new Uint8Array(digest);
}

/**
 * Reads the current session from the httpOnly cookie, decrypting it.
 * Returns null if there is no session or if the session is invalid.
 */
export async function readSession(): Promise<Session | null> {
  return decryptSession(getCookie(SESSION_COOKIE));
}

/**
 * Same as `readSession`, for code that runs outside TanStack Start's request context
 * (the WebSocket upgrade in `live-socket.ts`).
 */
export async function readSessionFromRequest(request: Request): Promise<Session | null> {
  return decryptSession(getRequestCookie(request, SESSION_COOKIE));
}

/** `getCookie` for code that runs outside TanStack Start's request context. */
export function getRequestCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("cookie")?.split(/;\s*/) ?? [];
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  return cookie && decodeURIComponent(cookie.slice(name.length + 1));
}

async function decryptSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await encryptionKey());
    return Session.parse(payload.session);
  } catch {
    // Tampered, expired, encrypted with an old secret, or an outdated shape: treat as signed out.
    return null;
  }
}

/**
 * Writes the current session by encrypting it and storing it in a httpOnly cookie.
 */
export async function writeSession(session: Session): Promise<void> {
  const token = await new EncryptJWT({ session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .encrypt(await encryptionKey());
  setCookie(SESSION_COOKIE, token, {
    ...cookieDefaults(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clears the current session by deleting the session cookie.
 */
export function clearSession(): void {
  deleteCookie(SESSION_COOKIE, cookieDefaults());
}
