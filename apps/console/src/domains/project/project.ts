import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import type { RailwayClient } from "../../server/railway/railway-api";
import { requireRailway } from "../../server/railway/require-railway";

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

const RestartMutation = graphql(`
  mutation Restart($id: String!) {
    deploymentRestart(id: $id)
  }
`);

const RollbackMutation = graphql(`
  mutation Rollback($id: String!) {
    deploymentRollback(id: $id)
  }
`);

const CancelMutation = graphql(`
  mutation Cancel($id: String!) {
    deploymentCancel(id: $id)
  }
`);

const RemoveServiceMutation = graphql(`
  mutation RemoveService($id: String!, $environmentId: String!) {
    serviceDelete(id: $id, environmentId: $environmentId)
  }
`);

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

const DEPLOYMENT_MUTATIONS = {
  /** Restarts the container as it is, without building again. */
  restart: RestartMutation,
  /** Deploys an earlier deployment's image again, replacing what's running. */
  rollback: RollbackMutation,
  /** Stops a deployment that is still building or deploying. */
  cancel: CancelMutation,
  /** Takes the deployment down; the service stays off until it's deployed again. */
  remove: RemoveMutation,
};

export type DeploymentAction = keyof typeof DEPLOYMENT_MUTATIONS;

export const deploymentActionFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(
    z.object({
      deploymentId: z.string(),
      action: z.enum(["restart", "rollback", "cancel", "remove"]),
    }),
  )
  .handler(async ({ data, context }) => {
    await context.railway<unknown, { id: string }>(DEPLOYMENT_MUTATIONS[data.action], {
      id: data.deploymentId,
    });
  });

/**
 * Deletes a service from one environment, with its variables and settings there. Other environments
 * keep theirs; Railway deletes the service itself once no environment has it.
 */
export const removeServiceFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ serviceId: z.string(), environmentId: z.string() }))
  .handler(async ({ data, context }) => {
    await context.railway(RemoveServiceMutation, {
      id: data.serviceId,
      environmentId: data.environmentId,
    });
  });
