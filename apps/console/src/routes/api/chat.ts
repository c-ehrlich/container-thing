import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { z } from "zod";

import { createChatTools } from "../../chat/tools";
import type { ChatMessage } from "../../chat/tools";
import { getRailway } from "../../railway/backend";
import { env } from "../../server/env";

const ChatRequest = z.object({
  messages: z.array(z.unknown()),
  /** What the user is looking at, so "start the api" can work without naming the project. */
  context: z
    .object({
      projectId: z.string().optional(),
      environmentId: z.string().optional(),
    })
    .optional(),
});

/** Tool calls in a row before the model has to answer; list → start → reply needs 3. */
const MAX_STEPS = 6;

function instructions(context: z.infer<typeof ChatRequest>["context"]) {
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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const railway = await getRailway();
        if (!railway) return new Response("Not signed in", { status: 401 });

        const body = ChatRequest.safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Invalid request", { status: 400 });

        const tools = createChatTools(railway);
        const messages = await validateUIMessages<ChatMessage>({
          messages: body.data.messages,
          tools,
        });

        const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
        const result = streamText({
          model: openrouter.chat(env.OPENROUTER_MODEL),
          instructions: instructions(body.data.context),
          messages: await convertToModelMessages(messages, { tools }),
          tools,
          toolApproval: { stopService: "user-approval" },
          stopWhen: stepCountIs(MAX_STEPS),
        });

        return createUIMessageStreamResponse({
          // After a stop is confirmed, the reply continues the same assistant message.
          stream: toUIMessageStream({ stream: result.stream, tools, originalMessages: messages }),
        });
      },
    },
  },
});
