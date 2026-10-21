import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { CodeChallengeMethod, OAuth2Client, generateCodeVerifier, generateState } from "arctic";
import type { OAuth2Tokens } from "arctic";

import { env } from "../server/env";
import type { Session } from "../server/session";
import { cookieDefaults, readSession, writeSession } from "../server/session";
import { AUTHORIZATION_ENDPOINT, TOKEN_ENDPOINT } from "./consts";

/**
 * `offline_access` returns a refresh token.
 * `project:member` lets the user pick which projects this app may manage on the consent screen.
 */
const SCOPES = ["openid", "email", "profile", "offline_access", "project:member"];

/** Short-lived cookies holding the in-flight sign-in attempt. */
const STATE_COOKIE = "railway_oauth_state";
const VERIFIER_COOKIE = "railway_oauth_verifier";

const railwayOAuth = () =>
  new OAuth2Client(
    env.RAILWAY_OAUTH_CLIENT_ID,
    env.RAILWAY_OAUTH_CLIENT_SECRET,
    new URL("/auth/callback", env.APP_URL).toString(),
  );

function sessionFromTokens(tokens: OAuth2Tokens, previousRefreshToken: string | null): Session {
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : previousRefreshToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt().getTime(),
  };
}

/**
 * Remembers state + PKCE verifier in cookies and returns Railway's consent screen URL.
 */
export function startLogin(): string {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = railwayOAuth().createAuthorizationURLWithPKCE(
    AUTHORIZATION_ENDPOINT,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    SCOPES,
  );

  // Railway only issues a refresh token when consent is explicitly prompted.
  url.searchParams.set("prompt", "consent");

  const tenMinutes = { ...cookieDefaults(), maxAge: 60 * 10 };
  setCookie(STATE_COOKIE, state, tenMinutes);
  setCookie(VERIFIER_COOKIE, codeVerifier, tenMinutes);

  return url.toString();
}

export type LoginResult = { ok: true } | { ok: false; status: 400 | 502; message: string };

/**
 * Handles Railway's redirect back
 * - checks state
 * - exchanges the code for tokens
 * - stores the session.
 */
export async function finishLogin(params: URLSearchParams): Promise<LoginResult> {
  const expectedState = getCookie(STATE_COOKIE);
  const codeVerifier = getCookie(VERIFIER_COOKIE);
  deleteCookie(STATE_COOKIE, cookieDefaults());
  deleteCookie(VERIFIER_COOKIE, cookieDefaults());

  const error = params.get("error");
  if (error) {
    const description = params.get("error_description") ?? error;
    return {
      ok: false,
      status: 400,
      message: `Railway sign-in failed: ${description}`,
    };
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !expectedState || !codeVerifier || state !== expectedState) {
    return {
      ok: false,
      status: 400,
      message: "Invalid or expired sign-in attempt. Try again.",
    };
  }

  try {
    const tokens = await railwayOAuth().validateAuthorizationCode(
      TOKEN_ENDPOINT,
      code,
      codeVerifier,
    );

    await writeSession(sessionFromTokens(tokens, null));

    return { ok: true };
  } catch (cause) {
    console.error("Railway token exchange failed", cause);
    return {
      ok: false,
      status: 502,
      message: "Could not complete Railway sign-in.",
    };
  }
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * The current session with an access token that is valid for at least another minute,
 * refreshing (and re-saving the cookie) if needed. Null when signed out or the refresh failed.
 */
export async function getFreshSession(): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.accessTokenExpiresAt - Date.now() > REFRESH_MARGIN_MS) return session;
  if (!session.refreshToken) return null;

  try {
    const tokens = await railwayOAuth().refreshAccessToken(
      TOKEN_ENDPOINT,
      session.refreshToken,
      [],
    );
    const refreshed = sessionFromTokens(tokens, session.refreshToken);
    await writeSession(refreshed);
    return refreshed;
  } catch (cause) {
    console.error("Railway token refresh failed", cause);
    return null;
  }
}
