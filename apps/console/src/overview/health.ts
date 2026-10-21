import { deploymentState } from "../railway/deployment-state";
import type { DeploymentState } from "../railway/deployment-state";
import type { OverviewEnvironment, OverviewService, ProjectOverview } from "../railway/overview";

export type Kind = DeploymentState["kind"];

/** Worst first: what the overview surfaces before anything else. */
export const KIND_ORDER: Kind[] = ["failed", "pending", "running", "sleeping", "stopped"];

export type ServiceWithState = OverviewService & {
  environment: OverviewEnvironment;
  state: DeploymentState;
};

/** Railway's primary environment (the oldest non-ephemeral one), else `production`, else the first. */
export function primaryEnvironment(project: ProjectOverview): OverviewEnvironment | undefined {
  return (
    project.environments.find((e) => e.id === project.primaryEnvironmentId) ??
    project.environments.find((e) => e.name === "production") ??
    project.environments[0]
  );
}

/** Services of one environment, or of all of them, with what their latest deployment means. */
export function servicesOf(
  project: ProjectOverview,
  environment?: OverviewEnvironment,
): ServiceWithState[] {
  const environments = environment ? [environment] : project.environments;
  return environments.flatMap((env) =>
    env.services.map((service) => ({
      ...service,
      environment: env,
      state: deploymentState(service.deployment),
    })),
  );
}

export type Health = {
  /** The worst state across services: the project's overall color. */
  kind: Kind;
  counts: Record<Kind, number>;
  /** Failed and pending services, worst first. */
  attention: ServiceWithState[];
};

export function healthOf(project: ProjectOverview, environment?: OverviewEnvironment): Health {
  const services = servicesOf(project, environment);
  const counts = { running: 0, sleeping: 0, pending: 0, failed: 0, stopped: 0 };
  for (const service of services) counts[service.state.kind]++;
  return {
    kind: KIND_ORDER.find((k) => counts[k] > 0) ?? "stopped",
    counts,
    attention: services
      .filter((s) => s.state.kind === "failed" || s.state.kind === "pending")
      .toSorted((a, b) => KIND_ORDER.indexOf(a.state.kind) - KIND_ORDER.indexOf(b.state.kind)),
  };
}

/** "now", "7m", "3h", "2d": short enough for dense rows. */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, (now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 60 / 24)}d`;
}

/** "a", "a and b", "a, b and c". */
export function listOf(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
