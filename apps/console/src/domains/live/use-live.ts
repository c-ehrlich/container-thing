import { QueryObserver, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { deploymentState } from "../project/deployment-state";
import { projectOverviewQuery, projectScope } from "../project/overview";
import type { ProjectOverview } from "../project/overview";
import { logsQuery } from "../project/service";
import { watchEnvironment } from "./environment";
import { mergeLogLines, streamDeploymentLogs } from "./logs";
import { relayTransport } from "./relay-client";

/** Polling interval while live pushes aren't available. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Deploys in flight in one environment. Railway's canvas pushes already cover every other change, so
 * only these also get their own status subscription.
 */
function deploysInFlight(project: ProjectOverview | undefined, environmentId: string): string[] {
  return (
    project?.environments
      .find((e) => e.id === environmentId)
      ?.services.flatMap((s) =>
        s.deployment && deploymentState(s.deployment).kind === "pending" ? [s.deployment.id] : [],
      ) ?? []
  );
}

/**
 * Connects `watchEnvironment` to the query cache until the returned function is called:
 * - a change refetches every query about the project (they're all keyed under `projectScope`),
 * - the deploys in flight in the project's data are the ones followed individually,
 * - while pushes aren't available, the project's query polls instead.
 */
function keepEnvironmentLive(queryClient: QueryClient, projectId: string, environmentId: string) {
  // Observing the project's query keeps it active, so invalidating it refetches it even when no
  // screen shows it right now, and lets it poll.
  const query = projectOverviewQuery(projectId);
  const observer = new QueryObserver(queryClient, query);

  let polling = false;
  const watch = watchEnvironment(relayTransport(), {
    environmentId,
    onChange: () => void queryClient.invalidateQueries({ queryKey: projectScope(projectId) }),
    onStatus: ({ mode }) => {
      if (polling === (mode === "polling")) return;
      polling = mode === "polling";
      observer.setOptions({
        ...query,
        refetchInterval: polling ? POLL_INTERVAL_MS : query.refetchInterval,
      });
    },
  });

  const unsubscribe = observer.subscribe((result) =>
    watch.setDeployments(deploysInFlight(result.data, environmentId)),
  );
  watch.setDeployments(deploysInFlight(observer.getCurrentResult().data, environmentId));

  return () => {
    unsubscribe();
    watch.stop();
  };
}

/**
 * Environments currently on screen (overview, project page, chat widgets, ...), each kept live exactly
 * once. Without this, every widget for the same environment would open its own subscriptions and fire
 * its own refetches.
 */
const watches = new Map<string, { count: number; stop: () => void }>();

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
        return retainWatch(key, () => keepEnvironmentLive(queryClient, projectId, environmentId));
      });
    return () => {
      for (const stop of stops) stop();
    };
  }, [queryClient, watched]);
}

/** Appends runtime log lines Railway pushes to the cached logs of one deployment while `enabled`. */
export function useDeploymentLogStream(deploymentId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    const { queryKey } = logsQuery(deploymentId, "deploy");
    return streamDeploymentLogs(relayTransport(), deploymentId, (lines) =>
      queryClient.setQueryData(queryKey, (current = []) => mergeLogLines(current, lines)),
    );
  }, [deploymentId, enabled, queryClient]);
}
