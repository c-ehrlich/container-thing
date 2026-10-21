import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "./graphql/graphql";
import { projectQuery } from "./project";
import type { RailwayClient } from "./railway-api";
import { requireRailway } from "./require-railway";

/** One service in one environment: its settings, its deploys and its last day of CPU and memory. */
const ServiceQuery = graphql(`
  query Service($serviceId: String!, $environmentId: String!, $since: DateTime!) {
    serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
      serviceName
      source {
        image
        repo
      }
      region
      numReplicas
      sleepApplication
      cronSchedule
      nextCronRunAt
      domains {
        serviceDomains {
          domain
        }
        customDomains {
          domain
        }
      }
    }
    deployments(first: 20, input: { serviceId: $serviceId, environmentId: $environmentId }) {
      edges {
        node {
          id
          status
          createdAt
          statusUpdatedAt
          canRollback
          meta
          creator {
            name
          }
        }
      }
    }
    metrics(
      serviceId: $serviceId
      environmentId: $environmentId
      startDate: $since
      sampleRateSeconds: 900
      measurements: [CPU_USAGE, MEMORY_USAGE_GB, CPU_LIMIT, MEMORY_LIMIT_GB]
    ) {
      measurement
      values {
        ts
        value
      }
    }
  }
`);

const DeploymentMeta = z.object({
  commitMessage: z.string().optional().catch(undefined),
  image: z.string().optional().catch(undefined),
});

export async function fetchService(
  railway: RailwayClient,
  input: { serviceId: string; environmentId: string },
) {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { serviceInstance, deployments, metrics } = await railway(ServiceQuery, {
    ...input,
    since,
  });
  const series = (measurement: string) =>
    (metrics.find((m) => m.measurement === measurement)?.values ?? [])
      .toSorted((a, b) => a.ts - b.ts)
      .map((v) => ({ at: v.ts * 1000, value: v.value }));

  return {
    id: input.serviceId,
    name: serviceInstance.serviceName,
    source: serviceInstance.source?.image ?? serviceInstance.source?.repo ?? null,
    region: serviceInstance.region,
    replicas: serviceInstance.numReplicas,
    sleepApplication: serviceInstance.sleepApplication,
    cronSchedule: serviceInstance.cronSchedule,
    nextCronRunAt: serviceInstance.nextCronRunAt,
    domains: [
      ...serviceInstance.domains.customDomains.map((d) => d.domain),
      ...serviceInstance.domains.serviceDomains.map((d) => d.domain),
    ],
    /** Newest first. */
    deployments: deployments.edges.map(({ node: deployment }) => {
      const meta = DeploymentMeta.safeParse(deployment.meta ?? {});
      return {
        id: deployment.id,
        status: deployment.status,
        createdAt: deployment.createdAt,
        statusUpdatedAt: deployment.statusUpdatedAt,
        canRollback: deployment.canRollback,
        commitMessage: meta.success ? meta.data.commitMessage : undefined,
        image: meta.success ? meta.data.image : undefined,
        creator: deployment.creator?.name ?? null,
      };
    }),
    /** Every 15 minutes over the last day, oldest first. Limits are what the plan allows. */
    metrics: {
      cpu: series("CPU_USAGE"),
      memoryGb: series("MEMORY_USAGE_GB"),
      cpuLimit: series("CPU_LIMIT").at(-1)?.value ?? null,
      memoryLimitGb: series("MEMORY_LIMIT_GB").at(-1)?.value ?? null,
    },
  };
}

export type ServiceDetail = Awaited<ReturnType<typeof fetchService>>;
export type ServiceDeployment = ServiceDetail["deployments"][number];

const DeploymentLogsQuery = graphql(`
  query DeploymentLogs($deploymentId: String!) {
    deploymentLogs(deploymentId: $deploymentId, limit: 500) {
      timestamp
      severity
      message
    }
  }
`);

const BuildLogsQuery = graphql(`
  query BuildLogs($deploymentId: String!) {
    buildLogs(deploymentId: $deploymentId, limit: 500) {
      timestamp
      severity
      message
    }
  }
`);

/**
 * New runtime log lines of one deployment, pushed as they're written. Railway may resend recent lines
 * when subscribing, so callers dedupe.
 */
export const DeploymentLogsSubscription = graphql(`
  subscription DeploymentLogsStream($deploymentId: String!) {
    deploymentLogs(deploymentId: $deploymentId, limit: 100) {
      timestamp
      severity
      message
    }
  }
`);

export type LogKind = "deploy" | "build";

const ServiceInput = z.object({
  projectId: z.string(),
  serviceId: z.string(),
  environmentId: z.string(),
});

const getServiceFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(ServiceInput)
  .handler(({ data, context }) => fetchService(context.railway, data));

const getLogsFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ deploymentId: z.string(), kind: z.enum(["deploy", "build"]) }))
  .handler(async ({ data, context }) => {
    if (data.kind === "build") {
      const { buildLogs } = await context.railway(BuildLogsQuery, data);
      return buildLogs;
    }
    const { deploymentLogs } = await context.railway(DeploymentLogsQuery, data);
    return deploymentLogs;
  });

export type LogLine = Awaited<ReturnType<typeof getLogsFn>>[number];

/**
 * Keyed under the project, so Railway's live pushes for the project and the chat's refreshes reach
 * the service page too.
 */
export const serviceQuery = (input: z.infer<typeof ServiceInput>) =>
  queryOptions({
    queryKey: [
      ...projectQuery(input.projectId).queryKey,
      "service",
      input.environmentId,
      input.serviceId,
    ],
    queryFn: () => getServiceFn({ data: input }),
    staleTime: 30_000,
  });

/**
 * The newest lines of one deployment's build or runtime logs. Not under the project's key: a
 * deploy elsewhere in the project doesn't change them, and the page streams new lines itself.
 */
export const logsQuery = (deploymentId: string, kind: LogKind) =>
  queryOptions({
    queryKey: ["logs", deploymentId, kind],
    queryFn: () => getLogsFn({ data: { deploymentId, kind } }),
    staleTime: 60_000,
  });
