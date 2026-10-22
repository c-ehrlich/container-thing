import { GraphQLError, Kind, buildSchema, execute, parse, subscribe, validate } from "graphql";
import type { DocumentNode, ExecutionResult } from "graphql";

import { createRoots } from "./resolvers";
import { seedWorld } from "./seed";
import { MockStore } from "./store";

export { TIMINGS } from "./store";

/**
 * A fake Railway that runs in the server's process: it answers GraphQL requests against Railway's
 * own schema from an in-memory world with far more data than a real account, and changes it like
 * Railway would. Deploys take a few seconds and push status changes; nothing is deployed for real.
 */

/** Fields only on Railway's internal endpoint that the console subscribes to (see docs/realtime.md). */
const INTERNAL_SDL = /* GraphQL */ `
  type CanvasInvalidation {
    id: String!
  }
  extend type Subscription {
    canvasInvalidation(environmentId: String!): CanvasInvalidation!
  }
`;

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown> | null;
  operationName?: string | null;
}

/** The same shape as graphql-ws's `Sink`, so the mock can stand in for an upstream client. */
export interface Sink {
  next: (result: ExecutionResult) => void;
  error: (error: unknown) => void;
  complete: () => void;
}

export type MockRailway = ReturnType<typeof createMockRailway>;

export function createMockRailway(options: {
  /** Railway's public schema, as SDL. */
  schema: string;
  seed?: number;
}) {
  // Railway's published schema trips graphql-js's schema validation (an interface field that's
  // deprecated in some implementations only), which doesn't matter for answering queries.
  const schema = buildSchema(options.schema + INTERNAL_SDL, {
    assumeValid: true,
    assumeValidSDL: true,
  });
  const store = new MockStore(seedWorld({ seed: options.seed }));
  const roots = createRoots(store);

  /** The parsed request, or the errors to answer it with. */
  function prepare(
    request: GraphQLRequest,
  ): { document: DocumentNode } | { errors: GraphQLError[] } {
    let document: DocumentNode;
    try {
      document = parse(request.query);
    } catch (error) {
      return { errors: [error instanceof GraphQLError ? error : new GraphQLError(String(error))] };
    }
    const errors = validate(schema, document);
    return errors.length > 0 ? { errors: [...errors] } : { document };
  }

  function rootFor(document: DocumentNode, operationName?: string | null) {
    const operation = document.definitions.find(
      (d) =>
        d.kind === Kind.OPERATION_DEFINITION && (!operationName || d.name?.value === operationName),
    );
    const type = operation?.kind === Kind.OPERATION_DEFINITION ? operation.operation : "query";
    return roots[type];
  }

  return {
    /** Runs a query or mutation. Like a GraphQL server, failures come back as `errors`. */
    async execute(request: GraphQLRequest): Promise<ExecutionResult> {
      const prepared = prepare(request);
      if ("errors" in prepared) return { errors: prepared.errors };
      return execute({
        schema,
        document: prepared.document,
        rootValue: rootFor(prepared.document, request.operationName),
        variableValues: request.variables ?? undefined,
        operationName: request.operationName ?? undefined,
      });
    },

    /**
     * Starts a subscription and returns a function that ends it. Like graphql-ws, GraphQL errors
     * arrive as an array in `sink.error`.
     */
    subscribe(request: GraphQLRequest, sink: Sink): () => void {
      let stopped = false;
      let results: AsyncIterator<ExecutionResult> | undefined;

      void (async () => {
        const prepared = prepare(request);
        if ("errors" in prepared) return sink.error(prepared.errors);
        const result = await subscribe({
          schema,
          document: prepared.document,
          rootValue: roots.subscription,
          variableValues: request.variables ?? undefined,
          operationName: request.operationName ?? undefined,
        });
        if (!(Symbol.asyncIterator in result)) return sink.error(result.errors ?? []);
        results = result;
        if (stopped) return void result.return?.();
        for await (const value of result) sink.next(value);
        if (!stopped) sink.complete();
      })().catch((error: unknown) => {
        if (!stopped) sink.error(error);
      });

      return () => {
        stopped = true;
        void results?.return?.();
      };
    },

    /** Puts the world back to how it started; deploys in flight are dropped. */
    reset() {
      store.replace(seedWorld({ seed: options.seed }));
    },

    stats: () => store.stats(),
  };
}
