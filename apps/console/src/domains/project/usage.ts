import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import type { RailwayClient } from "../../server/railway/railway-api";
import { requireRailway } from "../../server/railway/require-railway";
import { oneDayAgo } from "./service-fields";

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
  const since = oneDayAgo();
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

const getProjectUsageFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ projectId: z.string() }))
  .handler(({ data, context }) => fetchProjectUsage(context.railway, data.projectId));

/** Usage moves slowly and the request is slow (~2 s), so it's refreshed at most every 10 minutes. */
export const projectUsageQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-usage", projectId],
    queryFn: () => getProjectUsageFn({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
