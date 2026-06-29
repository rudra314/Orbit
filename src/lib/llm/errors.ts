// Errors raised by the LLM provider layer. The service layer translates these
// into the user-facing errors the API returns.

// Provider is misconfigured (missing/invalid key, unknown provider name).
export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

// A generation call failed (rate limit, timeout, server error, or the model
// returned something unusable). Transient — retrying may succeed.
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}
