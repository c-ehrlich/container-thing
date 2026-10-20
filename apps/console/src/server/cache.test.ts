import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MemoryCache, createCachedLoader } from "./cache";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A promise the test resolves when it wants to. */
function deferred<T>() {
  const handle: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    handle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => handle.resolve?.(value) };
}

describe("MemoryCache", () => {
  it("returns what was set until it expires", async () => {
    const cache = new MemoryCache({ maxEntries: 10 });
    await cache.set("a", { n: 1 }, 1_000);

    expect(await cache.get("a")).toEqual({ n: 1 });
    vi.advanceTimersByTime(999);
    expect(await cache.get("a")).toEqual({ n: 1 });
    vi.advanceTimersByTime(1);
    expect(await cache.get("a")).toBeUndefined();
  });

  it("misses on keys it never had", async () => {
    expect(await new MemoryCache({ maxEntries: 10 }).get("nope")).toBeUndefined();
  });

  it("drops the oldest write once full", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set("a", 1, 1_000);
    await cache.set("b", 2, 1_000);
    // Rewriting `a` makes `b` the oldest.
    await cache.set("a", 3, 1_000);
    await cache.set("c", 4, 1_000);

    expect(await cache.get("a")).toBe(3);
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("c")).toBe(4);
  });
});

describe("createCachedLoader", () => {
  const MINUTE = 60_000;
  const policy = { schema: z.array(z.string()), refreshAfterMs: 10 * MINUTE };
  const setup = () =>
    createCachedLoader(new MemoryCache({ maxEntries: 10 }), { keepMs: 60 * MINUTE });

  it("only waits for a load when nothing is cached", async () => {
    const cached = setup();
    const load = vi.fn(() => Promise.resolve(["postgres"]));

    expect(await cached("k", policy, load)).toEqual(["postgres"]);
    expect(await cached("k", policy, load)).toEqual(["postgres"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns old values right away and refreshes them in the background", async () => {
    const cached = setup();
    await cached("k", policy, () => Promise.resolve(["v1"]));
    vi.advanceTimersByTime(10 * MINUTE + 1);

    const refresh = deferred<string[]>();
    // The refresh hasn't finished, so this is still the old value.
    expect(await cached("k", policy, () => refresh.promise)).toEqual(["v1"]);

    refresh.resolve(["v2"]);
    await vi.waitFor(async () =>
      expect(await cached("k", policy, () => Promise.resolve(["v3"]))).toEqual(["v2"]),
    );
  });

  it("never refreshes when refreshAfterMs is Infinity", async () => {
    const cached = setup();
    await cached("k", policy, () => Promise.resolve(["v1"]));
    vi.advanceTimersByTime(59 * MINUTE);
    const load = vi.fn(() => Promise.resolve(["v2"]));

    const frozen = { ...policy, refreshAfterMs: Number.POSITIVE_INFINITY };
    expect(await cached("k", frozen, load)).toEqual(["v1"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("forgets values after keepMs", async () => {
    const cached = setup();
    await cached("k", policy, () => Promise.resolve(["v1"]));
    vi.advanceTimersByTime(60 * MINUTE);

    expect(await cached("k", policy, () => Promise.resolve(["v2"]))).toEqual(["v2"]);
  });

  it("shares one load between concurrent callers", async () => {
    const cached = setup();
    const load = vi.fn(() => Promise.resolve(["redis"]));

    const results = await Promise.all([
      cached("k", policy, load),
      cached("k", policy, load),
      cached("k", policy, load),
    ]);

    expect(results).toEqual([["redis"], ["redis"], ["redis"]]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps keys apart", async () => {
    const cached = setup();

    expect(await cached("a", policy, () => Promise.resolve(["a"]))).toEqual(["a"]);
    expect(await cached("b", policy, () => Promise.resolve(["b"]))).toEqual(["b"]);
  });

  it("can cache null, as in 'there is no template for this image'", async () => {
    const cached = setup();
    const load = vi.fn(() => Promise.resolve(null));
    const nullable = { schema: z.string().nullable(), refreshAfterMs: 10 * MINUTE };

    expect(await cached("k", nullable, load)).toBeNull();
    expect(await cached("k", nullable, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("doesn't cache failures", async () => {
    const cached = setup();
    const load = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("HTTP 429"))
      .mockResolvedValueOnce(["nginx"]);

    await expect(cached("k", policy, load)).rejects.toThrow("HTTP 429");
    expect(await cached("k", policy, load)).toEqual(["nginx"]);
  });

  it("keeps the old value when a background refresh fails", async () => {
    const cached = setup();
    await cached("k", policy, () => Promise.resolve(["v1"]));
    vi.advanceTimersByTime(10 * MINUTE + 1);

    expect(await cached("k", policy, () => Promise.reject(new Error("HTTP 500")))).toEqual(["v1"]);
    expect(await cached("k", policy, () => Promise.reject(new Error("HTTP 500")))).toEqual(["v1"]);
  });

  it("reloads when the cached value no longer fits the schema", async () => {
    const cache = new MemoryCache({ maxEntries: 10 });
    await cache.set("k", { value: { written: "by older code" }, fetchedAt: Date.now() }, MINUTE);
    const load = vi.fn(() => Promise.resolve(["mongo"]));

    const cached = createCachedLoader(cache, { keepMs: MINUTE });
    expect(await cached("k", policy, load)).toEqual(["mongo"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
