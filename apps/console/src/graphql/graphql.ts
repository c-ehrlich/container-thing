import { initGraphQLTada } from "gql.tada";

import type { introspection } from "./graphql-env.d.ts";

/** Tagged `graphql()` for Railway's public API. Query results and variables are typed from the schema. */
export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: { DateTime: string; BigInt: string; JSON: unknown };
}>();
