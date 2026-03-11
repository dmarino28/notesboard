import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const TIMEOUT_MS = 30_000;

// Lazy-initialised singleton — avoids constructing the client at import time
// so missing ANTHROPIC_API_KEY only throws when AI is actually called.
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable AI features.",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export type ProviderCallResult =
  | { text: string; inputTokens: number; outputTokens: number }
  | { error: string };

/**
 * Calls the AI provider with a system prompt and a user message.
 * Returns the text response or a typed error object — never throws.
 */
export async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 512,
): Promise<ProviderCallResult> {
  let client: Anthropic;
  try {
    client = getClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI provider not configured" };
  }

  const model = process.env.AI_MODEL ?? DEFAULT_MODEL;

  // Use Promise.race for timeout — avoids SDK-version-specific signal API
  const callPromise = client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI request timed out")), TIMEOUT_MS),
  );

  try {
    const message = await Promise.race([callPromise, timeoutPromise]);
    const block = message.content[0];
    if (!block || block.type !== "text") {
      return { error: "Unexpected response shape from AI provider" };
    }
    return {
      text: block.text,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "AI request timed out") return { error: e.message };
      // Surface Anthropic API errors cleanly
      if ("status" in e) {
        const status = (e as { status?: number }).status;
        if (status === 401) return { error: "AI provider: invalid API key" };
        if (status === 429) return { error: "AI provider: rate limit reached, try again later" };
        if (status === 500) return { error: "AI provider: service error" };
      }
      return { error: e.message };
    }
    return { error: "AI provider: unknown error" };
  }
}
