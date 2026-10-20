import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireRailway } from "../railway/require-railway";
import { MemoryCache, createCachedLoader } from "../server/cache";
import { HubBudget } from "./hub-budget";

/**
 * Docker Hub's public API. It needs no auth but sends no CORS headers, so the browser goes through
 * these server functions. Hub rate-limits per IP (180 requests per minute at the time of writing),
 * and every user shares the server's IP. So answers are cached for a week, and how eagerly we
 * refresh them depends on how much of the allowance is left (see `HubBudget`).
 */
const HUB = "https://hub.docker.com/v2";

// Per server process. A Redis-backed `Cache` here would share it between instances.
const cached = createCachedLoader(new MemoryCache({ maxEntries: 5_000 }), {
  keepMs: 7 * 24 * 60 * 60_000,
});
const budget = new HubBudget();

const ImageSuggestion = z.object({
  /** What goes in the image field, e.g. `postgres` or `traefik/whoami:v1.10`. */
  ref: z.string(),
  description: z.string().nullable(),
  official: z.boolean(),
  pulls: z.number().nullable(),
});
export type ImageSuggestion = z.infer<typeof ImageSuggestion>;

const SearchResponse = z.object({
  results: z.array(
    z.object({
      repo_name: z.string(),
      short_description: z.string().nullish(),
      pull_count: z.number().nullish(),
      is_official: z.boolean().nullish(),
    }),
  ),
});

const TagsResponse = z.object({
  results: z.array(z.object({ name: z.string() })),
});

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  if (budget.left() === 0) throw new Error("Docker Hub is busy. Try again in a minute.");
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  budget.record(response);
  if (!response.ok) throw new Error(`Docker Hub: HTTP ${response.status}`);
  return schema.parse(await response.json());
}

const searchImagesFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ query: z.string().min(1).max(100) }))
  .handler(({ data }): Promise<ImageSuggestion[]> => {
    // Hub search ignores case, so `Postgres` and `postgres ` can share an entry.
    const query = data.query.trim().toLowerCase();
    const policy = { schema: z.array(ImageSuggestion), refreshAfterMs: budget.refreshAfterMs() };
    return cached(`docker-hub:search:${query}`, policy, async () => {
      const params = new URLSearchParams({ query, page_size: "8" });
      const { results } = await getJson(`${HUB}/search/repositories/?${params}`, SearchResponse);
      return results.map((r) => ({
        ref: r.repo_name,
        description: r.short_description || null,
        official: r.is_official ?? false,
        pulls: r.pull_count ?? null,
      }));
    });
  });

const listTagsFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ repository: z.string().min(1), prefix: z.string() }))
  .handler(({ data }): Promise<string[]> => {
    // Official images live under `library/` in the API, though nobody types that.
    const path = data.repository.includes("/") ? data.repository : `library/${data.repository}`;
    const policy = { schema: z.array(z.string()), refreshAfterMs: budget.refreshAfterMs() };
    return cached(`docker-hub:tags:${path}:${data.prefix}`, policy, async () => {
      const params = new URLSearchParams({ page_size: "20", ordering: "last_updated" });
      if (data.prefix) params.set("name", data.prefix);
      const url = `${HUB}/repositories/${path}/tags/?${params}`;
      const { results } = await getJson(url, TagsResponse);
      return results.map((t) => t.name);
    });
  });

const HUB_STALE_TIME = 10 * 60_000;

export const imageSearchQuery = (query: string) =>
  queryOptions({
    queryKey: ["docker-hub", "search", query],
    queryFn: () => searchImagesFn({ data: { query } }),
    staleTime: HUB_STALE_TIME,
    placeholderData: keepPreviousData,
    retry: false,
  });

export const imageTagsQuery = (repository: string, prefix: string) =>
  queryOptions({
    queryKey: ["docker-hub", "tags", repository, prefix],
    queryFn: () => listTagsFn({ data: { repository, prefix } }),
    staleTime: HUB_STALE_TIME,
    placeholderData: keepPreviousData,
    retry: false,
  });

/** Shown before anything is typed. */
export const POPULAR_IMAGES: ImageSuggestion[] = [
  { ref: "postgres", description: "PostgreSQL database", official: true, pulls: null },
  { ref: "redis", description: "In-memory key-value store", official: true, pulls: null },
  { ref: "nginx", description: "Web server and reverse proxy", official: true, pulls: null },
  { ref: "mongo", description: "MongoDB document database", official: true, pulls: null },
  {
    ref: "kennethreitz/httpbin",
    description: "HTTP request and response service",
    official: false,
    pulls: null,
  },
  {
    ref: "traefik/whoami",
    description: "Tiny server that echoes the request",
    official: false,
    pulls: null,
  },
];
