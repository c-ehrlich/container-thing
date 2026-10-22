import { print } from "@0no-co/graphql.web";
import type { TadaDocumentNode } from "gql.tada";
import { z } from "zod";

import { GRAPHQL_ENDPOINT } from "./consts";

const GraphQLResponse = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export type RailwayClient = ReturnType<typeof createRailwayClient>;

/**
 * A typed request function for Railway's public GraphQL API, authenticated as one user, with error handling.
 */
export function createRailwayClient(accessToken: string) {
  return async <Result, Variables>(
    document: TadaDocumentNode<Result, Variables>,
    variables?: Variables,
  ): Promise<Result> => {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: print(document), variables }),
      signal: AbortSignal.timeout(10_000),
    });

    // https://i.imgur.com/kz41csA.png
    const json: unknown = await response.json().catch(() => null);
    const { data, errors = [] } = GraphQLResponse.safeParse(json).data ?? {};
    if (!response.ok || errors.length > 0 || data == null) {
      const reason = errors.map((e) => e.message).join("; ") || `HTTP ${response.status}`;
      throw new Error(`Railway API: ${reason}`);
    }

    // We trust that the GQL schema are correct
    // If we wanted to go further, we could create a zod client or something
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return data as Result;
  };
}
