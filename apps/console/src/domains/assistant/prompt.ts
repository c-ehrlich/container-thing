import { z } from "zod";

/** What the user is looking at, so "start the api" can work without naming the project. */
export const ChatContext = z.object({
  projectId: z.string().optional(),
  environmentId: z.string().optional(),
});

/** Tool calls in a row before the model has to answer; list → start → reply needs 3. */
export const MAX_STEPS = 6;

/** The assistant's instructions, with what's on screen. */
export function instructions(context: z.infer<typeof ChatContext> | undefined) {
  const lines = [
    "You help the user manage their Railway services: list projects and services, start and stop them.",
    "Only use IDs returned by tools; never guess them. If you don't know which project or service the user means, look it up or ask.",
    "Start and stop calls render a live status widget in the chat, so keep your replies to a sentence or two and don't narrate progress.",
    "Starting returns as soon as Railway accepts the deployment; it then takes a while to come up.",
  ];
  if (context?.projectId) {
    lines.push(
      `The user is currently viewing project ${context.projectId}` +
        (context.environmentId ? `, environment ${context.environmentId}.` : "."),
    );
  }
  return lines.join("\n");
}
