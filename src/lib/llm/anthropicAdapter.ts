import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMResult } from "./provider";
import { LLMConfigError, LLMError } from "./errors";

// Model and output cap for Orbit's AI generation. Sonnet 4.6 is fast enough for
// interactive use and 8000 tokens comfortably holds a full backlog tree.
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const ANTHROPIC_MODEL_LABEL = "Claude Sonnet 4.6";
const MAX_TOKENS = 8000;

export class AnthropicAdapter implements LLMProvider {
  readonly name = "anthropic";
  readonly model = ANTHROPIC_MODEL;
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMConfigError(
        "AI not configured. Go to project settings → AI config.",
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async generate(prompt: string, systemPrompt: string): Promise<LLMResult> {
    let res: Anthropic.Message;
    try {
      res = await this.client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      throw mapAnthropicError(err);
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) {
      throw new LLMError("The AI returned an empty response.");
    }

    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  }
}

// Translates SDK exceptions into our two error types with user-readable messages.
function mapAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LLMConfigError("The Anthropic API key is invalid or revoked.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new LLMConfigError(
      "This API key does not have access to the model.",
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LLMError("The AI is rate limited right now. Try again shortly.");
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LLMError("The AI request timed out. Try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new LLMError(`The AI request failed (${err.status ?? "network"}).`);
  }
  return new LLMError("The AI request failed unexpectedly.");
}
