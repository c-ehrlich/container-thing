import { deploymentState } from "../project/deployment-state";
import type { DeploymentState } from "../project/deployment-state";
import type { Environment, Service, Project } from "../project/project";

export type Kind = DeploymentState["kind"];

/** Worst first: what the overview surfaces before anything else. */
export const KIND_ORDER: Kind[] = ["failed", "pending", "running", "sleeping", "stopped"];

/** Matched on the image or repo name without its tag: `umami:postgresql-latest` is an app. */
const DATASTORE = /postgres|mysql|mariadb|redis|valkey|mongo|clickhouse|kafka|minio/;

export function isDatastore(service: { name: string; source: string | null }) {
  return DATASTORE.test((service.source ?? service.name).split(":")[0] ?? "");
}

export type ServiceWithState = Service & {
  environment: Environment;
  state: DeploymentState;
};

/** Services of one environment, or of all of them, with what their latest deployment means. */
export function servicesOf(project: Project, environment?: Environment): ServiceWithState[] {
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

export function healthOf(project: Project, environment?: Environment): Health {
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

/** A project's state in a few words: the broken or deploying service by name, else how the rest is. */
export function verdictOf(health: Health): { kind: Kind; label: string } {
  const worst = health.attention[0];
  if (health.kind === "failed" && worst) {
    const ago = worst.deployment ? ` ${timeAgo(worst.deployment.createdAt)} ago` : "";
    return { kind: "failed", label: `${worst.name} ${worst.state.label.toLowerCase()}${ago}` };
  }
  if (health.kind === "pending" && worst) {
    return { kind: "pending", label: `${worst.state.label} ${worst.name}` };
  }
  if (health.counts.running > 0) return { kind: "running", label: "Healthy" };
  if (health.counts.sleeping > 0) return { kind: "sleeping", label: "Asleep" };
  return { kind: "stopped", label: "Off" };
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
