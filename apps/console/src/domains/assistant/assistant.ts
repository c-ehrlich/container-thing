import { stepCountIs } from "ai";
import type { z } from "zod";

import type { RailwayClient } from "../../server/railway/railway-api";
import { MAX_STEPS, instructions } from "./prompt";
import type { ChatContext } from "./prompt";
import { createChatTools } from "./tools";

/**
 * Everything about a chat turn except the model and the messages, so `/api/chat` and the evals
 * (`assistant.eval.ts`) run the same assistant.
 */
export function assistantSettings(
  railway: RailwayClient,
  context: z.infer<typeof ChatContext> | undefined,
) {
  return {
    instructions: instructions(context),
    tools: createChatTools(railway),
    toolApproval: { stopService: "user-approval" } as const,
    stopWhen: stepCountIs(MAX_STEPS),
  };
}
