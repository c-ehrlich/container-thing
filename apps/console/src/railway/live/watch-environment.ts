import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { keepEnvironmentLive } from "./environment-live";
import type { LiveStatus } from "./environment-live";

/**
 * Environments currently on screen (project page, chat widgets, ...), each kept live exactly once.
 * Without this, every widget for the same environment would open its own subscriptions and fire its
 * own refetches.
 */
interface Watch {
  count: number;
  status?: LiveStatus;
  stop: () => void;
}

const watches = new Map<string, Watch>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToWatches(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const watchKey = (projectId: string, environmentId: string) => `${projectId}/${environmentId}`;

/** Keeps an environment live while mounted and returns its status. */
export function useWatchEnvironment(
  projectId: string,
  environmentId: string | undefined,
): LiveStatus | undefined {
  const queryClient = useQueryClient();
  useEffect(
    () => (environmentId ? retainWatch(queryClient, projectId, environmentId) : undefined),
    [queryClient, projectId, environmentId],
  );

  return useSyncExternalStore(
    subscribeToWatches,
    () => (environmentId ? watches.get(watchKey(projectId, environmentId))?.status : undefined),
    () => undefined,
  );
}

/** Adds a watcher for the environment, starting it if it's the first, and returns a function that removes it again. */
function retainWatch(
  queryClient: QueryClient,
  projectId: string,
  environmentId: string,
): () => void {
  const key = watchKey(projectId, environmentId);
  const watch = watches.get(key) ?? startWatch(queryClient, projectId, environmentId, key);
  watch.count += 1;
  return () => {
    watch.count -= 1;
    if (watch.count > 0) return;
    watch.stop();
    watches.delete(key);
    notify();
  };
}

function startWatch(
  queryClient: QueryClient,
  projectId: string,
  environmentId: string,
  key: string,
): Watch {
  const watch: Watch = { count: 0, stop: () => {} };
  watches.set(key, watch);
  watch.stop = keepEnvironmentLive(queryClient, projectId, environmentId, (status) => {
    watch.status = status;
    notify();
  });
  return watch;
}
