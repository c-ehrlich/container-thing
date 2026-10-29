import { tool } from "ai";
import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import { z } from "zod";

import type { RailwayClient } from "../../server/railway/railway-api";
import { deployService, stopService } from "../actions";
import { deploymentState } from "../project/deployment-state";
import { pickEnvironment } from "../project/environments";
import { fetchProject } from "../project/project";
import { fetchViewer } from "../project/viewer";

const ServiceTarget = z.object({
  projectId: z.string(),
  environmentId: z.string(),
  serviceId: z.string(),
});

const ProjectTargets = z
  .array(z.object({ projectId: z.string(), environmentId: z.string().optional() }))
  .optional()
  .describe("Omit to check every project. Each defaults to its production environment.");

/**
 * Tools the assistant can call, acting as the signed-in user.
 *
 * Lookups (`list*`) are for the model; the chat shows them as a one-line note. What the user sees comes
 * from `show*`, which do the filtering themselves: picking 70 services out of a lookup by copying IDs is
 * where a model drops rows, and the counts in their output keep it from miscounting.
 *
 * Tools the chat renders as widgets carry IDs, not state: the widget looks the service up in the same
 * query cache as the project page, so both always agree and keep updating after the call ends.
 * Statuses in tool outputs are only there so the model can talk about them.
 */
export function createChatTools(railway: RailwayClient) {
  return {
    listProjects: tool({
      description:
        "Look up the projects the user shared with this app, with their IDs, grouped by workspace. Not shown to the user.",
      inputSchema: z.object({}),
      execute: async () => (await fetchViewer(railway)).workspaces,
    }),

    listServices: tool({
      description:
        "Look up services with their IDs and status, to find the one to start or stop. Not shown to the user.",
      inputSchema: z.object({ projects: ProjectTargets }),
      execute: ({ projects }) => loadEnvironments(railway, projects),
    }),

    showProjects: tool({
      description: "Show the user a list of projects, linking to each.",
      inputSchema: z.object({
        projectIds: z.array(z.string()).optional().describe("Omit to show every project."),
      }),
      // Project names don't change while you look at them, so they're looked up once here.
      execute: async ({ projectIds }) => {
        const { workspaces } = await fetchViewer(railway);
        const projects = workspaces.flatMap((workspace) =>
          workspace.projects
            .filter((project) => !projectIds || projectIds.includes(project.id))
            .map((project) => ({ ...project, workspaceName: workspace.name })),
        );
        return {
          count: projects.length,
          workspaces: [...new Set(projects.map((p) => p.workspaceName))].map((name) => ({
            name,
            projectCount: projects.filter((p) => p.workspaceName === name).length,
          })),
          projects,
        };
      },
    }),

    showServices: tool({
      description:
        "Find the services matching all the given filters and show them to the user as a live list. Omit a filter to not filter on it.",
      inputSchema: z.object({
        status: z
          .array(z.enum(["running", "sleeping", "pending", "failed", "stopped"]))
          .optional()
          .describe(
            "running: up. sleeping: serverless and idle, wakes on the next request. pending: deploying or stopping. failed: failed or crashed. stopped: nothing deployed, also called paused or off.",
          ),
        projects: ProjectTargets,
        search: z
          .string()
          .optional()
          .describe(
            "Part of a project's name, or of a service's name or image, like 'storefront', 'api' or 'postgres'.",
          ),
      }),
      execute: async ({ status, projects, search }) => {
        const environments = await loadEnvironments(railway, projects);
        const query = search?.toLowerCase();
        const services = environments.flatMap((environment) =>
          "error" in environment
            ? []
            : environment.services
                .filter((s) => !status || status.includes(s.kind))
                // Models don't reliably tell project names from service names (umami is both), so
                // one search covers both.
                .filter(
                  (s) =>
                    !query ||
                    environment.projectName.toLowerCase().includes(query) ||
                    s.name.toLowerCase().includes(query) ||
                    s.source?.toLowerCase().includes(query),
                )
                .map((s) => ({
                  projectId: environment.projectId,
                  projectName: environment.projectName,
                  environmentId: environment.environmentId,
                  environmentName: environment.environmentName,
                  serviceId: s.id,
                  name: s.name,
                  status: s.status,
                })),
        );
        return {
          count: services.length,
          projectsChecked: environments.length,
          errors: environments.flatMap((e) => ("error" in e ? [e] : [])),
          services,
        };
      },
    }),

    startService: tool({
      description:
        "Start a service by deploying its latest source. Returns once Railway accepted it. Shows the service to the user.",
      inputSchema: ServiceTarget,
      execute: async (target) => {
        const deploymentId = await deployService(railway, target);
        return { ...target, deploymentId };
      },
    }),

    stopService: tool({
      description:
        "Stop a running service by removing its latest deployment. The user must confirm. Shows the service to the user.",
      inputSchema: ServiceTarget,
      execute: (target) => stopService(railway, target),
    }),
  };
}

/** One environment per project, every project if none are given. A project that fails gets its error in its slot. */
async function loadEnvironments(railway: RailwayClient, projects: z.infer<typeof ProjectTargets>) {
  // Models sometimes pass `[]` to mean every project.
  const targets = projects?.length
    ? projects
    : (await fetchViewer(railway)).workspaces.flatMap((w) =>
        w.projects.map((p) => ({ projectId: p.id, environmentId: undefined })),
      );
  return Promise.all(
    targets.map(async ({ projectId, environmentId }) => {
      try {
        const project = await fetchProject(railway, projectId);
        const environment = pickEnvironment(project, environmentId);
        if (!environment) return { projectId, error: "This project has no environments" };
        return {
          projectId,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          environments: project.environments.map((e) => ({ id: e.id, name: e.name })),
          services: environment.services.map((s) => {
            const state = deploymentState(s.deployment);
            return {
              id: s.id,
              name: s.name,
              source: s.source,
              status: state.label,
              kind: state.kind,
            };
          }),
        };
      } catch (error) {
        return { projectId, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

export type ChatTools = ReturnType<typeof createChatTools>;
export type ChatMessage = UIMessage<unknown, UIDataTypes, InferUITools<ChatTools>>;
