import { Kind, parse } from "@0no-co/graphql.web";
import { createClient } from "graphql-ws";
import type { Client } from "graphql-ws";
import { defineWebSocketHandler } from "nitro";
import { z } from "zod";

import { readSessionFromRequest } from "./session";

/**
 * WebSocket relay between the browser and Railway, speaking `graphql-transport-ws` on both sides.
 *
 * The browser can't talk to Railway directly without holding the access token, so this handler:
 * - authenticates the upgrade with the session cookie,
 * - only accepts `subscribe` for subscription operations (queries and mutations go through server
 *   functions),
 * - opens one upstream connection per Railway endpoint with the token in `connection_init`,
 * - closes with 1012 shortly before the token expires; the client reconnects with a refreshed cookie.
 *
 * See docs/realtime.md.
 */

const PUBLIC_ENDPOINT = "wss://backboard.railway.com/graphql/v2";
// 🐉🐉🐉 internal API: not part of Railway's public schema and may change without notice.
// Railway's dashboard uses it to learn about changes made elsewhere (see docs/realtime.md).
const INTERNAL_ENDPOINT = "wss://backboard.railway.com/graphql/internal";
const INTERNAL_ONLY_FIELDS = new Set(["canvasInvalidation"]);

/** Non-fatal for graphql-ws clients: they reconnect. */
const CLOSE_RECONNECT = 1012;
const CLOSE_BAD_REQUEST = 4400;
const CLOSE_DUPLICATE_ID = 4409;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connection_init") }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("subscribe"),
    id: z.string().min(1),
    payload: z.object({
      query: z.string(),
      variables: z.record(z.string(), z.unknown()).nullish(),
      operationName: z.string().nullish(),
    }),
  }),
  z.object({ type: z.literal("complete"), id: z.string().min(1) }),
]);

interface Connection {
  accessToken: string;
  upstreams: Map<string, Client>;
  subscriptions: Map<string, () => void>;
  expiryTimer: ReturnType<typeof setTimeout>;
  closing: boolean;
}

const connections = new Map<string, Connection>();

/** The Railway endpoint for a subscription document, or an error message if it isn't one. */
function endpointFor(query: string): { endpoint: string } | { error: string } {
  let document;
  try {
    document = parse(query);
  } catch {
    return { error: "Invalid GraphQL document" };
  }
  const operations = document.definitions.filter(
    (d) => d.kind === Kind.OPERATION_DEFINITION,
  );
  const operation = operations[0];
  if (operations.length !== 1 || operation?.operation !== "subscription") {
    return { error: "Only single subscription operations are allowed" };
  }
  const fields = operation.selectionSet.selections.flatMap((s) =>
    s.kind === Kind.FIELD ? [s.name.value] : [],
  );
  const internal = fields.filter((f) => INTERNAL_ONLY_FIELDS.has(f));
  if (internal.length > 0 && internal.length !== fields.length) {
    return {
      error: "Don't mix internal and public fields in one subscription",
    };
  }
  return {
    endpoint: internal.length > 0 ? INTERNAL_ENDPOINT : PUBLIC_ENDPOINT,
  };
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const session = await readSessionFromRequest(request);
    if (
      !session ||
      session.accessTokenExpiresAt - Date.now() < TOKEN_EXPIRY_MARGIN_MS
    ) {
      // The client refreshes the session (ensureLiveSession) before connecting, so this means
      // signed out. The client notices that in ensureLiveSession and stops retrying.
      throw new Response("Unauthorized", { status: 401 });
    }
    return {
      protocol: "graphql-transport-ws",
      context: {
        accessToken: session.accessToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
    };
  },

  open(peer) {
    const { accessToken, accessTokenExpiresAt } = z
      .object({ accessToken: z.string(), accessTokenExpiresAt: z.number() })
      .parse(peer.context);
    const expiresInMs =
      accessTokenExpiresAt - Date.now() - TOKEN_EXPIRY_MARGIN_MS;
    connections.set(peer.id, {
      accessToken,
      upstreams: new Map(),
      subscriptions: new Map(),
      expiryTimer: setTimeout(
        () => peer.close(CLOSE_RECONNECT, "Session expiring"),
        expiresInMs,
      ),
      closing: false,
    });
  },

  message(peer, raw) {
    const connection = connections.get(peer.id);
    const parsed = ClientMessage.safeParse(raw.json());
    if (!connection || !parsed.success) {
      peer.close(CLOSE_BAD_REQUEST, "Invalid message");
      return;
    }
    const message = parsed.data;
    const send = (data: unknown) => peer.send(JSON.stringify(data));

    switch (message.type) {
      case "connection_init":
        // The upgrade was already authenticated with the session cookie.
        send({ type: "connection_ack" });
        return;
      case "ping":
        send({ type: "pong" });
        return;
      case "pong":
        return;
      case "complete":
        connection.subscriptions.get(message.id)?.();
        connection.subscriptions.delete(message.id);
        return;
      case "subscribe": {
        const { id, payload } = message;
        if (connection.subscriptions.has(id)) {
          peer.close(CLOSE_DUPLICATE_ID, `Subscriber for ${id} already exists`);
          return;
        }
        const target = endpointFor(payload.query);
        if ("error" in target) {
          send({ type: "error", id, payload: [{ message: target.error }] });
          return;
        }
        const unsubscribe = upstream(
          peer,
          connection,
          target.endpoint,
        ).subscribe(
          {
            query: payload.query,
            variables: payload.variables ?? undefined,
            operationName: payload.operationName ?? undefined,
          },
          {
            next: (result) => send({ type: "next", id, payload: result }),
            error: (error) => {
              connection.subscriptions.delete(id);
              if (Array.isArray(error))
                send({ type: "error", id, payload: error });
              else peer.close(CLOSE_RECONNECT, "Upstream error");
            },
            complete: () => {
              if (connection.subscriptions.delete(id))
                send({ type: "complete", id });
            },
          },
        );
        connection.subscriptions.set(id, unsubscribe);
        return;
      }
    }
  },

  close(peer) {
    const connection = connections.get(peer.id);
    if (!connection) return;
    connections.delete(peer.id);
    connection.closing = true;
    clearTimeout(connection.expiryTimer);
    for (const unsubscribe of connection.subscriptions.values()) unsubscribe();
    for (const client of connection.upstreams.values()) void client.dispose();
  },
});

/**
 * The browser connection's graphql-ws client for a Railway endpoint, created on first use.
 */
function upstream(
  peer: { close: (code?: number, reason?: string) => void },
  connection: Connection,
  endpoint: string,
): Client {
  const existing = connection.upstreams.get(endpoint);
  if (existing) {
    return existing;
  }

  const client = createClient({
    url: endpoint,
    webSocketImpl: WebSocket,
    connectionParams: { Authorization: `Bearer ${connection.accessToken}` },
    lazy: false,
    retryAttempts: 0,
    on: {
      closed: () => {
        // Railway dropped us:
        // - don't retry
        // - instead, let the browser reconnect and resubscribe from scratch.
        if (!connection.closing) {
          peer.close(CLOSE_RECONNECT, "Upstream closed");
        }
      },
    },
  });

  connection.upstreams.set(endpoint, client);

  return client;
}
