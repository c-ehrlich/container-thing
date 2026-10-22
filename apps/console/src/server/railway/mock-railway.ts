import { Kind, print } from "@0no-co/graphql.web";
import type { DocumentNode } from "@0no-co/graphql.web";
import { createMockRailway } from "@repo/railway-mock";
import type { MockRailway } from "@repo/railway-mock";
import type { TadaDocumentNode } from "gql.tada";

import schema from "../../lib/graphql/railway-schema.graphql?raw";
import type { RailwayClient } from "./railway-api";

/**
 * Root fields that aren't about the user's own projects, so mock mode still asks the real Railway:
 * templates are public, and the add-service dialog borrows their variables. Everything else goes to
 * the mock, so a call it doesn't know fails instead of changing the real account.
 */
const PASSTHROUGH = new Set(["template", "templateSearch"]);

declare global {
  var mockRailway: MockRailway | undefined;
}

/**
 * The one mock everyone shares. On `globalThis`, so the live relay (a Nitro handler) and the server
 * functions see the same one, and editing app code in dev keeps its state. The flip side: changes to
 * `@repo/railway-mock` itself only apply after restarting the dev server.
 */
export function mockRailway(): MockRailway {
  globalThis.mockRailway ??= createMockRailway({ schema });
  return globalThis.mockRailway;
}

function rootFields(document: DocumentNode) {
  return document.definitions.flatMap((definition) =>
    definition.kind === Kind.OPERATION_DEFINITION
      ? definition.selectionSet.selections.flatMap((s) =>
          s.kind === Kind.FIELD ? [s.name.value] : [],
        )
      : [],
  );
}

/** A `RailwayClient` answered by the mock, except for public data, which `real` fetches. */
export function createMockRailwayClient(mock: MockRailway, real: RailwayClient): RailwayClient {
  return async <Result, Variables>(
    document: TadaDocumentNode<Result, Variables>,
    variables?: Variables,
  ): Promise<Result> => {
    const fields = rootFields(document);
    const passthrough = fields.filter((field) => PASSTHROUGH.has(field));
    if (passthrough.length === fields.length) return real(document, variables);
    if (passthrough.length > 0) {
      throw new Error(`Railway API (mock): don't mix ${passthrough.join(", ")} with other fields`);
    }

    const { data, errors = [] } = await mock.execute({
      query: print(document),
      // Variables are plain JSON objects, the same as the real client sends.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      variables: variables as Record<string, unknown> | undefined,
    });
    if (errors.length > 0 || data == null) {
      const reason = errors.map((e) => e.message).join("; ") || "No data";
      throw new Error(`Railway API (mock): ${reason}`);
    }
    // The mock executes against Railway's schema, so the result has the document's shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return data as Result;
  };
}
