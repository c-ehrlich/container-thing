import { QueryObserver } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import { deploymentState } from "../project/deployment-state";
import { projectOverviewQuery } from "../project/overview";
import type { ProjectOverview } from "../project/overview";
import { projectScope } from "../project/overview";
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
 * Keeps a project's queries fresh for one environment until the returned function is called.
 * We only use subscriptions to trigger refetches, not yet as basically event sourcing
 *
 * - `canvasInvalidation` catches changes made anywhere (dashboard, CLI, git push).
 * - `deployment(id)` catches status changes of the deploys in flight.
 * - While that isn't available (`canvasInvalidation` errored or silent for 30 s, connection down), the query polls
 *   instead.
 */
export function keepEnvironmentLive(
  queryClient: QueryClient,
  projectId: string,
  environmentId: string,
  onStatus: (status: LiveStatus) => void,
): () => void {
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefetch = () => {
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      // Every query about the project is keyed under `projectScope`, so a change refetches
      // whichever of them is on screen.
      void queryClient.invalidateQueries({ queryKey: projectScope(projectId) });
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
  // Observing the project's query keeps it active (so invalidations refetch it), lets it poll, and
  // says which deploys are in flight.
  const query = projectOverviewQuery(projectId);
  const observer = new QueryObserver(queryClient, query);
  const unsubscribeObserver = observer.subscribe((result) =>
    syncDeployments(deploysInFlight(result.data, environmentId)),
  );
  syncDeployments(deploysInFlight(observer.getCurrentResult().data, environmentId));

  let canvasAvailable = true;
  let status: LiveStatus | undefined;
  const updateStatus = () => {
    const connection = getLiveConnection();
    const mode: LiveMode = canvasAvailable && connection === "connected" ? "live" : "polling";
    if (status?.mode === mode && status.connection === connection) return;
    if (status?.mode !== mode) {
      observer.setOptions({
        ...query,
        refetchInterval: mode === "polling" ? POLL_INTERVAL_MS : query.refetchInterval,
      });
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
    unsubscribeObserver();
    unsubscribeConnection();
    unsubscribeReconnected();
  };
}
