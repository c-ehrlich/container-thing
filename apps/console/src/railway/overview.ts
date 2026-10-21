import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { deploymentState } from "./deployment-state";
import { graphql } from "./graphql/graphql";
import { liveTarget } from "./live/environment-live";
import type { RailwayClient } from "./railway-api";
import { referencedServices } from "./references";
import { requireRailway } from "./require-railway";

/**
 * Everything the projects overview shows about one project, in one request: each environment's services
 * and their latest deployment, the links between services, and the recent deploy history the insights
 * are built from.
 */
const ProjectOverviewQuery = graphql(`
  query ProjectOverview($id: String!) {
    project(id: $id) {
      id
      name
      primaryEnvironmentId
      environments {
        edges {
          node {
            id
            name
            isEphemeral
            serviceInstances {
              edges {
                node {
                  serviceId
                  serviceName
                  source {
                    image
                    repo
                  }
                  domains {
                    serviceDomains {
                      domain
                    }
                    customDomains {
                      domain
                    }
                  }
                  latestDeployment {
                    id
                    status
                    createdAt
                    statusUpdatedAt
                  }
                  hasEverDeployed
                }
              }
            }
            variables {
              edges {
                node {
                  serviceId
                  references
                }
              }
            }
          }
        }
      }
    }
    deployments(first: 50, input: { projectId: $id }) {
      edges {
        node {
          id
          status
          createdAt
          serviceId
          environmentId
          canRollback
          meta
          creator {
            name
          }
        }
      }
    }
  }
`);

/** The parts of `deployment.meta` we show. It's untyped JSON; commit fields only exist for GitHub deploys. */
const DeploymentMeta = z.object({
  commitMessage: z.string().optional().catch(undefined),
  image: z.string().optional().catch(undefined),
});

/** A project for the overview, flattened from Railway's connection types. */
export async function fetchProjectOverview(railway: RailwayClient, projectId: string) {
  const { project, deployments } = await railway(ProjectOverviewQuery, { id: projectId });

  const environments = project.environments.edges.map(({ node: environment }) => {
    const services = environment.serviceInstances.edges.map(({ node: instance }) => ({
      id: instance.serviceId,
      name: instance.serviceName,
      source: instance.source?.image ?? instance.source?.repo ?? null,
      domains: [
        ...instance.domains.customDomains.map((d) => d.domain),
        ...instance.domains.serviceDomains.map((d) => d.domain),
      ],
      // Null once every deployment is removed (a stopped service) as well as before the first one.
      deployment: instance.latestDeployment,
      hasEverDeployed: instance.hasEverDeployed,
    }));

    // `from` reads a variable that references `to`, so `from` depends on `to`.
    const links = new Map<string, [from: string, to: string]>();
    for (const { node: variable } of environment.variables.edges) {
      const from = services.find((s) => s.id === variable.serviceId)?.name;
      if (!from) continue;
      for (const to of referencedServices(variable.references, services)) {
        if (to !== from) links.set(`${from}→${to}`, [from, to]);
      }
    }

    return {
      id: environment.id,
      name: environment.name,
      isEphemeral: environment.isEphemeral,
      services,
      links: [...links.values()],
    };
  });

  return {
    id: project.id,
    name: project.name,
    primaryEnvironmentId: project.primaryEnvironmentId,
    environments,
    deployments: deployments.edges.map(({ node: deployment }) => {
      const meta = DeploymentMeta.safeParse(deployment.meta ?? {});
      return {
        id: deployment.id,
        status: deployment.status,
        createdAt: deployment.createdAt,
        serviceId: deployment.serviceId,
        environmentId: deployment.environmentId,
        canRollback: deployment.canRollback,
        commitMessage: meta.success ? meta.data.commitMessage : undefined,
        creator: deployment.creator?.name ?? null,
      };
    }),
  };
}

export type ProjectOverview = Awaited<ReturnType<typeof fetchProjectOverview>>;
export type OverviewEnvironment = ProjectOverview["environments"][number];
export type OverviewService = OverviewEnvironment["services"][number];
export type OverviewDeployment = ProjectOverview["deployments"][number];

const ProjectMetricsQuery = graphql(`
  query ProjectMetrics($id: String!, $since: DateTime!, $sampleSeconds: Int!) {
    metrics(
      projectId: $id
      startDate: $since
      sampleRateSeconds: $sampleSeconds
      measurements: [CPU_USAGE, MEMORY_USAGE_GB]
      groupBy: [SERVICE_ID, ENVIRONMENT_ID]
    ) {
      measurement
      tags {
        serviceId
        environmentId
      }
      values {
        ts
        value
      }
    }
  }
`);

const ProjectEstimateQuery = graphql(`
  query ProjectEstimate($id: String!) {
    estimatedUsage(
      projectId: $id
      measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB]
    ) {
      measurement
      estimatedValue
    }
  }
`);

/**
 * Railway's list prices per unit of `estimatedUsage`: per vCPU-minute, GB-minute of memory, GB of
 * egress and GB-minute of volume. https://railway.com/pricing
 */
const PRICE_USD: Record<string, number> = {
  CPU_USAGE: 0.000463,
  MEMORY_USAGE_GB: 0.000231,
  NETWORK_TX_GB: 0.05,
  DISK_USAGE_GB: 0.000003472,
};

/**
 * Seconds between usage samples, the same as a service's own page. Hourly samples can leave a
 * service started within the hour with none, so the project page showed no usage at all.
 */
const SAMPLE_SECONDS = 900;

/** One service's last day in one environment, oldest first. Empty while it's off. */
export type ServiceUsage = { cpu: number[]; memoryGb: number[] };

/** Key for `ProjectUsage.services`. */
export const serviceUsageKey = (environmentId: string, serviceId: string) =>
  `${environmentId}/${serviceId}`;

/**
 * CPU and memory per service over the last day, and this month's projected cost. The cost is usage
 * times list prices, so it doesn't know about plan credits or discounts. Railway only estimates usage
 * per project here: asking per workspace isn't authorized for OAuth apps.
 */
export async function fetchProjectUsage(railway: RailwayClient, projectId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  // Asked separately, so one Railway refuses doesn't take the other down with it.
  const [metricsResult, estimateResult] = await Promise.allSettled([
    railway(ProjectMetricsQuery, { id: projectId, since, sampleSeconds: SAMPLE_SECONDS }),
    railway(ProjectEstimateQuery, { id: projectId }),
  ]);
  const metrics = metricsResult.status === "fulfilled" ? metricsResult.value.metrics : [];
  const estimatedUsage =
    estimateResult.status === "fulfilled" ? estimateResult.value.estimatedUsage : undefined;

  const services: Record<string, ServiceUsage> = {};
  const cpuByHour = new Map<number, number>();
  for (const series of metrics) {
    const { serviceId, environmentId } = series.tags;
    if (!serviceId || !environmentId) continue;
    const usage = (services[serviceUsageKey(environmentId, serviceId)] ??= {
      cpu: [],
      memoryGb: [],
    });
    const values = series.values.toSorted((a, b) => a.ts - b.ts);
    if (series.measurement === "CPU_USAGE") {
      usage.cpu = values.map((v) => v.value);
      for (const v of values) cpuByHour.set(v.ts, (cpuByHour.get(v.ts) ?? 0) + v.value);
    } else if (series.measurement === "MEMORY_USAGE_GB") {
      usage.memoryGb = values.map((v) => v.value);
    }
  }

  return {
    sampleSeconds: SAMPLE_SECONDS,
    /** vCPU across the project's services, one sample per `sampleSeconds`, oldest first. */
    cpu: [...cpuByHour].toSorted(([a], [b]) => a - b).map(([, value]) => value),
    services,
    estimatedMonthlyUsd: estimatedUsage?.reduce(
      (total, usage) => total + usage.estimatedValue * (PRICE_USD[usage.measurement] ?? 0),
      0,
    ),
  };
}

export type ProjectUsage = Awaited<ReturnType<typeof fetchProjectUsage>>;

const ProjectId = z.object({ projectId: z.string() });

const getProjectOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(ProjectId)
  .handler(({ data, context }) => fetchProjectOverview(context.railway, data.projectId));

const getProjectUsageFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(ProjectId)
  .handler(({ data, context }) => fetchProjectUsage(context.railway, data.projectId));

/**
 * Keyed under `projectQuery`'s key, so anything that refreshes a project (the chat after a tool call,
 * Railway's live pushes) refreshes its overview too. Railway allows as few as 1000 requests an hour
 * (Hobby) and the overview asks once per project, so beyond that it only refetches when you come back
 * to the tab, and every few seconds while a deploy is in flight.
 */
export const projectOverviewQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId, "overview"],
    queryFn: () => getProjectOverviewFn({ data: { projectId } }),
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.environments.some((e) =>
        e.services.some((s) => deploymentState(s.deployment).kind === "pending"),
      )
        ? 10_000
        : false,
  });

/** Usage moves slowly and the request is slow (~2 s), so it's refreshed at most every 10 minutes. */
export const projectUsageQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-usage", projectId],
    queryFn: () => getProjectUsageFn({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });

/**
 * What the overview keeps live per environment (see `keepEnvironmentLive`). Railway's canvas pushes
 * already cover every change, so only deploys in flight also get their own status subscription.
 */
export const overviewTarget = (projectId: string) =>
  liveTarget(
    projectOverviewQuery(projectId),
    (data: ProjectOverview, environmentId) =>
      data.environments
        .find((e) => e.id === environmentId)
        ?.services.flatMap((s) =>
          s.deployment && deploymentState(s.deployment).kind === "pending" ? [s.deployment.id] : [],
        ) ?? [],
  );
