import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import type { RailwayClient } from "../../server/railway/railway-api";
import { requireRailway } from "../../server/railway/require-railway";
import { deploymentState } from "./deployment-state";
import { referencedServices } from "./references";
import { deploymentMeta, domainsOf, sourceOf } from "./service-fields";

/**
 * Everything the console shows about one project, in one request: each environment's services and
 * their latest deployment, the links between services, and the recent deploy history the insights are
 * built from.
 */
const ProjectQuery = graphql(`
  query Project($id: String!) {
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
                    meta
                    creator {
                      name
                    }
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

/** A project, flattened from Railway's connection types. */
export async function fetchProject(railway: RailwayClient, projectId: string) {
  const { project, deployments } = await railway(ProjectQuery, { id: projectId });

  const environments = project.environments.edges.map(({ node: environment }) => {
    const services = environment.serviceInstances.edges.map(({ node: instance }) => {
      const latest = instance.latestDeployment;
      return {
        id: instance.serviceId,
        name: instance.serviceName,
        source: sourceOf(instance.source),
        domains: domainsOf(instance.domains),
        // Null once every deployment is removed (a stopped service) as well as before the first one.
        deployment: latest && {
          id: latest.id,
          status: latest.status,
          createdAt: latest.createdAt,
          statusUpdatedAt: latest.statusUpdatedAt,
          commitMessage: deploymentMeta(latest.meta).commitMessage,
          creator: latest.creator?.name ?? null,
        },
        hasEverDeployed: instance.hasEverDeployed,
      };
    });

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
    deployments: deployments.edges.map(({ node: deployment }) => ({
      id: deployment.id,
      status: deployment.status,
      createdAt: deployment.createdAt,
      serviceId: deployment.serviceId,
      environmentId: deployment.environmentId,
      canRollback: deployment.canRollback,
      commitMessage: deploymentMeta(deployment.meta).commitMessage,
      creator: deployment.creator?.name ?? null,
    })),
  };
}

export type Project = Awaited<ReturnType<typeof fetchProject>>;
export type Environment = Project["environments"][number];
export type Service = Environment["services"][number];
/** A service's latest deployment, which says what state it's in. */
export type LatestDeployment = NonNullable<Service["deployment"]>;
/** One of the project's recent deploys, which the insights are built from. */
export type ProjectDeployment = Project["deployments"][number];

const getProjectFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ projectId: z.string() }))
  .handler(({ data, context }) => fetchProject(context.railway, data.projectId));

/**
 * Every query about one project is keyed under this: the project itself, a service's page, and so on. So
 * invalidating it refreshes whatever about the project is on screen, after an action or a live push.
 */
export const projectScope = (projectId: string) => ["project", projectId] as const;

/**
 * The one cache entry for a project's environments, services and deployments: every page and the chat
 * widgets read it, so they always agree. Keyed under `projectScope`, so anything that refreshes a
 * project (an action, the chat after a tool call, Railway's live pushes) refreshes it. Railway allows as few as 1000 requests an hour
 * (Hobby) and the overview asks once per project, so beyond that it only refetches when you come back
 * to the tab, and every few seconds while a deploy is in flight.
 */
export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...projectScope(projectId), "project"],
    queryFn: () => getProjectFn({ data: { projectId } }),
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.environments.some((e) =>
        e.services.some((s) => deploymentState(s.deployment).kind === "pending"),
      )
        ? 10_000
        : false,
  });
