import { z } from "zod";

/**
 * A key-value store with expiry. It's async and only holds JSON-serializable values, so a shared store
 * like Redis (`GET`, `SET key value PX ttl`) can stand in for `MemoryCache` without changing callers.
 */
export interface Cache {
  /** The value stored under `key`, or `undefined` if there is none or it expired. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

/**
 * A `Cache` in this process's memory. Each server instance has its own, and it's empty after a
 * restart. Once full, it drops the oldest entries first.
 */
export class MemoryCache implements Cache {
  readonly #entries = new Map<string, { value: unknown; expiresAt: number }>();
  readonly #maxEntries: number;

  constructor(options: { maxEntries: number }) {
    this.#maxEntries = options.maxEntries;
  }

  get(key: string): Promise<unknown> {
    const entry = this.#entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.#entries.delete(key);
    return Promise.resolve(entry && entry.expiresAt > Date.now() ? entry.value : undefined);
  }

  set(key: string, value: unknown, ttlMs: number): Promise<void> {
    // Re-inserting moves the key to the end. Maps iterate in insertion order, so the first key is
    // always the oldest write.
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    return Promise.resolve();
  }
}

/**
 * Wraps a cache in stale-while-revalidate: anything cached within `keepMs` is returned right away, and
 * if it's older than `refreshAfterMs` it's also reloaded in the background for the next caller. Only
 * keys with nothing cached make the caller wait for `load`.
 *
 * Concurrent loads of a key are shared, and failed loads aren't cached. Values are parsed with
 * `schema` on the way out, since a shared cache can hold values written by older code.
 */
export function createCachedLoader(cache: Cache, options: { keepMs: number }) {
  const loading = new Map<string, Promise<unknown>>();

  async function loadOnce<T>(key: string, schema: z.ZodType<T>, load: () => Promise<T>) {
    const pending = loading.get(key);
    if (pending) return schema.parse(await pending);

    const promise = load()
      .then(async (value) => {
        await cache.set(key, { value, fetchedAt: Date.now() }, options.keepMs);
        return value;
      })
      .finally(() => loading.delete(key));
    loading.set(key, promise);
    return promise;
  }

  return async function cached<T>(
    key: string,
    policy: { schema: z.ZodType<T>; refreshAfterMs: number },
    load: () => Promise<T>,
  ): Promise<T> {
    const Entry = z.object({ value: policy.schema, fetchedAt: z.number() });
    const entry = Entry.safeParse(await cache.get(key));
    if (!entry.success) return loadOnce(key, policy.schema, load);

    if (Date.now() - entry.data.fetchedAt > policy.refreshAfterMs) {
      // A failed refresh just means the next caller gets the old value again.
      loadOnce(key, policy.schema, load).catch(() => undefined);
    }
    return entry.data.value;
  };
}
