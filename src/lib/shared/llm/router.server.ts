/**
 * LLMRouter — thin abstraction over the Anthropic Messages API.
 * Server-only. Set ANTHROPIC_API_KEY in .env to enable AI features.
 */

export type LlmTask = "default" | "cheap" | "reasoning";

const TASK_MODEL: Record<LlmTask, string> = {
  default:   "claude-sonnet-4-6",
  cheap:     "claude-haiku-4-5-20251001",
  reasoning: "claude-opus-4-8",
};

export interface LlmCompleteOptions {
  task?: LlmTask;
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  retries?: number;
}

export interface LlmCompleteResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function llmComplete(opts: LlmCompleteOptions): Promise<LlmCompleteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = opts.model ?? TASK_MODEL[opts.task ?? "default"];
  const maxTokens = opts.maxTokens ?? 4096;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.jsonMode) {
    // Anthropic JSON mode — instruct via system prompt if not already set
    if (!opts.system) {
      body.system = "Respond with valid JSON only. No explanation, no markdown.";
    }
  }

  let lastErr: unknown;
  const attempts = Math.max(1, (opts.retries ?? 1) + 1);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctl = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 45_000;
    const timer = setTimeout(() => ctl.abort(), timeoutMs);

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });

      if (res.status === 429) throw new Error("LLM rate limit (429)");
      if (res.status === 402 || res.status === 403) throw new Error("LLM auth/credits error");
      if (!res.ok && res.status >= 500) {
        lastErr = new Error(`Anthropic ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }

      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };

      const text = json.content?.find((b) => b.type === "text")?.text ?? "";
      return {
        text,
        model: json.model ?? model,
        usage: {
          promptTokens: json.usage?.input_tokens,
          completionTokens: json.usage?.output_tokens,
        },
      };
    } catch (err) {
      lastErr =
        err instanceof Error && err.name === "AbortError"
          ? new Error(`LLM request timed out after ${Math.round(timeoutMs / 1000)}s`)
          : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
