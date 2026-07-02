# Automation — AI Generation & Approval

Orbit embeds one AI capability surface: LLM-assisted backlog generation (epics/features/stories/test cases from free text) and an AI-assisted daily-pulse digest summary. Both go through the same provider path. This is the highest-risk surface in the app per the shipping-artifacts method, so it's documented in full even though it's "just" a JSON-generation feature, not an autonomous agent with tool access.

## 1. Backlog generation

- **Trigger / owner:** manual only. A PM or LEAD project member pastes free text into `GenerateModal.tsx` and submits. No automatic/scheduled trigger exists.
- **Runs automatically or only after approval:** generation itself runs immediately (no approval needed to *generate a draft*); nothing becomes a real work item until a separate, explicit **approve** action.
- **Inputs it may read:** only the caller's pasted `inputText` (min 50 chars, `aiService.ts`). It does **not** read `SourceDocument` content, other work items, sprint state, or any other project data — despite `AiGeneration.sourceDocumentId` existing in the schema and CLAUDE.md describing `SourceDocument` as feeding AI, no code path resolves document content into a prompt. `inputSource` is hardcoded to `"pasted_text"`.
- **Tool surface:** none. This is a single-shot text-completion call, not a tool-calling/agentic loop. The model cannot call back into Orbit, browse, or take any action beyond returning text.
- **Steering vs. hard guardrails:** steering is the hardcoded `SYSTEM_PROMPT` + `buildUserPrompt` template in `aiService.ts` (`AiPromptTemplate`, the schema's versioned-prompt table, is unused — prompts are not editable without a code change). The only hard, non-prompt guardrail is `normalizeTree()`, which parses the model's JSON output, drops malformed items, coerces types, and never throws (returns `[]` on total failure) — this is real, code-enforced output shaping, not just an instruction the model might ignore.
- **Output contract:** structured JSON matching `{epics:[{features:[{stories:[{testCases:[...]}]}]}]}`, enforced by `normalizeTree()`. One automatic retry (`MAX_ATTEMPTS = 2`) if the first response isn't valid JSON.
- **App-owned side effects vs. agent-owned suggestions:** the generation step writes **only** to `AiGeneration.generatedJson` with `status = DRAFT` — no Epic/Feature/WorkItem/TestCase exists yet. Everything the model produces is a suggestion until a human approves it. This separation is real and verified in code (`aiGenerationRepository.createDraft` is a plain, non-transactional insert with no downstream writes).
- **Approval gate:** `aiService.approveGeneration()` — re-checks `assertCanUseAi` (PM/LEAD), requires `status === DRAFT` (blocks replay/double-approval), re-normalizes the (possibly human-edited) tree server-side before creating anything. On approval, `aiGenerationRepository.approveAndCreate()` creates real `Epic`/`Feature`/`WorkItem(STORY)`/`TestCase` rows directly in the live board in one transaction, links them via `AiGeneratedEntity` for audit traceability, and emits an `ai_generation_approved` outbox event + activity log entry.
- **Known gap — approval rule not enforced per config:** `ProjectAiConfig.approvalRule` (`PM_APPROVAL | PM_OR_LEAD_APPROVAL | ANY_REVIEWER`) is never read by `approveGeneration` — the check is hardcoded to PM-or-LEAD regardless of what a project configures. A project set to `ANY_REVIEWER` cannot grant approval rights to a non-PM/LEAD reviewer today.
- **Known gap — no budget/rate limiting:** `ProjectAiConfig.tokenBudget`/`.costBudget` are schema fields never read by `generateBacklog`; `AiGeneration.costUsd` is never populated. Any PM/LEAD can trigger unlimited generations bounded only by Anthropic's own API-level limits — no in-app throttle, no per-project spend cap.
- **Prompt-injection surface:** the caller's raw pasted text is concatenated into the same prompt as the generation instructions with only a `Requirements:\n` label — no delimiter/escaping. Because only an already-authenticated, already-authorized (PM/LEAD) user can supply this input, the injection risk is **insider/same-tenant** (a malicious or compromised PM/LEAD account crafting input to manipulate the output), not externally exploitable. `normalizeTree()` provides partial mitigation by discarding any output that doesn't fit the expected shape, but there's no defense against a generation that *looks* well-formed but contains misleading content a reviewer might rubber-stamp.
- **Retry/kill switch:** `ProjectAiConfig.aiMode = DISABLED` is checked and does block generation. There's no separate kill switch beyond that (e.g. no global feature flag independent of per-project config), and no rate limiter.

## 2. Pulse AI digest summary

Same provider path (`getProvider()` → Anthropic), triggered by a PM (regenerate) or automatically composed when the PM views the digest, gated by the same `assertCanManagePulseDigest`/`aiMode !== DISABLED` checks. Inputs: that day's submitted pulse notes and blocker text from all project members (`pulseService.ts` `buildAiPrompt`) — same no-escaping concatenation pattern, broader input population (any CONTRIBUTOR+ who submitted a pulse contributes untrusted text into the same prompt a PM later reads a summary of). Output is a plain-text summary shown to the PM, not written back into any structured entity — lower blast radius than backlog generation since there's no "approval creates real rows" step here; the summary is informational only.

## 3. Provider configuration — narrower than documented

Only Anthropic is implemented (`src/lib/llm/anthropicAdapter.ts`, model `claude-sonnet-4-6`, real `@anthropic-ai/sdk` calls — not stubbed). `providerFactory.ts` selects by a single global `LLM_PROVIDER` env var; the switch has exactly one case. `ProjectAiConfig.provider`, `.model`, `.secretRef` are schema fields never read — every project in the deployment shares one global provider/key regardless of what's configured. See `variables.md` for the secret-handling detail. Ollama and OpenAI-compatible support described in CLAUDE.md/`src/lib/llm/README.md` do not exist in code.

## 4. Controls summary

| Control | Status |
|---|---|
| Approval gate before real data is written | ✅ enforced (DRAFT until explicit approve) |
| Permission check on generate | ✅ PM/LEAD via `assertCanUseAi` |
| Permission check on approve | ✅ PM/LEAD via `assertCanUseAi` (re-checked, not trusted from generate step) |
| Approval-rule config (`approvalRule`) respected | ❌ hardcoded PM/LEAD, config ignored |
| Token/cost budget enforcement | ❌ schema-only, not checked |
| Rate limiting | ❌ none beyond Anthropic's own API limits |
| Output schema validation | ✅ `normalizeTree()` |
| Audit trail | ✅ `AiGeneratedEntity` links + `ActivityLog` + `AuditLog` (org-level) |
| Kill switch | ⚠️ partial — `aiMode = DISABLED` per project, no global switch |
| Prompt injection mitigation | ⚠️ partial — output-shape validation only, no input sanitization; risk is insider-scoped (PM/LEAD-only trigger) |
