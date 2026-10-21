import type { OverviewDeployment, ProjectOverview, ProjectUsage } from "../railway/overview";
import { listOf, primaryEnvironment, servicesOf, timeAgo } from "./health";
import type { ServiceWithState } from "./health";

/**
 * Turns the overview's data into a short list of things worth doing, each with the button that does
 * it. Plain rules, no model: everything an insight says comes from the project, its recent deploys
 * and its CPU, so it can't make things up.
 */

export type InsightAction =
  | { kind: "restart"; label: string; deploymentId: string }
  | { kind: "rollback"; label: string; deploymentId: string }
  | { kind: "cancel"; label: string; deploymentId: string }
  | { kind: "deploy"; label: string; serviceId: string; environmentId: string }
  | {
      kind: "remove-service";
      label: string;
      serviceId: string;
      serviceName: string;
      environmentId: string;
      environmentName: string;
    }
  | { kind: "open-project"; label: string; projectId: string; environmentId?: string }
  | { kind: "railway"; label: string; href: string };

export type Insight = {
  /**
   * Stable for as long as the situation lasts, and new once it changes (a new deploy, another
   * failure), so a dismissed insight comes back when there's something new to say.
   */
  key: string;
  rule: InsightRule;
  severity: "critical" | "warning" | "info";
  project: ProjectOverview;
  /** Set for insights about one service; failures show as a card with the project's diagram. */
  service?: ServiceWithState;
  headline: string;
  evidence: string;
  /** For failures: what else stops working along with it. */
  impact?: { text: string; dependents: string[] };
  primary: InsightAction;
  secondary?: InsightAction;
  /** When it happened, for sorting. */
  at: string;
};

export type InsightRule =
  | "repeated-failure"
  | "crash-after-deploy"
  | "crashed"
  | "failed-deploy"
  | "stuck-deploy"
  | "cpu-spike"
  | "idle-environment"
  | "never-deployed"
  | "long-stopped";

/** Rules about a broken service; the overview shows these under "Needs you". */
export const FAILURE_RULES = new Set<InsightRule>([
  "repeated-failure",
  "crash-after-deploy",
  "crashed",
  "failed-deploy",
]);

const SEVERITY_ORDER: Insight["severity"][] = ["critical", "warning", "info"];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A deploy still going after this long is probably stuck: Railway deploys usually take minutes. */
const STUCK_AFTER = 15 * MINUTE;
/** A crash within this long of its deploy is blamed on the deploy. */
const RECENT_DEPLOY = HOUR;
/** Recent CPU this many times the day's median counts as a spike. */
const SPIKE_RATIO = 1.6;

export function insightsFor(
  projects: { project: ProjectOverview; usage?: ProjectUsage }[],
  now = Date.now(),
): Insight[] {
  return projects
    .flatMap(({ project, usage }) => [
      ...servicesOf(project).flatMap((service) => serviceInsights(project, service, now)),
      ...(usage ? cpuSpike(project, usage) : []),
      ...idleEnvironments(project, now),
    ])
    .toSorted(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        Date.parse(b.at) - Date.parse(a.at),
    );
}

/**
 * Who stops working when `service` is down: everything that references it, and whatever references
 * those, within its environment.
 */
export function dependentsOf(service: ServiceWithState): string[] {
  const found = new Set<string>();
  const queue = [service.name];
  while (queue.length > 0) {
    const target = queue.shift();
    for (const [from, to] of service.environment.links) {
      if (to !== target || from === service.name || found.has(from)) continue;
      found.add(from);
      queue.push(from);
    }
  }
  return [...found];
}

/** Railway's page for a service, where its logs are. */
function railwayUrl(project: ProjectOverview, service: ServiceWithState, deploymentId?: string) {
  const url = new URL(`https://railway.com/project/${project.id}/service/${service.id}`);
  url.searchParams.set("environmentId", service.environment.id);
  if (deploymentId) url.searchParams.set("id", deploymentId);
  return url.toString();
}

/** The service's recent deploys in its environment, newest first. */
function historyOf(project: ProjectOverview, service: ServiceWithState) {
  return project.deployments
    .filter((d) => d.serviceId === service.id && d.environmentId === service.environment.id)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const isFailure = (d: OverviewDeployment) => d.status === "FAILED" || d.status === "CRASHED";

function serviceInsights(project: ProjectOverview, service: ServiceWithState, now: number) {
  if (service.state.kind === "failed") return [failureInsight(project, service, now)];
  if (service.state.kind === "pending") return stuckDeploy(project, service, now);
  return housekeeping(project, service, now);
}

function failureInsight(project: ProjectOverview, service: ServiceWithState, now: number): Insight {
  const history = historyOf(project, service);
  const streakEnd = history.findIndex((d) => !isFailure(d));
  const failures = streakEnd === -1 ? history : history.slice(0, streakEnd);
  const latest = failures[0];
  // Replaced deployments end up REMOVED, so the last good one is the newest that didn't fail and
  // that Railway can still roll back to.
  const lastGood = history.slice(failures.length).find((d) => d.canRollback);
  const change = latest?.commitMessage ? `“${latest.commitMessage}”` : "the latest change";
  const deployedAt = service.deployment?.createdAt ?? new Date(now).toISOString();
  const dependents = dependentsOf(service);
  const logs: InsightAction = {
    kind: "railway",
    label: "Logs",
    href: railwayUrl(project, service, service.deployment?.id),
  };
  const rollback: InsightAction | undefined = lastGood && {
    kind: "rollback",
    label: `Roll back to ${timeAgo(lastGood.createdAt, now)} ago`,
    deploymentId: lastGood.id,
  };
  const base = {
    key: `failure:${service.deployment?.id}:${failures.length}`,
    severity: "critical" as const,
    project,
    service,
    impact: {
      text:
        dependents.length === 0
          ? `Nothing else in ${service.environment.name} depends on it.`
          : `${listOf(dependents)} ${dependents.length === 1 ? "depends" : "depend"} on it.`,
      dependents,
    },
    secondary: logs,
    at: deployedAt,
  };

  // The same change keeps failing: retrying won't help, the last good deploy will.
  if (failures.length >= 2 && new Set(failures.map((d) => d.commitMessage)).size === 1) {
    return {
      ...base,
      rule: "repeated-failure",
      headline: `${service.name} failed ${failures.length} deploys in a row on ${change}`,
      evidence: lastGood
        ? `Last good deploy: ${lastGood.commitMessage ? `“${lastGood.commitMessage}”` : "the one before"}${lastGood.creator ? ` by ${lastGood.creator}` : ""}, ${timeAgo(lastGood.createdAt, now)} ago.`
        : "There's no earlier deploy to go back to.",
      primary: rollback ?? logs,
      secondary: rollback ? logs : undefined,
    };
  }

  // Crashed long after its deploy: not a bad change, so restarting is the first thing to try.
  if (
    service.state.label === "Crashed" &&
    service.deployment &&
    now - Date.parse(deployedAt) > RECENT_DEPLOY
  ) {
    return {
      ...base,
      rule: "crashed",
      headline: `${service.name} crashed`,
      evidence: `It had been running since a deploy ${timeAgo(deployedAt, now)} ago, so this isn't a new change.`,
      primary: { kind: "restart", label: "Restart", deploymentId: service.deployment.id },
    };
  }

  if (service.state.label === "Crashed") {
    // If the same commit runs fine in another environment, the difference is configuration.
    const elsewhere =
      latest?.commitMessage &&
      project.deployments.find(
        (d) =>
          d.serviceId === service.id &&
          d.environmentId !== service.environment.id &&
          d.status === "SUCCESS" &&
          d.commitMessage === latest.commitMessage,
      );
    const elsewhereName =
      elsewhere && project.environments.find((e) => e.id === elsewhere.environmentId)?.name;
    return {
      ...base,
      rule: "crash-after-deploy",
      headline: `${service.name} crashed right after deploying ${change}`,
      evidence:
        elsewhere && elsewhereName
          ? `The same change runs fine on ${elsewhereName}, so check how their variables differ.`
          : `Deployed${latest?.creator ? ` by ${latest.creator}` : ""} ${timeAgo(deployedAt, now)} ago.`,
      primary:
        rollback ??
        (service.deployment
          ? { kind: "restart", label: "Restart", deploymentId: service.deployment.id }
          : logs),
    };
  }

  return {
    ...base,
    rule: "failed-deploy",
    headline: `${service.name} failed to deploy ${change}`,
    evidence: `Deployed${latest?.creator ? ` by ${latest.creator}` : ""} ${timeAgo(deployedAt, now)} ago. The logs say why.`,
    primary: logs,
    secondary: {
      kind: "deploy",
      label: "Redeploy",
      serviceId: service.id,
      environmentId: service.environment.id,
    },
  };
}

function stuckDeploy(project: ProjectOverview, service: ServiceWithState, now: number): Insight[] {
  const deployment = service.deployment;
  if (!deployment || service.state.label !== "Deploying") return [];
  const elapsed = now - Date.parse(deployment.createdAt);
  if (elapsed < STUCK_AFTER) return [];
  return [
    {
      key: `stuck:${deployment.id}`,
      rule: "stuck-deploy",
      severity: "warning",
      project,
      service,
      headline: `${service.name} has been deploying for ${Math.round(elapsed / MINUTE)} min`,
      evidence: "Deploys usually finish in a few minutes, so it may be stuck.",
      primary: { kind: "cancel", label: "Cancel deploy", deploymentId: deployment.id },
      secondary: {
        kind: "railway",
        label: "Build logs",
        href: railwayUrl(project, service, deployment.id),
      },
      at: deployment.createdAt,
    },
  ];
}

/** Services that were added and never deployed, or switched off long ago. */
function housekeeping(project: ProjectOverview, service: ServiceWithState, now: number): Insight[] {
  const deploy = {
    kind: "deploy" as const,
    serviceId: service.id,
    environmentId: service.environment.id,
  };
  const remove: InsightAction = {
    kind: "remove-service",
    label: "Remove",
    serviceId: service.id,
    serviceName: service.name,
    environmentId: service.environment.id,
    environmentName: service.environment.name,
  };
  if (!service.hasEverDeployed) {
    return [
      {
        key: `never-deployed:${service.environment.id}:${service.id}`,
        rule: "never-deployed",
        severity: "info",
        project,
        service,
        headline: `${service.name} was added but never deployed`,
        evidence: service.source ? `Source: ${service.source}` : "It has no source yet.",
        primary: { ...deploy, label: "Deploy" },
        secondary: remove,
        at: new Date(0).toISOString(),
      },
    ];
  }
  // A stopped service has no latest deployment once Railway removed them all, so the history says
  // when it last ran.
  const last = service.deployment ?? historyOf(project, service)[0];
  if (service.state.kind === "stopped" && last && now - Date.parse(last.createdAt) > 7 * DAY) {
    return [
      {
        key: `long-stopped:${last.id}`,
        rule: "long-stopped",
        severity: "info",
        project,
        service,
        headline: `${service.name} has been off for ${timeAgo(last.createdAt, now)}`,
        evidence: "Its settings and variables are still there, should you need it again.",
        primary: { ...deploy, label: "Start" },
        secondary: remove,
        at: last.createdAt,
      },
    ];
  }
  return [];
}

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** The last 3 hours of CPU against the day's median. */
function cpuSpike(project: ProjectOverview, usage: ProjectUsage): Insight[] {
  const baseline = median(usage.cpu);
  const recent = usage.cpu.slice(-(3 * HOUR) / (usage.sampleSeconds * 1000));
  if (baseline < 0.05 || recent.length === 0) return [];
  const recentAverage = recent.reduce((a, b) => a + b, 0) / recent.length;
  const ratio = recentAverage / baseline;
  if (ratio < SPIKE_RATIO) return [];
  // Same day, same spike: dismissing it holds until tomorrow.
  const day = new Date().toISOString().slice(0, 10);
  return [
    {
      key: `cpu:${project.id}:${day}`,
      rule: "cpu-spike",
      severity: "warning",
      project,
      headline: `${project.name} is using ${ratio.toFixed(1)}× its usual CPU`,
      evidence: `${recentAverage.toFixed(2)} vCPU over the last 3 hours, against a typical ${baseline.toFixed(2)} today.`,
      primary: { kind: "open-project", label: "Open project", projectId: project.id },
      at: new Date(Date.now() - 3 * HOUR).toISOString(),
    },
  ];
}

/** Environments other than the primary where nothing has run for a day: previews nobody closed. */
function idleEnvironments(project: ProjectOverview, now: number): Insight[] {
  const primary = primaryEnvironment(project);
  return project.environments
    .filter((environment) => environment.id !== primary?.id && environment.services.length > 0)
    .flatMap((environment): Insight[] => {
      const services = servicesOf(project, environment);
      if (!services.every((s) => s.state.kind === "sleeping" || s.state.kind === "stopped")) {
        return [];
      }
      const lastDeploy = Math.max(
        ...services.map((s) => (s.deployment ? Date.parse(s.deployment.createdAt) : 0)),
      );
      if (now - lastDeploy < DAY) return [];
      const lastDeployAt = new Date(lastDeploy).toISOString();
      return [
        {
          key: `idle:${environment.id}:${lastDeploy}`,
          rule: "idle-environment",
          severity: "info",
          project,
          headline: `${environment.name} has been idle for ${timeAgo(lastDeployAt, now)}`,
          evidence: `${services.length} ${services.length === 1 ? "service" : "services"}, all asleep or off.${environment.isEphemeral ? " It's a PR environment; closing the PR removes it." : ""}`,
          primary: {
            kind: "open-project",
            label: "Open environment",
            projectId: project.id,
            environmentId: environment.id,
          },
          at: lastDeployAt,
        },
      ];
    });
}
