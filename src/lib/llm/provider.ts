// Provider abstraction for the LLM backends Orbit can talk to (Anthropic now;
// Ollama / OpenAI-compatible later). Selected per request by providerFactory.

export interface LLMResult {
  text: string;
  // Token usage for the call, recorded on the AiGeneration row.
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  // Stable identifier stored on the AiGeneration (e.g. "anthropic").
  readonly name: string;
  // Runs a single completion. `systemPrompt` sets behaviour; `prompt` is the
  // user turn. Returns the text plus token usage.
  // (The agreed interface returns just a string; we widen it to LLMResult so
  // the service can persist token counts on AiGeneration.tokenCount.)
  generate(prompt: string, systemPrompt: string): Promise<LLMResult>;
}
