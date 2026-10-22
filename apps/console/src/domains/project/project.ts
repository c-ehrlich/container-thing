import { graphql } from "../../lib/graphql/graphql";
import type { RailwayClient } from "../../server/railway/railway-api";

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
            serviceInstances {
              edges {
                node {
                  serviceId
                  serviceName
                  source {
                    image
                    repo
                  }
                  latestDeployment {
                    id
                    status
                    createdAt
                    statusUpdatedAt
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

/**
 * A project with its environments and their services, flattened from Railway's connection types.
 * Lighter than `fetchProjectOverview`, for the chat's tools, which only need names and statuses. The
 * browser always reads `projectOverviewQuery`.
 */
export async function fetchProject(railway: RailwayClient, projectId: string) {
  const { project } = await railway(ProjectQuery, { id: projectId });
  return {
    id: project.id,
    name: project.name,
    primaryEnvironmentId: project.primaryEnvironmentId,
    environments: project.environments.edges.map(({ node: environment }) => ({
      id: environment.id,
      name: environment.name,
      services: environment.serviceInstances.edges.map(({ node: instance }) => ({
        id: instance.serviceId,
        name: instance.serviceName,
        source: instance.source?.image ?? instance.source?.repo ?? null,
        deployment: instance.latestDeployment,
      })),
    })),
  };
}
