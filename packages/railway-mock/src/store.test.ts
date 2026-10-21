import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedWorld } from "./seed";
import { MockStore, TIMINGS } from "./store";

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse("2026-10-21T12:00:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

const deploy = TIMINGS.queued + TIMINGS.building + TIMINGS.deploying;

/** A seeded service by project and name, in its project's production environment. */
function find(store: MockStore, projectName: string, serviceName: string) {
  const project = store
    .workspaces()
    .flatMap((w) => store.projectsIn(w.id))
    .find((p) => p.name === projectName);
  const environment = project && store.primaryEnvironmentOf(project.id);
  const service = project && store.servicesOf(project.id).find((s) => s.name === serviceName);
  if (!environment || !service) throw new Error(`No ${projectName}/${serviceName} in the seed`);
  return { serviceId: service.id, environmentId: environment.id };
}

describe("MockStore", () => {
  it("builds the same world from the same seed", () => {
    const now = Date.now();
    expect(seedWorld({ now })).toEqual(seedWorld({ now }));
  });

  it("replaces the running deployment once a new one is up", () => {
    const store = new MockStore(seedWorld());
    const target = find(store, "billing", "api");
    const before = store.runningDeployment(target.serviceId, target.environmentId);

    store.deploy(target.serviceId, target.environmentId);
    expect(store.runningDeployment(target.serviceId, target.environmentId)).toBe(before);
    vi.advanceTimersByTime(deploy);

    expect(before?.status).toBe("REMOVED");
    expect(store.latestDeployment(target.serviceId, target.environmentId)?.status).toBe("SUCCESS");
  });

  it("rolls back to an earlier deployment as a new one", () => {
    const store = new MockStore(seedWorld());
    const target = find(store, "billing", "invoice-worker");
    const good = store.deployments(target).find((d) => d.status === "SUCCESS");
    if (!good) throw new Error("Seed has no good deploy to roll back to");

    store.rollback(good.id);
    vi.advanceTimersByTime(TIMINGS.queued + TIMINGS.deploying);

    const latest = store.latestDeployment(target.serviceId, target.environmentId);
    expect(latest?.id).not.toBe(good.id);
    expect(latest?.status).toBe("SUCCESS");
    expect(good.status).toBe("REMOVED");
  });

  it("cancels a stuck deploy, leaving the previous one up", () => {
    const store = new MockStore(seedWorld());
    const target = find(store, "docs", "web");
    const stuck = store.latestDeployment(target.serviceId, target.environmentId);
    expect(stuck?.status).toBe("BUILDING");

    store.cancel(stuck?.id ?? "");
    expect(store.latestDeployment(target.serviceId, target.environmentId)?.status).toBe("SUCCESS");
  });

  it("ignores a deploy's remaining steps once the world is replaced", () => {
    const store = new MockStore(seedWorld());
    const target = find(store, "billing", "api");
    const id = store.deploy(target.serviceId, target.environmentId);
    store.replace(seedWorld());
    vi.advanceTimersByTime(deploy);
    expect(store.hasDeployment(id)).toBe(false);
  });
});
