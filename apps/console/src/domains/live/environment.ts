import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import { subscribeDocument } from "./transport";
import type { LiveConnection, LiveTransport } from "./transport";

/**
 * 🐉🐉🐉 `canvasInvalidation` is an undocumented internal API
 * so we type it by hand and validate with zod
 *
 * found this while inspecting the "real" railway dashboard, and it's a better solution than polling
 */
export const CANVAS_INVALIDATION = /* GraphQL */ `
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
export const CHANGE_DEBOUNCE_MS = 250;

/**
 * canvasInvalidation resends the hash at least every ~8 s
 * so if we don't see anything for 30s it means we've likely lost the stream
 */
export const CANVAS_SILENCE_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 5_000;

/** `live`: pushes arrive. `polling`: they don't, so whoever shows the data should poll for it. */
export type LiveMode = "live" | "polling";

export interface LiveStatus {
  mode: LiveMode;
  connection: LiveConnection;
}

export interface EnvironmentWatch {
  /** Which deployments to follow individually: their status pushes count as changes too. */
  setDeployments: (ids: string[]) => void;
  stop: () => void;
}

/**
 * Tells you when something in one environment changed, until `stop()`. Pushes are only signals: it
 * says *that* something changed, and the caller refetches to learn what (see docs/realtime.md).
 *
 * - `canvasInvalidation` catches changes made anywhere (dashboard, CLI, git push).
 * - `deployment(id)` catches status changes of the deployments passed to `setDeployments`.
 * - A reconnect counts as a change, since events may have been missed.
 * - Bursts of events become one `onChange`.
 *
 * `onStatus` reports `polling` while that isn't reliable: the connection is down, or
 * `canvasInvalidation` errored or went silent for 30 s.
 */
export function watchEnvironment(
  transport: LiveTransport,
  options: {
    environmentId: string;
    onChange: () => void;
    onStatus: (status: LiveStatus) => void;
  },
): EnvironmentWatch {
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(options.onChange, CHANGE_DEBOUNCE_MS);
  };

  let canvasAvailable = true;
  let status: LiveStatus | undefined;
  const updateStatus = () => {
    const connection = transport.connection();
    const mode: LiveMode = canvasAvailable && connection === "connected" ? "live" : "polling";
    if (status?.mode === mode && status.connection === connection) return;
    status = { mode, connection };
    options.onStatus(status);
  };
  const setCanvasAvailable = (available: boolean) => {
    canvasAvailable = available;
    updateStatus();
  };

  let lastHash: string | undefined;
  let lastPushAt = Date.now();
  // `canvasInvalidation` errored or sent something we can't read. Only a good push clears this: the
  // watchdog would otherwise mark it available again, since the last push was recent.
  let canvasErrored = false;
  const failCanvas = () => {
    canvasErrored = true;
    setCanvasAvailable(false);
  };
  const watchdog = setInterval(() => {
    if (canvasErrored) return;
    setCanvasAvailable(Date.now() - lastPushAt <= CANVAS_SILENCE_MS);
  }, WATCHDOG_INTERVAL_MS);
  const unsubscribeCanvas = transport.subscribe(
    CANVAS_INVALIDATION,
    { environmentId: options.environmentId },
    {
      next: (data) => {
        const parsed = CanvasInvalidation.safeParse(data);
        if (!parsed.success) return failCanvas();
        canvasErrored = false;
        lastPushAt = Date.now();
        setCanvasAvailable(true);
        // Railway re-sends the same hash periodically; only a new one means something changed.
        // The first one also counts, to cover changes between loading the data and subscribing.
        if (parsed.data.canvasInvalidation.id === lastHash) return;
        lastHash = parsed.data.canvasInvalidation.id;
        changed();
      },
      error: failCanvas,
    },
  );

  const deployments = new Map<string, () => void>();
  const setDeployments = (shown: string[]) => {
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
        subscribeDocument(
          transport,
          DeploymentStatusSubscription,
          { id },
          { next: changed, error: () => {} },
        ),
      );
    }
  };

  const unsubscribeConnection = transport.onConnectionChange(updateStatus);
  const unsubscribeReconnected = transport.onReconnected(changed);
  updateStatus();

  return {
    setDeployments,
    stop: () => {
      clearTimeout(changeTimer);
      clearInterval(watchdog);
      unsubscribeCanvas();
      for (const unsubscribe of deployments.values()) unsubscribe();
      deployments.clear();
      unsubscribeConnection();
      unsubscribeReconnected();
    },
  };
}
