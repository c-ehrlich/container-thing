import { Badge } from "@repo/ui/primitives/badge";
import { Spinner } from "@repo/ui/primitives/spinner";
import { CircleAlertIcon, MoonIcon, SquareIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { deploymentState } from "../domains/project/deployment-state";
import type { DeploymentState } from "../domains/project/deployment-state";
import type { LatestDeployment } from "../domains/project/project";

/** Color only where it matters: green when up, yellow on its way, red when broken. Off is gray. */
const BADGE_VARIANT = {
  running: "success", // Not used: running renders as a dot, see below.
  sleeping: "outline",
  pending: "warning",
  failed: "destructive",
  stopped: "muted",
} as const satisfies Record<DeploymentState["kind"], string>;

/**
 * A service's status as shown everywhere in the app: project page and chat widgets alike. Running is
 * the normal case, so it's a dot and quiet text; a pill is kept for states that need a look.
 */
export function ServiceStatusBadge(props: { deployment: LatestDeployment | null }) {
  const { deployment } = props;
  const state = deploymentState(deployment);
  if (state.kind === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" />
        {state.label}
      </span>
    );
  }
  return (
    <Badge variant={BADGE_VARIANT[state.kind]}>
      {state.kind === "pending" && <Spinner />}
      {state.kind === "failed" && <CircleAlertIcon data-icon="inline-start" />}
      {state.kind === "sleeping" && <MoonIcon data-icon="inline-start" />}
      {state.kind === "stopped" && <SquareIcon data-icon="inline-start" />}
      {state.label}
      {state.kind === "pending" && deployment && <Elapsed since={pendingSince(deployment)} />}
    </Badge>
  );
}

/**
 * When the current wait began. A deploy counts from its creation, across all its steps. A
 * deployment being removed was created when it was deployed, maybe hours ago, so stopping counts
 * from its last status change instead, or not at all if Railway didn't say.
 */
function pendingSince(deployment: LatestDeployment): string | undefined {
  if (deployment.status !== "REMOVING") return deployment.createdAt;
  return deployment.statusUpdatedAt ?? undefined;
}

/**
 * Railway pushes deploy progress in bursts (nothing for ~14 s, then several steps at once), so the
 * elapsed time ticks locally instead of waiting for events.
 */
function Elapsed(props: { since: string | undefined }) {
  const now = useNow();
  if (now === null || props.since === undefined) return null;
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
