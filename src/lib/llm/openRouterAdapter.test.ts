import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { OpenRouterAdapter } from "./openRouterAdapter";
import { LLMConfigError, LLMError } from "./errors";

const OLD_ENV = process.env;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env = { ...OLD_ENV, OPENROUTER_API_KEY: "test-key" };
});

afterEach(() => {
  process.env = OLD_ENV;
  vi.restoreAllMocks();
});

describe("OpenRouterAdapter", () => {
  it("throws a config error when the API key is missing", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => new OpenRouterAdapter()).toThrow(LLMConfigError);
  });

  it("defaults to a free model and allows an override", () => {
    expect(new OpenRouterAdapter().model).toContain(":free");

    process.env.OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";
    expect(new OpenRouterAdapter().model).toBe("anthropic/claude-sonnet-4.5");
  });

  it("returns text and token usage on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{"epics":[]}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 34 },
      }),
    );

    const result = await new OpenRouterAdapter().generate("p", "s");

    expect(result).toEqual({
      text: '{"epics":[]}',
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it("sends the system and user turns to chat/completions", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "ok" } }] }),
      );

    await new OpenRouterAdapter().generate("user-turn", "system-turn");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messages: [
        { role: "system", content: "system-turn" },
        { role: "user", content: "user-turn" },
      ],
    });
  });

  it.each([
    [401, LLMConfigError],
    [402, LLMConfigError],
    [403, LLMConfigError],
    [404, LLMConfigError],
    [429, LLMError],
    [503, LLMError],
  ])("maps HTTP %i to the right error type", async (status, expected) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream detail", { status }),
    );

    await expect(new OpenRouterAdapter().generate("p", "s")).rejects.toThrow(
      expected,
    );
  });

  it("treats an error body returned with HTTP 200 as a failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: { message: "model is offline" } }),
    );

    await expect(new OpenRouterAdapter().generate("p", "s")).rejects.toThrow(
      /model is offline/,
    );
  });

  it("rejects an empty completion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: "   " } }] }),
    );

    await expect(new OpenRouterAdapter().generate("p", "s")).rejects.toThrow(
      LLMError,
    );
  });
});
