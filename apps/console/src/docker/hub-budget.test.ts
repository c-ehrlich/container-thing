import { describe, expect, it } from "vitest";

import { HubBudget } from "./hub-budget";

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

/** A Docker Hub response with its rate limit headers, without calling Docker Hub. */
function hubResponse(remaining: number, options: { status?: number; resetIn?: number } = {}) {
  return new Response(null, {
    status: options.status ?? 200,
    headers: {
      "x-ratelimit-limit": "180",
      "x-ratelimit-remaining": String(remaining),
      "x-ratelimit-reset": String((NOW + (options.resetIn ?? MINUTE)) / 1000),
    },
  });
}

describe("HubBudget", () => {
  it("assumes the full allowance before hearing from Docker Hub", () => {
    const budget = new HubBudget();
    expect(budget.left(NOW)).toBe(1);
    expect(budget.refreshAfterMs(NOW)).toBe(10 * MINUTE);
  });

  it("reads what's left from the headers", () => {
    const budget = new HubBudget();
    budget.record(hubResponse(90), NOW);
    expect(budget.left(NOW)).toBe(0.5);
  });

  it.each([
    [180, 10 * MINUTE],
    [109, 10 * MINUTE],
    [100, 60 * MINUTE],
    [55, 60 * MINUTE],
    [54, Number.POSITIVE_INFINITY],
    [0, Number.POSITIVE_INFINITY],
  ])("with %i of 180 left, refreshes answers older than %d ms", (remaining, refreshAfter) => {
    const budget = new HubBudget();
    budget.record(hubResponse(remaining), NOW);
    expect(budget.refreshAfterMs(NOW)).toBe(refreshAfter);
  });

  it("counts as full again once the window resets", () => {
    const budget = new HubBudget();
    budget.record(hubResponse(0, { resetIn: 30_000 }), NOW);
    expect(budget.left(NOW + 29_999)).toBe(0);
    expect(budget.left(NOW + 30_000)).toBe(1);
  });

  it("treats a 429 as nothing left, even without headers", () => {
    const budget = new HubBudget();
    budget.record(new Response(null, { status: 429 }), NOW);
    expect(budget.left(NOW)).toBe(0);
    expect(budget.left(NOW + MINUTE)).toBe(1);
  });

  it("ignores responses without rate limit headers", () => {
    const budget = new HubBudget();
    budget.record(hubResponse(90), NOW);
    budget.record(new Response(null, { status: 500 }), NOW);
    expect(budget.left(NOW)).toBe(0.5);
  });
});
