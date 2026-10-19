import { print } from "@0no-co/graphql.web";
import { createServerFn } from "@tanstack/react-start";
import type { TadaDocumentNode } from "gql.tada";
import { createClient } from "graphql-ws";
import type { Client } from "graphql-ws";
import { useSyncExternalStore } from "react";

import { getFreshSession } from "../railway-oauth";

/**
 * Refreshes the session cookie if the access token is about to expire, so the WebSocket upgrade
 * that follows carries a usable token. The relay can't refresh it itself: it has no response to set
 * a cookie on.
 */
const ensureLiveSession = createServerFn({ method: "POST" }).handler(
  async () => ({
    signedIn: (await getFreshSession()) !== null,
  }),
);

class SignedOutError extends Error {}

export type LiveConnection =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "signed-out";

let connection: LiveConnection = "connecting";
const connectionListeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

function setConnection(next: LiveConnection) {
  connection = next;
  for (const listener of connectionListeners) listener();
}

let client: Client | undefined;

/** The app-wide connection to our `/api/live` relay. Browser only; created on first use. */
function liveClient(): Client {
  client ??= createClient({
    url: async () => {
      const { signedIn } = await ensureLiveSession();
      if (!signedIn) {
        setConnection("signed-out");
        throw new SignedOutError("Not signed in to Railway");
      }
      const url = new URL("/api/live", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    },
    lazy: true,
    lazyCloseTimeout: 5_000,
    retryAttempts: Number.POSITIVE_INFINITY,
    shouldRetry: (error) => !(error instanceof SignedOutError),
    on: {
      connecting: (isRetry) =>
        setConnection(isRetry ? "reconnecting" : "connecting"),
      connected: (_socket, _payload, wasRetry) => {
        setConnection("connected");
        // Events may have been missed while disconnected.
        if (wasRetry) for (const listener of reconnectListeners) listener();
      },
    },
  });
  return client;
}

export function useLiveConnection(): LiveConnection {
  return useSyncExternalStore(
    (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    () => connection,
    () => "connecting",
  );
}

/** Calls `listener` after the connection comes back from a drop. */
export function onReconnected(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

interface Handlers<Data> {
  next: (data: Data) => void;
  error: (error: unknown) => void;
}

/** A subscription that ends sooner than this after starting is resubscribed with a delay. */
const MIN_HEALTHY_LIFETIME_MS = 10_000;
const RESUBSCRIBE_BACKOFF_MS = 10_000;

/**
 * Subscribes to an untyped document (for `canvasInvalidation` which is an internal/undocumented API).
 *
 * Subscriptions here last until the caller unsubscribes. Railway ends some on its own (measured:
 * `canvasInvalidation` completes after ~95 s), so a server-side `complete` resubscribes. One that
 * keeps completing right away backs off instead of looping.
 */
export function subscribeRaw(
  query: string,
  variables: Record<string, unknown>,
  handlers: Handlers<unknown>,
): () => void {
  let unsubscribe: (() => void) | undefined;
  let resubscribeTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const start = () => {
    const startedAt = Date.now();
    unsubscribe = liveClient().subscribe(
      { query, variables },
      {
        next: (result) => {
          if (result.errors?.length) handlers.error(result.errors);
          else handlers.next(result.data);
        },
        error: handlers.error,
        complete: () => {
          // graphql-ws also calls this after our own unsubscribe.
          if (stopped) {
            return;
          }

          const lifetime = Date.now() - startedAt;
          resubscribeTimer = setTimeout(
            start,
            lifetime < MIN_HEALTHY_LIFETIME_MS ? RESUBSCRIBE_BACKOFF_MS : 0,
          );
        },
      },
    );
  };

  start();
  return () => {
    stopped = true;
    clearTimeout(resubscribeTimer);
    unsubscribe?.();
  };
}

/** Subscribes to a gql.tada document; `next` receives schema-typed data. */
export function subscribe<Result, Variables extends Record<string, unknown>>(
  document: TadaDocumentNode<Result, Variables>,
  variables: Variables,
  handlers: Handlers<Result>,
): () => void {
  return subscribeRaw(print(document), variables, {
    // The result type comes from Railway's schema via gql.tada, so we trust it.
    // In the future we could zod validate instead of casting.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    next: (data) => handlers.next(data as Result),
    error: handlers.error,
  });
}
