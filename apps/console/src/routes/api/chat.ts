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

import { ChatContext, MAX_STEPS, instructions } from "../../domains/assistant/prompt";
import { createChatTools } from "../../domains/assistant/tools";
import type { ChatMessage } from "../../domains/assistant/tools";
import { env } from "../../server/env";
import { getRailway } from "../../server/railway/backend";

const ChatRequest = z.object({
  messages: z.array(z.unknown()),
  context: ChatContext.optional(),
});

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
