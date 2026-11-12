import type { LLMProvider } from "./provider";
import { AnthropicAdapter, ANTHROPIC_MODEL_LABEL } from "./anthropicAdapter";
import {
  OpenRouterAdapter,
  DEFAULT_OPENROUTER_MODEL,
} from "./openRouterAdapter";
import { LLMConfigError } from "./errors";

function providerName(): string {
  return (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
}

// Returns the configured provider. Selected by the LLM_PROVIDER env var so the
// backend can be swapped without touching the service layer. Defaults to
// Anthropic. Throws LLMConfigError when the provider is unknown or its key is
// missing — callers that only need a display label should use describeProvider.
export function getProvider(): LLMProvider {
  const name = providerName();
  console.log(`[llm] using provider: ${name}`);

  switch (name) {
    case "anthropic":
      return new AnthropicAdapter();
    case "openrouter":
      return new OpenRouterAdapter();
    default:
      throw new LLMConfigError(`Unknown LLM provider: "${name}".`);
  }
}

// Describes the configured provider for display, reading env only — never
// throws and never constructs a client. Used by pages that render while AI is
// disabled or unconfigured (e.g. the backlog's "Using …" hint).
export function describeProvider(): { name: string; modelLabel: string } {
  const name = providerName();

  switch (name) {
    case "openrouter":
      return {
        name,
        modelLabel: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      };
    case "anthropic":
      return { name, modelLabel: ANTHROPIC_MODEL_LABEL };
    default:
      return { name, modelLabel: "an unconfigured model" };
  }
}
