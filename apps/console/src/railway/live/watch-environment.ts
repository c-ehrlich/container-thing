import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { keepEnvironmentLive } from "./environment-live";

/**
 * Environments currently on screen (overview, project page, chat widgets, ...), each kept live exactly
 * once. Without this, every widget for the same environment would open its own subscriptions and fire
 * its own refetches.
 */
interface Watch {
  count: number;
  stop: () => void;
}

const watches = new Map<string, Watch>();

/** Keeps every listed environment live while mounted. */
export function useWatchEnvironments(projects: { projectId: string; environmentIds: string[] }[]) {
  const queryClient = useQueryClient();
  // A string, so the effect only restarts when the set of environments changes.
  const watched = projects
    .flatMap((p) => p.environmentIds.map((environmentId) => `${p.projectId}/${environmentId}`))
    .join(",");
  useEffect(() => {
    const stops = watched
      .split(",")
      .filter(Boolean)
      .map((key) => {
        const [projectId = "", environmentId = ""] = key.split("/");
        return retainWatch(key, () =>
          keepEnvironmentLive(queryClient, projectId, environmentId, () => {}),
        );
      });
    return () => {
      for (const stop of stops) stop();
    };
  }, [queryClient, watched]);
}

/** Adds a watcher under `key`, starting it if it's the first, and returns a function that removes it again. */
function retainWatch(key: string, start: () => () => void): () => void {
  const retained = watches.get(key) ?? { count: 0, stop: start() };
  watches.set(key, retained);
  retained.count += 1;
  return () => {
    retained.count -= 1;
    if (retained.count > 0) return;
    retained.stop();
    watches.delete(key);
  };
}
