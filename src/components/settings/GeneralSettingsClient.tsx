"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GeneralSettingsDto } from "@/services/settingsService";

const TYPES = [
  ["INTERNAL", "Internal"],
  ["FIXED_BID", "Fixed bid"],
] as const;

const ESTIMATION = [
  ["STORY_POINTS", "Story Points"],
  ["HOURS", "Hours"],
  ["BOTH", "Both"],
  ["NONE", "None"],
] as const;

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60";
const labelCls = "block text-sm font-medium text-foreground";

function dateValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function GeneralSettingsClient({
  projectKey,
  general,
  canEdit,
}: {
  projectKey: string;
  general: GeneralSettingsDto;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: general.name,
    description: general.description ?? "",
    type: general.type,
    accentColor: general.accentColor,
    estimationMode: general.estimationMode,
    startDate: dateValue(general.startDate),
    targetDate: dateValue(general.targetDate),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [danger, setDanger] = useState<"idle" | "archiving" | "deleting">("idle");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/projects/${general.id}/settings/general`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          type: form.type,
          accentColor: form.accentColor,
          estimationMode: form.estimationMode,
          startDate: form.startDate || null,
          targetDate: form.targetDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setMessage("Settings saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!confirm("Archive this project? It will be hidden from active lists.")) return;
    setDanger("archiving");
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${general.id}/settings/archive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not archive.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive.");
    } finally {
      setDanger("idle");
    }
  }

  async function remove() {
    setDanger("deleting");
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${general.id}/settings`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not delete.");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setDanger("idle");
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Only the project PM can change these settings.
        </p>
      )}

      <div className="space-y-1.5">
        <label className={labelCls}>Project name</label>
        <input
          className={inputCls}
          value={form.name}
          disabled={!canEdit}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Description</label>
        <textarea
          className={inputCls}
          rows={3}
          value={form.description}
          disabled={!canEdit}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Type</label>
          <select
            className={inputCls}
            value={form.type}
            disabled={!canEdit}
            onChange={(e) => set("type", e.target.value as typeof form.type)}
          >
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Accent color</label>
          <input
            type="color"
            className="h-10 w-full rounded-md border border-input bg-background disabled:opacity-60"
            value={form.accentColor}
            disabled={!canEdit}
            onChange={(e) => set("accentColor", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls}>Estimation mode</label>
        <select
          className={inputCls}
          value={form.estimationMode}
          disabled={!canEdit}
          onChange={(e) =>
            set("estimationMode", e.target.value as typeof form.estimationMode)
          }
        >
          {ESTIMATION.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Start date</label>
          <input
            type="date"
            className={inputCls}
            value={form.startDate}
            disabled={!canEdit}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Target date</label>
          <input
            type="date"
            className={inputCls}
            value={form.targetDate}
            disabled={!canEdit}
            onChange={(e) => set("targetDate", e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}

      {canEdit && (
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}

      {canEdit && (
        <div className="mt-8 space-y-3 rounded-md border border-danger/40 p-4">
          <h2 className="text-sm font-semibold text-danger">Danger zone</h2>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Archive this project — hide it without deleting any data.
            </p>
            <button
              onClick={archive}
              disabled={danger !== "idle" || general.status === "ARCHIVED"}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              {general.status === "ARCHIVED" ? "Archived" : "Archive"}
            </button>
          </div>
          <div className="border-t border-danger/20 pt-3">
            <p className="text-sm text-muted-foreground">
              Permanently delete this project and all its data. Type the project
              key <span className="font-mono font-semibold">{projectKey}</span> to
              confirm.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                className={inputCls}
                placeholder={projectKey}
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
              />
              <button
                onClick={remove}
                disabled={danger !== "idle" || confirmDelete !== projectKey}
                className="shrink-0 rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {danger === "deleting" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
