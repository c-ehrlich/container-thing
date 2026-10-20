import { tool } from "ai";
import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import { z } from "zod";

import { deploymentState } from "../railway/deployment-state";
import { deployService, fetchProject, pickEnvironment, stopService } from "../railway/project";
import type { RailwayClient } from "../railway/railway-api";
import { fetchViewer } from "../railway/viewer";

const ServiceTarget = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  serviceId: z.string(),
});

/**
 * Tools the assistant can call, acting as the signed-in user.
 *
 * Outputs that the chat renders as widgets carry IDs, not state: the widget looks the service up in the
 * same query cache as the project page, so both always agree and keep updating after the call ends.
 * Statuses in `listServices` are only there so the model can talk about them.
 */
export function createChatTools(railway: RailwayClient) {
  return {
    listProjects: tool({
      description: "List the Railway projects the user shared with this app, grouped by workspace.",
      inputSchema: z.object({}),
      execute: async () => (await fetchViewer(railway)).workspaces,
    }),

    listServices: tool({
      description:
        "List the services in one environment of a project, with their current status. Defaults to the production environment.",
      inputSchema: z.object({
        projectId: z.string(),
        environmentId: z.string().optional(),
      }),
      execute: async ({ projectId, environmentId }) => {
        const project = await fetchProject(railway, projectId);
        const environment = pickEnvironment(project, environmentId);
        if (!environment) throw new Error("This project has no environments");
        return {
          projectId,
          environmentId: environment.id,
          environmentName: environment.name,
          environments: project.environments.map((e) => ({ id: e.id, name: e.name })),
          services: environment.services.map((s) => ({
            id: s.id,
            name: s.name,
            status: deploymentState(s.deployment).label,
          })),
        };
      },
    }),

    startService: tool({
      description:
        "Start a service by deploying its latest source. Returns once Railway accepted it.",
      inputSchema: ServiceTarget,
      execute: async (target) => {
        const deploymentId = await deployService(railway, target);
        return { ...target, deploymentId };
      },
    }),

    stopService: tool({
      description:
        "Stop a running service by removing its latest deployment. The user must confirm.",
      inputSchema: ServiceTarget,
      execute: (target) => stopService(railway, target),
    }),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;
export type ChatMessage = UIMessage<unknown, UIDataTypes, InferUITools<ChatTools>>;
