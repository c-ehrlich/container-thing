import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { graphql } from "../../lib/graphql/graphql";
import type { RailwayClient } from "../../server/railway/railway-api";
import { requireRailway } from "../../server/railway/require-railway";
import { fetchProject } from "../project/project";

/**
 * Every change the console makes to Railway. Buttons, insights and the chat's tools all end up here,
 * so what a change does, what it's called while it runs and whether it asks first are decided once.
 */

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

const RemoveMutation = graphql(`
  mutation Remove($id: String!) {
    deploymentRemove(id: $id)
  }
`);

const DeployMutation = graphql(`
  mutation Deploy($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
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

/** A change to one service or deployment, as a button or an insight offers it. */
export const RailwayAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["restart", "rollback", "cancel", "remove"]),
    deploymentId: z.string(),
  }),
  /** Deploys the service's latest source: starts it when it's off, redeploys it otherwise. */
  z.object({ kind: z.literal("deploy"), serviceId: z.string(), environmentId: z.string() }),
  /**
   * Deletes a service from one environment, with its variables and settings there. Other environments
   * keep theirs; Railway deletes the service itself once no environment has it. The names are for
   * asking first.
   */
  z.object({
    kind: z.literal("remove-service"),
    serviceId: z.string(),
    serviceName: z.string(),
    environmentId: z.string(),
    environmentName: z.string(),
  }),
]);
export type RailwayAction = z.infer<typeof RailwayAction>;

const PENDING: Record<RailwayAction["kind"], string> = {
  restart: "Restarting…",
  rollback: "Rolling back…",
  cancel: "Cancelling…",
  remove: "Stopping…",
  deploy: "Deploying…",
  "remove-service": "Removing…",
};

/** What a button says while the action runs, and what to ask first if it can't be undone. */
export function describeAction(action: RailwayAction): {
  pending: string;
  confirm?: { title: string; description: string; action: string };
} {
  if (action.kind === "remove-service") {
    return {
      pending: PENDING[action.kind],
      confirm: {
        title: `Remove ${action.serviceName} from ${action.environmentName}?`,
        description: `Its settings and variables in ${action.environmentName} are deleted. Other environments keep theirs. This can't be undone.`,
        action: "Remove",
      },
    };
  }
  return { pending: PENDING[action.kind] };
}

export async function runAction(railway: RailwayClient, action: RailwayAction): Promise<void> {
  switch (action.kind) {
    case "deploy":
      await deployService(railway, action);
      return;
    case "remove-service":
      await railway(RemoveServiceMutation, {
        id: action.serviceId,
        environmentId: action.environmentId,
      });
      return;
    default:
      await railway<unknown, { id: string }>(DEPLOYMENT_MUTATIONS[action.kind], {
        id: action.deploymentId,
      });
  }
}

/**
 * Runs an action as the signed-in user. Afterwards the project should be refetched (see
 * `useRailwayAction`); the refetch sees a new deploy as in flight, which keeps it live until it lands.
 */
export const runActionFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(RailwayAction)
  .handler(({ data, context }) => runAction(context.railway, data));

/** Starts a new deployment of the service's latest source and returns its ID. */
export async function deployService(
  railway: RailwayClient,
  input: { serviceId: string; environmentId: string },
): Promise<string> {
  const { serviceInstanceDeployV2 } = await railway(DeployMutation, {
    serviceId: input.serviceId,
    environmentId: input.environmentId,
  });
  return serviceInstanceDeployV2;
}

/**
 * Stops the service's latest deployment, including one that is sleeping. For the chat, which knows
 * services but not their deployments.
 */
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

  await runAction(railway, { kind: "remove", deploymentId: deployment.id });
  return { ...target, alreadyStopped: false };
}

const NewService = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  name: z.string().min(1),
  image: z.string().min(1),
  variables: z.record(z.string(), z.string()),
});

/**
 * Creates a service from a Docker image and returns its ID. Railway deploys it right away;
 * `${{ secret() }}` and reference variables are resolved then, as in templates.
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

export const createServiceFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(NewService)
  .handler(({ data, context }) => createService(context.railway, data));
