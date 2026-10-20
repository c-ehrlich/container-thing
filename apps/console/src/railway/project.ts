import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "./graphql/graphql";
import type { RailwayClient } from "./railway-api";
import { requireRailway } from "./require-railway";

const ProjectQuery = graphql(`
  query Project($id: String!) {
    project(id: $id) {
      id
      name
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

/** A project with its environments and their services, flattened from Railway's connection types. */
export async function fetchProject(railway: RailwayClient, projectId: string) {
  const { project } = await railway(ProjectQuery, { id: projectId });
  return {
    id: project.id,
    name: project.name,
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

export type Project = Awaited<ReturnType<typeof fetchProject>>;
export type Environment = Project["environments"][number];
export type Service = Environment["services"][number];
export type Deployment = NonNullable<Service["deployment"]>;

/** The requested environment, else `production`, else the first one. */
export function pickEnvironment(project: Project, environmentId?: string): Environment | undefined {
  return (
    project.environments.find((e) => e.id === environmentId) ??
    project.environments.find((e) => e.name === "production") ??
    project.environments[0]
  );
}

const DeployMutation = graphql(`
  mutation Deploy($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
  }
`);

/** Starts a new deployment of the service's latest source and returns its ID. */
export async function deployService(
  railway: RailwayClient,
  input: { serviceId: string; environmentId: string },
): Promise<string> {
  const { serviceInstanceDeployV2 } = await railway(DeployMutation, input);
  return serviceInstanceDeployV2;
}

const RemoveMutation = graphql(`
  mutation Remove($id: String!) {
    deploymentRemove(id: $id)
  }
`);

/** Stops a deployment and removes its container. */
export async function removeDeployment(railway: RailwayClient, deploymentId: string) {
  await railway(RemoveMutation, { id: deploymentId });
}

/** Stops the service's latest deployment, including one that is sleeping. */
export async function stopService(
  railway: RailwayClient,
  target: { projectId: string; environmentId: string; serviceId: string },
) {
  const project = await fetchProject(railway, target.projectId);
  const environment = project.environments.find((e) => e.id === target.environmentId);
  const service = environment?.services.find((s) => s.id === target.serviceId);
  if (!service) throw new Error("Service not found in this environment");

  const { deployment } = service;
  if (!deployment || deployment.status === "REMOVED" || deployment.status === "SKIPPED") {
    return { ...target, alreadyStopped: true };
  }

  await removeDeployment(railway, deployment.id);
  return { ...target, alreadyStopped: false };
}

const CreateServiceMutation = graphql(`
  mutation CreateService($input: ServiceCreateInput!) {
    serviceCreate(input: $input) {
      id
    }
  }
`);

const NewService = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  image: z.string().min(1),
  variables: z.record(z.string(), z.string()),
});

/**
 * Creates a service from a Docker image. Railway deploys it right away; `${{ secret() }}` and
 * reference variables are resolved then, as in templates.
 */
export async function createService(railway: RailwayClient, input: z.infer<typeof NewService>) {
  const { serviceCreate } = await railway(CreateServiceMutation, {
    input: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      name: input.name,
      source: { image: input.image },
      variables: input.variables,
    },
  });
  return serviceCreate.id;
}

const getProjectFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ projectId: z.string() }))
  .handler(({ data, context }) => fetchProject(context.railway, data.projectId));

export const deployServiceFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ serviceId: z.string(), environmentId: z.string() }))
  .handler(async ({ data, context }) => {
    await deployService(context.railway, data);
  });

export const createServiceFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(NewService)
  .handler(({ data, context }) => createService(context.railway, data));

export const removeDeploymentFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ deploymentId: z.string() }))
  .handler(async ({ data, context }) => {
    await removeDeployment(context.railway, data.deploymentId);
  });

/**
 * The one cache entry for a project's services and deployments. The project page and the chat widgets
 * both read it, and `useWatchEnvironment` keeps it live, so they always show the same state.
 */
export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => getProjectFn({ data: { projectId } }),
  });
