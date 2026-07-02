"use client";

import { useState } from "react";
import type { AiSettingsDto } from "@/services/settingsService";

const AI_MODES = [
  ["DISABLED", "Disabled"],
  ["LOCAL_MODEL", "Local model"],
  ["CLOUD_API", "Cloud API"],
  ["OPENAI_COMPATIBLE", "OpenAI-compatible"],
] as const;

const APPROVAL_RULES = [
  ["PM_APPROVAL", "PM only"],
  ["PM_OR_LEAD_APPROVAL", "PM or Lead"],
  ["ANY_REVIEWER", "Any reviewer"],
] as const;

const FEATURES = [
  ["backlog_gen", "Backlog generation"],
  ["test_case_gen", "Test case generation"],
  ["report_draft", "Report drafting"],
] as const;

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60";
const labelCls = "block text-sm font-medium text-foreground";

export function AiSettingsClient({
  projectId,
  ai,
  canEdit,
}: {
  projectId: string;
  ai: AiSettingsDto;
  canEdit: boolean;
}) {
  const [form, setForm] = useState({
    aiMode: ai.aiMode,
    provider: ai.provider ?? "",
    model: ai.model ?? "",
    approvalRule: ai.approvalRule,
    enabledFeatures: new Set(ai.enabledFeatures),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = form.aiMode === "DISABLED";

  function toggleFeature(key: string) {
    setForm((p) => {
      const next = new Set(p.enabledFeatures);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...p, enabledFeatures: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/settings/ai`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiMode: form.aiMode,
          provider: form.provider,
          model: form.model,
          approvalRule: form.approvalRule,
          enabledFeatures: [...form.enabledFeatures],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setMessage("AI settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Only the project PM can change AI settings.
        </p>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>AI mode</label>
        <select
          className={inputCls}
          value={form.aiMode}
          disabled={!canEdit}
          onChange={(e) =>
            setForm((p) => ({ ...p, aiMode: e.target.value as typeof p.aiMode }))
          }
        >
          {AI_MODES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {!disabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelCls}>Provider</label>
              <input
                className={inputCls}
                placeholder="anthropic, ollama, …"
                value={form.provider}
                disabled={!canEdit}
                onChange={(e) =>
                  setForm((p) => ({ ...p, provider: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Model</label>
              <input
                className={inputCls}
                placeholder="claude-sonnet-4-6, llama3.3:70b, …"
                value={form.model}
                disabled={!canEdit}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Approval rule</label>
            <select
              className={inputCls}
              value={form.approvalRule}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  approvalRule: e.target.value as typeof p.approvalRule,
                }))
              }
            >
              {APPROVAL_RULES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Enabled features</label>
            {FEATURES.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.enabledFeatures.has(key)}
                  disabled={!canEdit}
                  onChange={() => toggleFeature(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}

      {canEdit && (
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save AI settings"}
        </button>
      )}
    </div>
  );
}
