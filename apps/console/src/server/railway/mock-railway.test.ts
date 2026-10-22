import { TIMINGS, createMockRailway } from "@repo/railway-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createService,
  deployService,
  runAction,
  stopService,
} from "../../domains/actions/actions";
import { findTemplateSuggestion } from "../../domains/add-service/templates";
import { insightsFor } from "../../domains/insights/insights";
import { fetchProjectOverview, fetchProjectUsage } from "../../domains/project/overview";
import { fetchProject } from "../../domains/project/project";
import { fetchLogs, fetchService } from "../../domains/project/service";
import { fetchViewer } from "../../domains/project/viewer";
import schema from "../../lib/graphql/railway-schema.graphql?raw";
import { createMockRailwayClient } from "./mock-railway";
import type { RailwayClient } from "./railway-api";

/**
 * The console's own queries against the mock: if a query asks for a field the mock doesn't answer,
 * or the seed stops covering an insight, these fail.
 */

// Server-only modules come along with the server functions; none of them run here.
vi.mock("../env", () => ({ env: {} }));

const realCalls: string[] = [];
const real: RailwayClient = async (document) => {
  const operation = document.definitions[0];
  realCalls.push(operation && "name" in operation ? (operation.name?.value ?? "") : "");
  throw new Error("Not available in tests");
};

let railway: RailwayClient;

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse("2026-10-21T12:00:00Z") });
  realCalls.length = 0;
  railway = createMockRailwayClient(createMockRailway({ schema }), real);
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadAll() {
  const viewer = await fetchViewer(railway);
  const projects = viewer.workspaces.flatMap((w) => w.projects);
  return Promise.all(
    projects.map(async (p) => ({
      project: await fetchProjectOverview(railway, p.id),
      usage: await fetchProjectUsage(railway, p.id),
    })),
  );
}

/** Lets the mock's deploy timers run. */
async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Collects a subscription's data. */
const collect = (into: unknown[]) => ({
  next: (result: { data?: unknown }) => into.push(result.data),
  error: (error: unknown) => {
    throw error;
  },
  complete: () => {},
});

const fullDeploy = TIMINGS.queued + TIMINGS.building + TIMINGS.deploying;

describe("the mock Railway", () => {
  it("answers every query the console makes", async () => {
    const viewer = await fetchViewer(railway);
    expect(viewer.user.name).toBe("Demo User");
    expect(viewer.workspaces.flatMap((w) => w.projects).length).toBeGreaterThan(20);

    const loaded = await loadAll();
    const { project, usage } = loaded[0] ?? {};
    expect(usage?.estimatedMonthlyUsd).toBeGreaterThan(0);
    const environment = project?.environments[0];
    const service = environment?.services[0];
    if (!project || !environment || !service) throw new Error("Seed has no services");

    await fetchProject(railway, project.id);
    const detail = await fetchService(railway, {
      serviceId: service.id,
      environmentId: environment.id,
    });
    expect(detail.metrics.cpu.length).toBeGreaterThan(0);
    const deploymentId = detail.deployments[0]?.id ?? "";
    expect(await fetchLogs(railway, { deploymentId, kind: "deploy" })).not.toHaveLength(0);
    expect(await fetchLogs(railway, { deploymentId, kind: "build" })).not.toHaveLength(0);
  });

  it("has something for every insight to show", async () => {
    const rules = new Set(insightsFor(await loadAll()).map((i) => i.rule));
    expect([...rules].toSorted()).toEqual([
      "cpu-spike",
      "crash-after-deploy",
      "crashed",
      "failed-deploy",
      "idle-environment",
      "long-stopped",
      "never-deployed",
      "repeated-failure",
      "stuck-deploy",
    ]);
  });

  it("links services that reference each other", async () => {
    const loaded = await loadAll();
    const storefront = loaded.find((l) => l.project.name === "storefront")?.project;
    const production = storefront?.environments.find((e) => e.name === "production");
    expect(production?.links).toContainEqual(["api", "postgres"]);
  });

  it("deploys a new service and takes it through Railway's statuses", async () => {
    const viewer = await fetchViewer(railway);
    const projectId = viewer.workspaces[0]?.projects[0]?.id ?? "";
    const environmentId = (await fetchProject(railway, projectId)).environments[0]?.id ?? "";
    const serviceId = await createService(railway, {
      projectId,
      environmentId,
      name: "meilisearch",
      image: "getmeili/meilisearch:v1.16",
      variables: {},
    });

    const status = async () =>
      (await fetchProject(railway, projectId)).environments
        .find((e) => e.id === environmentId)
        ?.services.find((s) => s.id === serviceId)?.deployment?.status;

    expect(await status()).toBe("QUEUED");
    await wait(TIMINGS.queued);
    expect(await status()).toBe("BUILDING");
    await wait(TIMINGS.building + TIMINGS.deploying);
    expect(await status()).toBe("SUCCESS");

    await stopService(railway, { projectId, environmentId, serviceId });
    expect(await status()).toBe("REMOVING");
    await wait(TIMINGS.removing);
    expect(await status()).toBeUndefined();

    await deployService(railway, { serviceId, environmentId });
    await wait(fullDeploy);
    expect(await status()).toBe("SUCCESS");
  });

  it("runs every RailwayAction the buttons and insights offer", async () => {
    const viewer = await fetchViewer(railway);
    const projectId = viewer.workspaces[0]?.projects[0]?.id ?? "";
    const environment = (await fetchProject(railway, projectId)).environments[0];
    const environmentId = environment?.id ?? "";
    const serviceId = await createService(railway, {
      projectId,
      environmentId,
      name: "whoami",
      image: "traefik/whoami",
      variables: {},
    });
    const deploys = async () =>
      (await fetchService(railway, { serviceId, environmentId })).deployments;
    await wait(fullDeploy);
    const [first] = await deploys();
    if (!first) throw new Error("Never deployed");

    await runAction(railway, { kind: "restart", deploymentId: first.id });
    expect((await deploys())[0]?.status).toBe("DEPLOYING");
    await wait(fullDeploy);

    await runAction(railway, { kind: "deploy", serviceId, environmentId });
    const [second] = await deploys();
    expect(second?.id).not.toBe(first.id);
    await runAction(railway, { kind: "cancel", deploymentId: second?.id ?? "" });
    expect((await deploys())[0]?.status).toBe("REMOVED");

    await runAction(railway, { kind: "rollback", deploymentId: first.id });
    await wait(fullDeploy);
    const [rolledBack] = await deploys();
    expect(rolledBack?.status).toBe("SUCCESS");

    await runAction(railway, { kind: "remove", deploymentId: rolledBack?.id ?? "" });
    expect((await deploys())[0]?.status).toBe("REMOVING");

    await runAction(railway, {
      kind: "remove-service",
      serviceId,
      serviceName: "whoami",
      environmentId,
      environmentName: environment?.name ?? "",
    });
    const services = (await fetchProject(railway, projectId)).environments.find(
      (e) => e.id === environmentId,
    )?.services;
    expect(services?.map((s) => s.id)).not.toContain(serviceId);
  });

  it("fails images tagged :broken", async () => {
    const viewer = await fetchViewer(railway);
    const projectId = viewer.workspaces[0]?.projects[0]?.id ?? "";
    const environmentId = (await fetchProject(railway, projectId)).environments[0]?.id ?? "";
    const serviceId = await createService(railway, {
      projectId,
      environmentId,
      name: "app",
      image: "nginx:broken",
      variables: {},
    });
    await wait(fullDeploy);
    const detail = await fetchService(railway, { serviceId, environmentId });
    expect(detail.deployments[0]?.status).toBe("FAILED");
  });

  it("pushes changes to subscriptions like Railway's live API", async () => {
    const mock = createMockRailway({ schema });
    railway = createMockRailwayClient(mock, real);
    const viewer = await fetchViewer(railway);
    const projectId = viewer.workspaces[0]?.projects[0]?.id ?? "";
    const environment = (await fetchProject(railway, projectId)).environments[0];
    const serviceId = environment?.services[0]?.id ?? "";
    const environmentId = environment?.id ?? "";

    const hashes: unknown[] = [];
    const statuses: unknown[] = [];
    const stopCanvas = mock.subscribe(
      {
        query: `subscription($id: String!) { canvasInvalidation(environmentId: $id) { id } }`,
        variables: { id: environmentId },
      },
      collect(hashes),
    );
    await wait(0);
    const deploymentId = await deployService(railway, { serviceId, environmentId });
    const stopDeployment = mock.subscribe(
      {
        query: `subscription($id: String!) { deployment(id: $id) { status } }`,
        variables: { id: deploymentId },
      },
      collect(statuses),
    );
    await wait(fullDeploy);
    stopCanvas();
    stopDeployment();

    expect(new Set(hashes.map((h) => JSON.stringify(h))).size).toBeGreaterThan(1);
    expect(statuses).toEqual([
      { deployment: { status: "BUILDING" } },
      { deployment: { status: "DEPLOYING" } },
      { deployment: { status: "SUCCESS" } },
    ]);
  });

  it("sends public data to the real Railway", async () => {
    await expect(findTemplateSuggestion(railway, "postgres:17")).rejects.toThrow(
      "Not available in tests",
    );
    expect(realCalls).toContain("TemplateConfig");
  });
});
