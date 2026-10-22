import { hashString } from "./random";
import type { MockStore, ServiceInstance } from "./store";

/**
 * CPU and memory samples, generated from each instance's `usage` profile: a daily curve with some
 * noise, the same for the same instant every time it's asked for.
 */

const HOUR = 60 * 60_000;
/** The last few hours a `spike` covers, matching the overview's CPU spike insight. */
const SPIKE_WINDOW = 3 * HOUR;
const MINUTES_PER_MONTH = 30 * 24 * 60;
/** What Railway's Hobby plan allows per service. */
const LIMITS = { CPU_LIMIT: 8, MEMORY_LIMIT_GB: 8 };

export type Measurement = "CPU_USAGE" | "MEMORY_USAGE_GB" | "CPU_LIMIT" | "MEMORY_LIMIT_GB";

/** When the instance had a container up: since it first came up, until now or until it crashed. */
function upWindow(store: MockStore, instance: ServiceInstance) {
  const { serviceId, environmentId } = instance;
  const history = store.deployments({ serviceId, environmentId });
  const first = history.findLast((d) => d.succeeded);
  if (!first) return null;
  const running = store.runningDeployment(serviceId, environmentId);
  if (running) {
    return { from: first.createdAt, to: Date.now(), asleep: running.status === "SLEEPING" };
  }
  const latest = store.latestDeployment(serviceId, environmentId);
  if (latest?.status === "CRASHED") {
    return { from: first.createdAt, to: latest.statusUpdatedAt, asleep: false };
  }
  return null;
}

function noise(key: string) {
  return hashString(key) / 4294967296 - 0.5;
}

function sample(instance: ServiceInstance, measurement: Measurement, at: number, asleep: boolean) {
  if (measurement === "CPU_LIMIT" || measurement === "MEMORY_LIMIT_GB") return LIMITS[measurement];
  const { usage, serviceId, numReplicas } = instance;
  const phase = (hashString(serviceId) % 24) / 24;
  const daily = Math.sin(2 * Math.PI * (at / (24 * HOUR) + phase));
  const jitter = noise(`${serviceId}:${measurement}:${at}`);
  if (measurement === "MEMORY_USAGE_GB") {
    return usage.memoryGb * numReplicas * (asleep ? 0.1 : 1 + 0.05 * daily + 0.06 * jitter);
  }
  const spike = usage.spike && Date.now() - at < SPIKE_WINDOW ? usage.spike : 1;
  return usage.cpu * numReplicas * spike * (asleep ? 0.02 : 1 + 0.3 * daily + 0.3 * jitter);
}

/** Samples every `sampleSeconds` between `from` and `to` while the instance was up, oldest first. */
export function series(
  store: MockStore,
  instance: ServiceInstance,
  measurement: Measurement,
  range: { from: number; to: number; sampleSeconds: number },
) {
  const window = upWindow(store, instance);
  if (!window) return [];
  const step = range.sampleSeconds * 1000;
  const from = Math.max(range.from, window.from);
  const to = Math.min(range.to, window.to);
  const values: { ts: number; value: number }[] = [];
  for (let at = Math.ceil(from / step) * step; at <= to; at += step) {
    values.push({
      ts: at / 1000,
      value: round(sample(instance, measurement, at, window.asleep)),
    });
  }
  return values;
}

/** Projected usage for the month in `estimatedUsage`'s units: vCPU-minutes, GB-minutes, GB. */
export function estimate(store: MockStore, projectId: string, measurement: string) {
  let total = 0;
  for (const instance of store.instancesOfProject(projectId)) {
    const window = upWindow(store, instance);
    if (!window || window.to < Date.now()) continue;
    const { usage, numReplicas } = instance;
    const awake = window.asleep ? 0.05 : 1;
    if (measurement === "CPU_USAGE") total += usage.cpu * numReplicas * awake * MINUTES_PER_MONTH;
    if (measurement === "MEMORY_USAGE_GB") {
      total += usage.memoryGb * numReplicas * awake * MINUTES_PER_MONTH;
    }
    if (measurement === "NETWORK_TX_GB") total += (usage.egressGbPerMonth ?? 0) * awake;
    if (measurement === "DISK_USAGE_GB") total += (usage.diskGb ?? 0) * MINUTES_PER_MONTH;
  }
  return round(total);
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;
