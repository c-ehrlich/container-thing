import { describe, expect, it, vi } from "vitest";

import { endpointFor } from "./relay";

// Server-only configuration comes along with the session code; none of it runs here.
vi.mock("../../server/env", () => ({ env: {} }));

describe("endpointFor", () => {
  it("sends public subscriptions to the public API", () => {
    expect(endpointFor("subscription { deployment(id: 1) { id } }")).toEqual({
      endpoint: "wss://backboard.railway.com/graphql/v2",
    });
  });

  it("sends canvasInvalidation to the internal API", () => {
    expect(endpointFor("subscription { canvasInvalidation(environmentId: 1) { id } }")).toEqual({
      endpoint: "wss://backboard.railway.com/graphql/internal",
    });
  });

  it.each([
    ["queries", "query { me { name } }"],
    ["mutations", "mutation { deploymentRemove(id: 1) }"],
    [
      "several operations",
      "subscription A { deployment(id: 1) { id } } subscription B { deployment(id: 2) { id } }",
    ],
    ["invalid documents", "subscription {"],
  ])("refuses %s", (_, query) => {
    expect(endpointFor(query)).toHaveProperty("error");
  });

  it("refuses mixing internal and public fields, which no single endpoint answers", () => {
    const query =
      "subscription { canvasInvalidation(environmentId: 1) { id } deployment(id: 1) { id } }";
    expect(endpointFor(query)).toHaveProperty("error");
  });
});
