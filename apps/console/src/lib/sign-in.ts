/** What signed-in-only server functions and routes fail with when there's no usable session. */
export const SIGNED_OUT_MESSAGE = "Not signed in to Railway";

export const isSignedOutError = (error: unknown) =>
  error instanceof Error && error.message === SIGNED_OUT_MESSAGE;

let leaving = false;

/**
 * Reloads the page when the session ends while a tab is open (the refresh token was revoked, or the
 * user signed out in another tab), so the root loader finds no session and shows the sign-in screen
 * instead of a page full of errors. Does nothing on the server.
 */
export function goToSignIn(): void {
  if (typeof window === "undefined" || leaving) return;
  leaving = true;
  window.location.reload();
}
