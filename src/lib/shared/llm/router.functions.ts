/**
 * Test server fn for the LLM router. Used by S0 acceptance and as a reference
 * for how S4 prompt-generators should call the router.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { llmComplete, type LlmTask } from "./router.server";

const pingInput = z.object({
  prompt: z.string().min(1).max(2000).default("Reply with the single word: pong"),
  task: z.enum(["default", "cheap", "reasoning"]).default("cheap"),
});

export const llmPing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pingInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const result = await llmComplete({
      task: data.task as LlmTask,
      prompt: data.prompt,
      maxTokens: 64,
    });
    return result;
  });
