import { Badge } from "@repo/ui/primitives/badge";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useSyncExternalStore } from "react";

import { deploymentState } from "./deployment-state";
import type { Deployment } from "./project";

/** A service's status as shown everywhere in the app: project page and chat widgets alike. */
export function ServiceStatusBadge(props: { deployment: Deployment | null }) {
  const { deployment } = props;
  const state = deploymentState(deployment);
  return (
    <Badge
      variant={
        state.kind === "failed" ? "destructive" : state.kind === "running" ? "default" : "secondary"
      }
    >
      {state.kind === "pending" && <Spinner />}
      {state.label}
      {state.kind === "pending" && deployment && <Elapsed since={deployment.createdAt} />}
    </Badge>
  );
}

/**
 * Railway pushes deploy progress in bursts (nothing for ~14 s, then several steps at once), so the
 * elapsed time ticks locally instead of waiting for events.
 */
function Elapsed(props: { since: string }) {
  const now = useNow();
  if (now === null) return null;
  return (
    <span className="tabular-nums">
      {Math.max(0, Math.round((now - Date.parse(props.since)) / 1000))}s
    </span>
  );
}

/** A clock shared by every `Elapsed`, ticking once a second while any is mounted. */
let clockNow = Date.now();
let clockInterval: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeToClock(listener: () => void) {
  clockListeners.add(listener);
  clockInterval ??= setInterval(() => {
    clockNow = Date.now();
    for (const l of clockListeners) l();
  }, 1000);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockInterval);
      clockInterval = undefined;
    }
  };
}

/** Current time in the browser; null during server rendering and hydration. */
function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => clockNow,
    () => null,
  );
}
