import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { z } from "zod";

import { assistantSettings } from "../../domains/assistant/assistant";
import { ChatContext } from "../../domains/assistant/prompt";
import type { ChatMessage } from "../../domains/assistant/tools";
import { SIGNED_OUT_MESSAGE } from "../../lib/sign-in";
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
        if (!railway) return new Response(SIGNED_OUT_MESSAGE, { status: 401 });

        const body = ChatRequest.safeParse(await request.json().catch(() => null));
        if (!body.success) return new Response("Invalid request", { status: 400 });

        const settings = assistantSettings(railway, body.data.context);
        const { tools } = settings;
        const messages = await validateUIMessages<ChatMessage>({
          messages: body.data.messages,
          tools,
        });

        const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
        const result = streamText({
          ...settings,
          model: openrouter.chat(env.OPENROUTER_MODEL),
          messages: await convertToModelMessages(messages, { tools }),
        });

        return createUIMessageStreamResponse({
          // After a stop is confirmed, the reply continues the same assistant message.
          stream: toUIMessageStream({ stream: result.stream, tools, originalMessages: messages }),
        });
      },
    },
  },
});
