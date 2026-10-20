import {
  experimental_streamedQuery as streamedQuery,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import { keepEnvironmentLive } from "./environment-live";
import type { LiveStatus } from "./environment-live";

/**
 * Keeps an environment live for as long as anything on screen (project page, chat widgets, ...)
 * observes this query. React Query does the bookkeeping: every observer shares one stream, so the
 * subscriptions run once per environment, and when the last observer unmounts the query is cancelled,
 * which aborts `signal` and stops them.
 *
 * The query stays "fetching" while live, so keep it out of anything that counts or invalidates
 * queries in bulk.
 */
const environmentLiveQuery = (projectId: string, environmentId: string) =>
  queryOptions({
    queryKey: ["environment-live", projectId, environmentId],
    queryFn: streamedQuery({
      streamFn: ({ client, signal }) =>
        latest<LiveStatus>(signal, (emit) =>
          keepEnvironmentLive(client, projectId, environmentId, emit),
        ),
      reducer: (_previous, status: LiveStatus) => status,
      initialValue: undefined as LiveStatus | undefined,
      // On a restart, keep showing the last status until the new stream reports.
      refetchMode: "append",
    }),
    staleTime: Number.POSITIVE_INFINITY,
    // A cancelled stream keeps its last status, so a mount has to restart it even though it isn't
    // stale. While it's running, mounting joins the running stream instead.
    refetchOnMount: "always",
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

/** Keeps an environment live while mounted and returns its status once the watcher starts. */
export function useWatchEnvironment(
  projectId: string,
  environmentId: string | undefined,
): LiveStatus | undefined {
  const { data } = useQuery({
    ...environmentLiveQuery(projectId, environmentId ?? ""),
    enabled: environmentId !== undefined,
  });
  return data;
}

/**
 * Turns a callback source into an async iterable that ends when `signal` aborts. `start` returns
 * its own cleanup. Values that arrive while the consumer is busy are dropped in favor of the newest.
 */
async function* latest<T>(
  signal: AbortSignal,
  start: (emit: (value: T) => void) => () => void,
): AsyncGenerator<T> {
  let pending: { value: T } | undefined;
  let wake: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
  const stop = start((value) => {
    pending = { value };
    wake?.();
  });
  try {
    while (!signal.aborted) {
      if (pending) {
        const { value } = pending;
        pending = undefined;
        yield value;
        continue;
      }
      // Waiting is the point here: one value at a time, in order.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await Promise.race([new Promise<void>((resolve) => (wake = resolve)), aborted]);
      wake = undefined;
    }
  } finally {
    stop();
  }
}
