import { describe, expect, it } from "vitest";

import type { OverviewDeployment, ProjectOverview } from "../railway/overview";
import { referencedServices } from "../railway/references";
import { servicesOf } from "./health";
import { dependentsOf, insightsFor } from "./insights";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

type Status = OverviewDeployment["status"];

/** A one-environment project: `web → api → postgres`, with the given deploy history per service. */
function project(history: Record<string, [Status, number, string?][]>): ProjectOverview {
  const names = ["web", "api", "postgres"];
  const deployments: OverviewDeployment[] = names.flatMap((name) =>
    (history[name] ?? [["SUCCESS", 3 * 24 * 60]]).map(([status, ago, commitMessage], i) => ({
      id: `${name}-${i}`,
      status,
      createdAt: minutesAgo(ago),
      serviceId: name,
      environmentId: "production",
      canRollback: status !== "FAILED",
      commitMessage,
      creator: "maya",
    })),
  );
  return {
    id: "storefront",
    name: "storefront",
    primaryEnvironmentId: "production",
    environments: [
      {
        id: "production",
        name: "production",
        isEphemeral: false,
        links: [
          ["web", "api"],
          ["api", "postgres"],
        ],
        services: names.map((name) => {
          const latest = deployments.find((d) => d.serviceId === name);
          return {
            id: name,
            name,
            source: null,
            domains: [],
            deployment: latest
              ? {
                  id: latest.id,
                  status: latest.status,
                  createdAt: latest.createdAt,
                  statusUpdatedAt: latest.createdAt,
                  commitMessage: latest.commitMessage,
                  creator: latest.creator,
                }
              : null,
            hasEverDeployed: latest !== undefined,
          };
        }),
      },
    ],
    deployments,
  };
}

const only = (p: ProjectOverview) => insightsFor([{ project: p }], NOW);

/** `postgres` after Stop: Railway removed its deployments, so it reports no latest one. */
function stopped(p: ProjectOverview): ProjectOverview {
  for (const environment of p.environments) {
    for (const service of environment.services) {
      if (service.name === "postgres") service.deployment = null;
    }
  }
  return p;
}

describe("insightsFor", () => {
  it("is quiet when everything runs", () => {
    expect(only(project({}))).toEqual([]);
  });

  it("rolls back when the same change failed twice in a row", () => {
    const [insight] = only(
      project({
        api: [
          ["FAILED", 10, "Migrate invoices"],
          ["FAILED", 25, "Migrate invoices"],
          ["REMOVED", 3 * 24 * 60, "Tax rates"],
        ],
      }),
    );
    expect(insight?.rule).toBe("repeated-failure");
    expect(insight?.primary).toMatchObject({ kind: "rollback", deploymentId: "api-2" });
    expect(insight?.headline).toBe("api failed 2 deploys in a row on “Migrate invoices”");
  });

  it("restarts a service that crashed long after its deploy", () => {
    const [insight] = only(project({ postgres: [["CRASHED", 14 * 24 * 60]] }));
    expect(insight?.rule).toBe("crashed");
    expect(insight?.primary).toMatchObject({ kind: "restart", deploymentId: "postgres-0" });
    expect(insight?.impact?.dependents).toEqual(["api", "web"]);
  });

  it("blames the deploy when a service crashes right after it", () => {
    const [insight] = only(
      project({
        api: [
          ["CRASHED", 7, "Retry webhooks"],
          ["REMOVED", 3 * 24 * 60, "Log request ids"],
        ],
      }),
    );
    expect(insight?.rule).toBe("crash-after-deploy");
    expect(insight?.primary).toMatchObject({ kind: "rollback", deploymentId: "api-1" });
  });

  it("gives a failure a new key when it fails again, so a dismissal doesn't hide it", () => {
    const once = only(project({ api: [["CRASHED", 7, "Retry webhooks"]] }));
    const twice = only(
      project({
        api: [
          ["CRASHED", 2, "Retry webhooks again"],
          ["CRASHED", 7, "Retry webhooks"],
        ],
      }),
    );
    expect(once[0]?.key).not.toBe(twice[0]?.key);
  });

  it("flags a deploy that has been going for too long", () => {
    const [insight] = only(project({ web: [["BUILDING", 22]] }));
    expect(insight?.rule).toBe("stuck-deploy");
    expect(insight?.primary).toMatchObject({ kind: "cancel", deploymentId: "web-0" });
  });

  it("offers to deploy or remove a service that was never deployed", () => {
    const [insight] = only(project({ postgres: [] }));
    expect(insight?.rule).toBe("never-deployed");
    expect(insight?.primary).toMatchObject({ kind: "deploy", serviceId: "postgres" });
    expect(insight?.secondary).toMatchObject({
      kind: "remove-service",
      serviceId: "postgres",
      environmentId: "production",
    });
  });

  it("doesn't call a stopped service never deployed", () => {
    // Railway reports no latest deployment once Stop removed them all.
    const p = stopped(project({ postgres: [["REMOVED", 30]] }));
    expect(only(p)).toEqual([]);
  });

  it("offers to start or remove a service that has been off for a while", () => {
    const [insight] = only(stopped(project({ postgres: [["REMOVED", 10 * 24 * 60]] })));
    expect(insight?.rule).toBe("long-stopped");
    expect(insight?.headline).toBe("postgres has been off for 10d");
  });

  it("leaves a fresh deploy alone", () => {
    expect(only(project({ web: [["BUILDING", 2]] }))).toEqual([]);
  });
});

describe("dependentsOf", () => {
  it("follows references transitively", () => {
    const postgres = servicesOf(project({})).find((s) => s.name === "postgres");
    expect(postgres && dependentsOf(postgres)).toEqual(["api", "web"]);
  });
});

describe("referencedServices", () => {
  const services = [
    { id: "id-postgres", name: "Postgres" },
    { id: "id-api", name: "api" },
  ];

  it("matches by name, with or without ${{ }}, and by id", () => {
    expect(
      referencedServices(
        ["Postgres.DATABASE_URL", "${{ api.RAILWAY_PRIVATE_DOMAIN }}", "id-api.PORT"],
        services,
      ),
    ).toEqual(["Postgres", "api", "api"]);
  });

  it("skips shared and unknown references", () => {
    expect(referencedServices(["shared.SENTRY_DSN", "RAILWAY_ENVIRONMENT"], services)).toEqual([]);
  });
});
