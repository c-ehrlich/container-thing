import { print } from "@0no-co/graphql.web";
import type { TadaDocumentNode } from "gql.tada";

export type LiveConnection = "connecting" | "connected" | "reconnecting" | "signed-out";

export interface Handlers<Data> {
  next: (data: Data) => void;
  error: (error: unknown) => void;
}

/**
 * Where live data comes from: one connection carrying many GraphQL subscriptions. In the browser
 * that's `relayTransport()`, our server's relay to Railway; tests pass a fake.
 */
export interface LiveTransport {
  /** Subscribes until the returned function is called. Results with GraphQL errors go to `error`. */
  subscribe: (
    query: string,
    variables: Record<string, unknown>,
    handlers: Handlers<unknown>,
  ) => () => void;
  connection: () => LiveConnection;
  /** Calls `listener` whenever `connection()` changes. */
  onConnectionChange: (listener: () => void) => () => void;
  /** Calls `listener` after the connection comes back from a drop: events may have been missed. */
  onReconnected: (listener: () => void) => () => void;
}

/** A subscription that ends sooner than this after starting is resubscribed with a delay. */
export const MIN_HEALTHY_LIFETIME_MS = 10_000;
export const RESUBSCRIBE_BACKOFF_MS = 10_000;

/** The callbacks of one subscription attempt, as graphql-ws calls them. */
export interface Sink {
  next: (result: { data?: unknown; errors?: readonly unknown[] }) => void;
  error: (error: unknown) => void;
  complete: () => void;
}

/**
 * Keeps a subscription going until the returned function is called. `start` makes one attempt.
 *
 * Railway ends some subscriptions on its own (measured: `canvasInvalidation` completes after ~95 s),
 * so a server-side `complete` resubscribes. One that keeps completing right away backs off instead
 * of looping.
 */
export function keepSubscribed(
  start: (sink: Sink) => () => void,
  handlers: Handlers<unknown>,
): () => void {
  let unsubscribe: (() => void) | undefined;
  let resubscribeTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const attempt = () => {
    const startedAt = Date.now();
    unsubscribe = start({
      next: (result) => {
        if (result.errors?.length) handlers.error(result.errors);
        else handlers.next(result.data);
      },
      error: handlers.error,
      complete: () => {
        // graphql-ws also calls this after our own unsubscribe.
        if (stopped) return;
        const lifetime = Date.now() - startedAt;
        resubscribeTimer = setTimeout(
          attempt,
          lifetime < MIN_HEALTHY_LIFETIME_MS ? RESUBSCRIBE_BACKOFF_MS : 0,
        );
      },
    });
  };

  attempt();
  return () => {
    stopped = true;
    clearTimeout(resubscribeTimer);
    unsubscribe?.();
  };
}

/** Subscribes to a gql.tada document; `next` receives schema-typed data. */
export function subscribeDocument<Result, Variables extends Record<string, unknown>>(
  transport: LiveTransport,
  document: TadaDocumentNode<Result, Variables>,
  variables: Variables,
  handlers: Handlers<Result>,
): () => void {
  return transport.subscribe(print(document), variables, {
    // The result type comes from Railway's schema via gql.tada, so we trust it.
    // In the future we could zod validate instead of casting.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    next: (data) => handlers.next(data as Result),
    error: handlers.error,
  });
}
