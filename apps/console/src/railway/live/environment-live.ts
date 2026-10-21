import { QueryObserver } from "@tanstack/react-query";
import type { QueryClient, QueryKey, QueryObserverOptions } from "@tanstack/react-query";
import { z } from "zod";

import { graphql } from "../graphql/graphql";
import { projectQuery } from "../project";
import type { Project } from "../project";
import {
  getLiveConnection,
  onLiveConnectionChange,
  onReconnected,
  subscribe,
  subscribeRaw,
} from "./live-client";
import type { LiveConnection } from "./live-client";

/**
 * 🐉🐉🐉 `canvasInvalidation` is an undocumented internal API
 * so we type it by hand and validate with zod
 *
 * found this while inspecting the "real" railway dashboard, and it's a better solution than polling
 */
const CANVAS_INVALIDATION = /* GraphQL */ `
  subscription CanvasInvalidation($environmentId: String!) {
    canvasInvalidation(environmentId: $environmentId) {
      id
    }
  }
`;
const CanvasInvalidation = z.object({
  canvasInvalidation: z.object({ id: z.string() }),
});

const DeploymentStatusSubscription = graphql(`
  subscription DeploymentStatus($id: String!) {
    deployment(id: $id) {
      id
      status
    }
  }
`);

/** deploys often send many events per second so we debounce refetches */
const REFETCH_DEBOUNCE_MS = 250;
/** fall back to polling if the socket is down or silent for too long */
const POLL_INTERVAL_MS = 30_000;

/**
 * canvasInvalidation resends the hash at least every ~8 s
 * so if we don't see anything for 30s it means we've likely lost the stream
 */
const CANVAS_SILENCE_MS = 30_000;

export type LiveMode = "live" | "polling";

export interface LiveStatus {
  mode: LiveMode;
  connection: LiveConnection;
}

/**
 * The query a screen shows for a project, observed while the environment is watched: observing keeps
 * it active (so invalidations refetch it), lets it poll, and reports which deployments it shows, so
 * their status pushes can refetch it too. The project page watches `projectQuery`; the overview
 * watches its own.
 */
export type LiveTarget = (
  queryClient: QueryClient,
  environmentId: string,
  onDeployments: (ids: string[]) => void,
) => { setPolling: (intervalMs: number | false) => void; stop: () => void };

/** A `LiveTarget` for `query`, given how to find an environment's deployments in its data. */
export function liveTarget<TData, TKey extends QueryKey>(
  query: QueryObserverOptions<TData, Error, TData, TData, TKey>,
  deploymentIds: (data: TData, environmentId: string) => string[],
): LiveTarget {
  return (queryClient, environmentId, onDeployments) => {
    const observer = new QueryObserver(queryClient, query);
    const report = (data: TData | undefined) =>
      onDeployments(data === undefined ? [] : deploymentIds(data, environmentId));
    const unsubscribe = observer.subscribe((result) => report(result.data));
    report(observer.getCurrentResult().data);
    return {
      setPolling: (intervalMs) => observer.setOptions({ ...query, refetchInterval: intervalMs }),
      stop: unsubscribe,
    };
  };
}

export const projectTarget = (projectId: string) =>
  liveTarget(
    projectQuery(projectId),
    (data: Project, environmentId) =>
      data.environments
        .find((e) => e.id === environmentId)
        ?.services.flatMap((s) => (s.deployment ? [s.deployment.id] : [])) ?? [],
  );

/**
 * Keeps a project's queries fresh for one environment until the returned function is called.
 * We only use subscriptions to trigger refetches, not yet as basically event sourcing
 *
 * - `canvasInvalidation` catches changes made anywhere (dashboard, CLI, git push).
 * - `deployment(id)` catches status changes of the deployments currently shown.
 * - While that isn't available (`canvasInvalidation` errored or silent for 30 s, connection down), the query polls
 *   instead.
 */
export function keepEnvironmentLive(
  queryClient: QueryClient,
  projectId: string,
  environmentId: string,
  target: LiveTarget,
  onStatus: (status: LiveStatus) => void,
): () => void {
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefetch = () => {
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      // Every query about the project is keyed under `projectQuery`'s key (the overview's too), so
      // a change refetches whichever of them is on screen.
      void queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey });
    }, REFETCH_DEBOUNCE_MS);
  };

  const deployments = new Map<string, () => void>();
  const syncDeployments = (shown: string[]) => {
    const ids = new Set(shown);
    for (const [id, unsubscribe] of deployments) {
      if (ids.has(id)) continue;
      unsubscribe();
      deployments.delete(id);
    }
    for (const id of ids) {
      if (deployments.has(id)) continue;
      deployments.set(
        id,
        subscribe(DeploymentStatusSubscription, { id }, { next: scheduleRefetch, error: () => {} }),
      );
    }
  };
  const observed = target(queryClient, environmentId, syncDeployments);

  let canvasAvailable = true;
  let status: LiveStatus | undefined;
  const updateStatus = () => {
    const connection = getLiveConnection();
    const mode: LiveMode = canvasAvailable && connection === "connected" ? "live" : "polling";
    if (status?.mode === mode && status.connection === connection) return;
    if (status?.mode !== mode) {
      observed.setPolling(mode === "polling" ? POLL_INTERVAL_MS : false);
    }
    status = { mode, connection };
    onStatus(status);
  };
  const setCanvasAvailable = (available: boolean) => {
    canvasAvailable = available;
    updateStatus();
  };

  let lastHash: string | undefined;
  let lastPushAt = Date.now();
  let canvasFailed = false;
  const failCanvas = () => {
    canvasFailed = true;
    setCanvasAvailable(false);
  };
  const watchdog = setInterval(() => {
    if (canvasFailed) return;
    setCanvasAvailable(Date.now() - lastPushAt <= CANVAS_SILENCE_MS);
  }, 5_000);
  const unsubscribeCanvas = subscribeRaw(
    CANVAS_INVALIDATION,
    { environmentId },
    {
      next: (data) => {
        const parsed = CanvasInvalidation.safeParse(data);
        if (!parsed.success) return failCanvas();
        lastPushAt = Date.now();
        setCanvasAvailable(true);
        // Railway re-sends the same hash periodically; only a new one means something changed.
        // The first one also refetches, to cover changes between page load and subscribing.
        if (parsed.data.canvasInvalidation.id === lastHash) return;
        lastHash = parsed.data.canvasInvalidation.id;
        scheduleRefetch();
      },
      error: failCanvas,
    },
  );

  const unsubscribeConnection = onLiveConnectionChange(updateStatus);
  // Events may have been missed while disconnected.
  const unsubscribeReconnected = onReconnected(scheduleRefetch);
  updateStatus();

  return () => {
    clearTimeout(refetchTimer);
    clearInterval(watchdog);
    unsubscribeCanvas();
    for (const unsubscribe of deployments.values()) unsubscribe();
    observed.stop();
    unsubscribeConnection();
    unsubscribeReconnected();
  };
}
