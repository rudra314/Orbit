# `src/lib/llm` — LLM provider abstraction

Provider abstraction supporting Anthropic (Claude API), Ollama, and
OpenAI-compatible endpoints. The active provider is selected **per project** via
`ProjectAiConfig.aiMode` / `provider`.

Never store raw API keys — resolve them from `secretRef` (an env var name).
