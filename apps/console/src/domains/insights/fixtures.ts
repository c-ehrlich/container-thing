import type { Project, ProjectDeployment } from "../project/project";

/**
 * Test data for the insight rules: a small project with a deploy history, so each test only states
 * what's different about it.
 */

export const NOW = Date.parse("2026-10-21T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

type Status = ProjectDeployment["status"];

/** A one-environment project: `web → api → postgres`, with the given deploy history per service. */
export function project(history: Record<string, [Status, number, string?][]>): Project {
  const names = ["web", "api", "postgres"];
  const deployments: ProjectDeployment[] = names.flatMap((name) =>
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
