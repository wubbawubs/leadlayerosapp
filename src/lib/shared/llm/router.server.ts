/**
 * LLMRouter — thin abstraction over Lovable AI Gateway.
 * Server-only. Pluggable backends; MVP target is Lovable Gateway via LOVABLE_API_KEY.
 *
 * Usage:
 *   const reply = await llmComplete({ task: "default", prompt: "Hello" });
 */

export type LlmTask = "default" | "cheap" | "reasoning";

const TASK_MODEL: Record<LlmTask, string> = {
  default: "google/gemini-2.5-pro",
  cheap: "google/gemini-2.5-flash",
  reasoning: "openai/gpt-5",
};

export interface LlmCompleteOptions {
  task?: LlmTask;
  prompt: string;
  system?: string;
  model?: string; // override
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmCompleteResult {
  text: string;
  model: string;
  // cost-logging placeholder; populate when gateway returns usage info
  usage?: { promptTokens?: number; completionTokens?: number };
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function llmComplete(opts: LlmCompleteOptions): Promise<LlmCompleteResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const model = opts.model ?? TASK_MODEL[opts.task ?? "default"];

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }


  // Minimal retry: 1 retry on 5xx / network error
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429) throw new Error("LLM rate limit (429)");
      if (res.status === 402) throw new Error("LLM credits exhausted (402)");
      if (!res.ok && res.status >= 500) {
        lastErr = new Error(`LLM gateway ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM gateway ${res.status}: ${text}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      return {
        text,
        model,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
        },
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
