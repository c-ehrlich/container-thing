import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { overviewTarget } from "../overview";
import { keepEnvironmentLive, projectTarget } from "./environment-live";
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

const watchKey = (kind: string, projectId: string, environmentId: string) =>
  `${kind}:${projectId}/${environmentId}`;

/** Keeps an environment live while mounted and returns its status. */
export function useWatchEnvironment(
  projectId: string,
  environmentId: string | undefined,
): LiveStatus | undefined {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      environmentId
        ? retainWatch(watchKey("project", projectId, environmentId), (onStatus) =>
            keepEnvironmentLive(
              queryClient,
              projectId,
              environmentId,
              projectTarget(projectId),
              onStatus,
            ),
          )
        : undefined,
    [queryClient, projectId, environmentId],
  );

  return useSyncExternalStore(
    subscribeToWatches,
    () =>
      environmentId
        ? watches.get(watchKey("project", projectId, environmentId))?.status
        : undefined,
    () => undefined,
  );
}

/**
 * Keeps every environment of the overview's projects live while mounted. It watches the overview's
 * own query, so the overview doesn't also fetch each project the way the project page does.
 */
export function useWatchOverview(projects: { projectId: string; environmentIds: string[] }[]) {
  const queryClient = useQueryClient();
  // A string, so the effect only restarts when the set of environments changes.
  const watched = projects
    .flatMap((p) => p.environmentIds.map((environmentId) => `${p.projectId}/${environmentId}`))
    .join(",");
  useEffect(() => {
    const stops = watched
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const [projectId = "", environmentId = ""] = pair.split("/");
        return retainWatch(watchKey("overview", projectId, environmentId), (onStatus) =>
          keepEnvironmentLive(
            queryClient,
            projectId,
            environmentId,
            overviewTarget(projectId),
            onStatus,
          ),
        );
      });
    return () => {
      for (const stop of stops) stop();
    };
  }, [queryClient, watched]);
}

/** Adds a watcher under `key`, starting it if it's the first, and returns a function that removes it again. */
function retainWatch(
  key: string,
  start: (onStatus: (status: LiveStatus) => void) => () => void,
): () => void {
  let watch = watches.get(key);
  if (!watch) {
    const created: Watch = { count: 0, stop: () => {} };
    watches.set(key, created);
    created.stop = start((status) => {
      created.status = status;
      notify();
    });
    watch = created;
  }
  const retained = watch;
  retained.count += 1;
  return () => {
    retained.count -= 1;
    if (retained.count > 0) return;
    retained.stop();
    watches.delete(key);
    notify();
  };
}
