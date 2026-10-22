import { createServerFn } from "@tanstack/react-start";
import { createClient } from "graphql-ws";
import type { Client } from "graphql-ws";

import { getFreshSession } from "../../server/auth/oauth";
import { keepSubscribed } from "./transport";
import type { LiveConnection, LiveTransport } from "./transport";

/**
 * Refreshes the session cookie if the access token is about to expire, so the WebSocket upgrade
 * that follows carries a usable token. The relay can't refresh it itself: it has no response to set
 * a cookie on.
 */
const ensureLiveSession = createServerFn({ method: "POST" }).handler(async () => ({
  signedIn: (await getFreshSession()) !== null,
}));

class SignedOutError extends Error {}

let transport: LiveTransport | undefined;

/**
 * The app-wide connection to our `/api/live` relay (see `relay.ts`), speaking `graphql-transport-ws`.
 * Browser only; created on first use, and the socket opens with the first subscription.
 */
export function relayTransport(): LiveTransport {
  transport ??= createRelayTransport();
  return transport;
}

function createRelayTransport(): LiveTransport {
  let connection: LiveConnection = "connecting";
  const connectionListeners = new Set<() => void>();
  const reconnectListeners = new Set<() => void>();

  const setConnection = (next: LiveConnection) => {
    connection = next;
    for (const listener of connectionListeners) listener();
  };

  const client: Client = createClient({
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
      connecting: (isRetry) => setConnection(isRetry ? "reconnecting" : "connecting"),
      connected: (_socket, _payload, wasRetry) => {
        setConnection("connected");
        if (wasRetry) for (const listener of reconnectListeners) listener();
      },
    },
  });

  return {
    subscribe: (query, variables, handlers) =>
      keepSubscribed((sink) => client.subscribe({ query, variables }, sink), handlers),
    connection: () => connection,
    onConnectionChange: (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    onReconnected: (listener) => {
      reconnectListeners.add(listener);
      return () => reconnectListeners.delete(listener);
    },
  };
}
