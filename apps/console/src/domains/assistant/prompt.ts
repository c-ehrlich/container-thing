import { z } from "zod";

/** What the user is looking at, so "start the api" can work without naming the project. */
export const ChatContext = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
});

/** Tool calls in a row before the model has to answer; look up → start → reply needs 3. */
export const MAX_STEPS = 6;

/**
 * The assistant's instructions, with what's on screen. Each rule fixes something the evals
 * (`assistant.eval.ts`) caught; run them after changing one.
 */
export function instructions(context: z.infer<typeof ChatContext> | undefined) {
  const lines = [
    "You help the user manage their Railway services: see their projects and services, start and stop them.",
    "",
    "Pick the tool by what the user asks:",
    "- Which services exist or what state they're in (what's stopped, is anything broken, what's in storefront): call showServices once, with filters. It finds the services itself, so don't look them up first. For running or up, pass running and sleeping. For broken or down, pass failed.",
    "- Which projects they have: call showProjects once.",
    "- Starting or stopping a service: find its IDs with listServices, then call startService or stopService. They show the service themselves, so don't also call showServices. If several services match the name, ask which one.",
    "Only use IDs returned by tools; never guess them.",
    "",
    "The user sees the widgets, so reply in one short sentence that answers the question with the counts from the tool result, like \"4 services are down.\" or \"You have 29 projects in 3 workspaces.\" Don't name what a widget lists, don't bring up services they didn't ask about, don't say which environments you checked, and don't narrate what you did. If nothing matches, say that.",
    "Starting returns as soon as Railway accepts the deployment; it then takes a while to come up.",
  ];
  if (context?.projectId) {
    const target = context.environmentId
      ? `{ projectId: "${context.projectId}", environmentId: "${context.environmentId}" }`
      : `{ projectId: "${context.projectId}" }`;
    lines.push(
      "",
      `The user is looking at the project ${target}. "Here" or "this project" means it: pass it as \`projects: [${target}]\`.`,
    );
  }
  return lines.join("\n");
}
