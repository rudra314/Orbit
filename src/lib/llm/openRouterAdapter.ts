import type { LLMProvider, LLMResult } from "./provider";
import { LLMConfigError, LLMError } from "./errors";

// OpenRouter exposes an OpenAI-compatible chat/completions endpoint, so this
// adapter is a plain fetch — no SDK dependency. The same shape also works for
// any other OpenAI-compatible gateway if OPENROUTER_BASE_URL is overridden.
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

// A free-tier model by default so the AI path costs nothing to demo. Override
// with OPENROUTER_MODEL for a stronger (paid) model.
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const MAX_TOKENS = 8000;
// Free models queue behind paid traffic and a full backlog tree is a long
// completion, so allow well beyond a typical API timeout.
const TIMEOUT_MS = 120_000;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenRouterAdapter implements LLMProvider {
  readonly name = "openrouter";
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new LLMConfigError(
        "AI not configured. Go to project settings → AI config.",
      );
    }
    this.apiKey = apiKey;
    this.model = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    this.baseUrl = process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async generate(prompt: string, systemPrompt: string): Promise<LLMResult> {
    const body = {
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // OpenRouter uses these for request attribution on its dashboard.
          "X-Title": "Orbit",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new LLMError("The AI request timed out. Try again.");
      }
      throw new LLMError("Could not reach the AI provider.");
    }

    if (!res.ok) throw await mapHttpError(res);

    let json: ChatCompletionResponse;
    try {
      json = (await res.json()) as ChatCompletionResponse;
    } catch {
      throw new LLMError("The AI returned a malformed response.");
    }

    // OpenRouter can return HTTP 200 with an error body when a model is
    // unavailable or the prompt is rejected upstream.
    if (json.error?.message) {
      throw new LLMError(`The AI request failed: ${json.error.message}`);
    }

    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new LLMError("The AI returned an empty response.");
    }

    return {
      text,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }
}

// Translates HTTP failures into our two error types with user-readable messages.
async function mapHttpError(res: Response): Promise<Error> {
  const detail = await res
    .text()
    .then((t) => t.slice(0, 200))
    .catch(() => "");

  switch (res.status) {
    case 401:
      return new LLMConfigError("The OpenRouter API key is invalid or revoked.");
    case 402:
      return new LLMConfigError(
        "This OpenRouter key has no credit for the selected model. Pick a free model or add credit.",
      );
    case 403:
      return new LLMConfigError(
        "This OpenRouter key does not have access to the model.",
      );
    case 404:
      return new LLMConfigError(
        "The configured OPENROUTER_MODEL was not found.",
      );
    case 429:
      return new LLMError(
        "The AI is rate limited right now. Try again shortly.",
      );
    default:
      if (res.status >= 500) {
        return new LLMError(`The AI provider is unavailable (${res.status}).`);
      }
      return new LLMError(
        `The AI request failed (${res.status})${detail ? `: ${detail}` : ""}.`,
      );
  }
}
