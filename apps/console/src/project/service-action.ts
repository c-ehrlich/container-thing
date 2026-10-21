import type { ServiceWithState } from "../overview/health";
import type { Insight, InsightAction } from "../overview/insights";

/**
 * The one thing a service's row offers: the fix its failure insight picked, Cancel while it deploys,
 * Restart while it runs, Start when it's off. Sleeping services wake on their own with the next
 * request, so they get nothing.
 */
export function primaryActionFor(
  service: ServiceWithState,
  insight: Insight | undefined,
): InsightAction | undefined {
  const { deployment, state } = service;
  if (state.kind === "failed") {
    // Logs live in Railway's dashboard; the row's button should fix something.
    return insight?.primary.kind === "railway" ? insight.secondary : insight?.primary;
  }
  if (state.kind === "pending" && state.label === "Deploying" && deployment) {
    return { kind: "cancel", label: "Cancel", deploymentId: deployment.id };
  }
  if (state.kind === "running" && deployment) {
    return { kind: "restart", label: "Restart", deploymentId: deployment.id };
  }
  if (state.kind === "stopped") {
    return {
      kind: "deploy",
      label: "Start",
      serviceId: service.id,
      environmentId: service.environment.id,
    };
  }
  return undefined;
}
