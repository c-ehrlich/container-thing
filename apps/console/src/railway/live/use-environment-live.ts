import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";

import { graphql } from "../graphql/graphql";
import {
  onReconnected,
  subscribe,
  subscribeRaw,
  useLiveConnection,
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

/**
 * Keeps `query` fresh for one environment.
 * We only use subscriptions to trigger refetches, not yet as basically event sourcing
 *
 * - `canvasInvalidation` catches changes made anywhere (dashboard, CLI, git push).
 * - `deployment(id)` catches status changes of the deployments currently shown.
 * - While that isn't available (`canvasInvalidation` errored or silent for 30 s, connection down), the query polls
 *   instead.
 */
export function useEnvironmentLive<TData, TQueryKey extends QueryKey>(options: {
  query: UseQueryOptions<TData, Error, TData, TQueryKey>;
  environmentId: string;
  deploymentIds: string[];
}): { mode: LiveMode; connection: LiveConnection } {
  const { query, environmentId, deploymentIds } = options;
  const queryClient = useQueryClient();
  const connection = useLiveConnection();
  // Keyed by environment, so switching environments starts out optimistic again.
  const [canvasDownFor, setCanvasDownFor] = useState<string>();

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scheduleRefetch = useEffectEvent(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: query.queryKey });
    }, REFETCH_DEBOUNCE_MS);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => onReconnected(() => scheduleRefetch()), []);

  useEffect(() => {
    let lastHash: string | undefined;
    let lastPushAt = Date.now();
    let failed = false;
    const fail = () => {
      failed = true;
      setCanvasDownFor(environmentId);
    };
    const watchdog = setInterval(() => {
      if (failed) return;
      const silent = Date.now() - lastPushAt > CANVAS_SILENCE_MS;
      setCanvasDownFor(silent ? environmentId : undefined);
    }, 5_000);

    const unsubscribe = subscribeRaw(
      CANVAS_INVALIDATION,
      { environmentId },
      {
        next: (data) => {
          const parsed = CanvasInvalidation.safeParse(data);
          if (!parsed.success) return fail();
          lastPushAt = Date.now();
          setCanvasDownFor(undefined);
          // Railway re-sends the same hash periodically; only a new one means something changed.
          // The first one also refetches, to cover changes between page load and subscribing.
          if (parsed.data.canvasInvalidation.id === lastHash) return;
          lastHash = parsed.data.canvasInvalidation.id;
          scheduleRefetch();
        },
        error: fail,
      },
    );
    return () => {
      clearInterval(watchdog);
      unsubscribe();
    };
  }, [environmentId]);

  const deploymentIdsKey = deploymentIds.join(",");
  useEffect(() => {
    const ids = deploymentIdsKey ? deploymentIdsKey.split(",") : [];
    const unsubscribes = ids.map((id) =>
      subscribe(
        DeploymentStatusSubscription,
        { id },
        { next: () => scheduleRefetch(), error: () => {} },
      ),
    );
    return () => {
      for (const unsubscribeFn of unsubscribes) {
        unsubscribeFn();
      }
    };
  }, [deploymentIdsKey]);

  const canvasAvailable = canvasDownFor !== environmentId;
  const mode: LiveMode =
    canvasAvailable && connection === "connected" ? "live" : "polling";
  useQuery({
    ...query,
    refetchInterval: mode === "polling" ? POLL_INTERVAL_MS : false,
  });
  return { mode, connection };
}
