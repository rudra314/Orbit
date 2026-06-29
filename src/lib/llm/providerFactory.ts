import type { LLMProvider } from "./provider";
import { AnthropicAdapter } from "./anthropicAdapter";
import { LLMConfigError } from "./errors";

// Returns the configured provider. Selected by the LLM_PROVIDER env var so the
// backend can be swapped without touching the service layer. Defaults to
// Anthropic. (Ollama / OpenAI-compatible adapters slot in here later.)
export function getProvider(): LLMProvider {
  const name = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  console.log(`[llm] using provider: ${name}`);

  switch (name) {
    case "anthropic":
      return new AnthropicAdapter();
    default:
      throw new LLMConfigError(`Unknown LLM provider: "${name}".`);
  }
}
