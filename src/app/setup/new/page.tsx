"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OrbitMark } from "@/components/OrbitMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DEFAULT_WORKFLOW_STATUSES } from "@/lib/workflowDefaults";

type ProjectType = "INTERNAL" | "FIXED_BID";
type Role = "PM" | "LEAD" | "CONTRIBUTOR" | "VIEWER" | "GUEST";
type Discipline =
  | "PRODUCT"
  | "UX"
  | "DEVELOPMENT"
  | "QE"
  | "DEVOPS"
  | "ARCHITECTURE"
  | "DELIVERY"
  | "OTHER";
type AiMode = "DISABLED" | "LOCAL_MODEL" | "CLOUD_API";
type ApprovalRule = "PM_APPROVAL" | "PM_OR_LEAD_APPROVAL" | "ANY_REVIEWER";
type StartOption = "blank" | "import" | "paste";

const ACCENT_SWATCHES = [
  "#0F6E56",
  "#0052CC",
  "#6554C0",
  "#DE350B",
  "#FF8B00",
  "#00857A",
  "#403294",
  "#5E6C84",
];

const ROLES: Role[] = ["PM", "LEAD", "CONTRIBUTOR", "VIEWER", "GUEST"];
const DISCIPLINES: Discipline[] = [
  "PRODUCT",
  "UX",
  "DEVELOPMENT",
  "QE",
  "DEVOPS",
  "ARCHITECTURE",
  "DELIVERY",
  "OTHER",
];

const STEPS = ["Basics", "Team", "Workflow", "AI Config", "Start"];

function keyFromName(name: string) {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  const candidate =
    letters.length > 1
      ? letters.map((w) => w[0]).join("")
      : (letters[0] ?? "").slice(0, 4);
  return candidate.toUpperCase().slice(0, 10);
}

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [type, setType] = useState<ProjectType>("INTERNAL");
  const [description, setDescription] = useState("");
  const [accentColor, setAccentColor] = useState(ACCENT_SWATCHES[0]);
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Step 2
  const [invites, setInvites] = useState<
    { email: string; role: Role; discipline: Discipline }[]
  >([{ email: "", role: "CONTRIBUTOR", discipline: "DEVELOPMENT" }]);

  // Step 3
  const [columns, setColumns] = useState(
    DEFAULT_WORKFLOW_STATUSES.map((s) => ({ ...s })),
  );

  // Step 4
  const [aiMode, setAiMode] = useState<AiMode>("DISABLED");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [approvalRule, setApprovalRule] = useState<ApprovalRule>("PM_APPROVAL");

  // Step 5
  const [startOption, setStartOption] = useState<StartOption>("blank");

  function updateName(value: string) {
    setName(value);
    if (!keyEdited) setKey(keyFromName(value));
  }

  const keyValid = /^[A-Z][A-Z0-9]{1,9}$/.test(key);
  const step1Valid = name.trim().length > 0 && keyValid;

  function next() {
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const cleanInvites = invites
        .map((i) => ({ ...i, email: i.email.trim() }))
        .filter((i) => i.email.length > 0);

      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          key,
          type,
          description,
          accentColor,
          startDate: startDate || null,
          targetDate: targetDate || null,
          invites: cleanInvites,
          workflowStatuses: columns,
          ai: {
            aiMode,
            provider: aiMode === "DISABLED" ? null : provider || null,
            model: aiMode === "DISABLED" ? null : model || null,
            approvalRule,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create project.");
        setSubmitting(false);
        return;
      }
      router.push(`/${data.projectKey}/board`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 text-primary">
          <OrbitMark className="h-6 w-6" />
          <span className="font-semibold text-foreground">Orbit</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* Stepper */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`hidden text-sm sm:inline ${
                  i === step ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="mx-1 hidden h-px flex-1 bg-border sm:block" />
              )}
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-border bg-card p-6">
          {step === 0 && (
            <Step title="Project basics">
              <Field label="Project name" required>
                <input
                  value={name}
                  onChange={(e) => updateName(e.target.value)}
                  placeholder="e.g. Orbit Pilot"
                  className={inputCls}
                />
              </Field>
              <Field
                label="Key"
                hint="Used in work item IDs like ORB-42. 2–10 chars, A–Z and 0–9."
                required
              >
                <input
                  value={key}
                  onChange={(e) => {
                    setKeyEdited(true);
                    setKey(e.target.value.toUpperCase());
                  }}
                  placeholder="ORB"
                  className={`${inputCls} ${
                    key && !keyValid ? "border-danger" : ""
                  }`}
                />
              </Field>
              <Field label="Type">
                <div className="flex gap-2">
                  {(["INTERNAL", "FIXED_BID"] as ProjectType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        type === t
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {t === "INTERNAL" ? "Internal" : "Fixed-bid"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={inputCls}
                  placeholder="What is this project about?"
                />
              </Field>
              <Field label="Accent color">
                <div className="flex flex-wrap gap-2">
                  {ACCENT_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setAccentColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-card ${
                        accentColor === c ? "ring-foreground" : "ring-transparent"
                      }`}
                    />
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start date">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Target date">
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step
              title="Invite your team"
              subtitle="Invitations are sent by email. You can skip this and add people later."
            >
              <div className="space-y-3">
                {invites.map((inv, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={inv.email}
                      onChange={(e) =>
                        setInvites((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, email: e.target.value } : p,
                          ),
                        )
                      }
                      placeholder="teammate@innominds.com"
                      type="email"
                      className={`${inputCls} flex-1 min-w-[180px]`}
                    />
                    <select
                      value={inv.role}
                      onChange={(e) =>
                        setInvites((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, role: e.target.value as Role } : p,
                          ),
                        )
                      }
                      className={selectCls}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={inv.discipline}
                      onChange={(e) =>
                        setInvites((prev) =>
                          prev.map((p, j) =>
                            j === i
                              ? { ...p, discipline: e.target.value as Discipline }
                              : p,
                          ),
                        )
                      }
                      className={selectCls}
                    >
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setInvites((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="px-2 text-muted-foreground hover:text-danger"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setInvites((prev) => [
                    ...prev,
                    { email: "", role: "CONTRIBUTOR", discipline: "DEVELOPMENT" },
                  ])
                }
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                + Add teammate
              </button>
            </Step>
          )}

          {step === 2 && (
            <Step
              title="Workflow columns"
              subtitle="These become your board columns. Rename them to fit your team."
            >
              <div className="space-y-2">
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <input
                      value={col.name}
                      onChange={(e) =>
                        setColumns((prev) =>
                          prev.map((c, j) =>
                            j === i ? { ...c, name: e.target.value } : c,
                          ),
                        )
                      }
                      className="flex-1 bg-transparent text-sm text-foreground outline-none"
                    />
                    <span className="text-xs text-muted-foreground">
                      {col.category.replace("_", " ").toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step
              title="AI configuration"
              subtitle="AI output is always a draft until a human approves it."
            >
              <Field label="AI mode">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["DISABLED", "Disabled"],
                      ["LOCAL_MODEL", "Local model"],
                      ["CLOUD_API", "Cloud API"],
                    ] as [AiMode, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAiMode(value)}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        aiMode === value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {aiMode !== "DISABLED" && (
                <>
                  <Field
                    label="Provider"
                    hint={
                      aiMode === "LOCAL_MODEL"
                        ? "e.g. ollama"
                        : "e.g. anthropic, openai_compatible"
                    }
                  >
                    <input
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder={aiMode === "LOCAL_MODEL" ? "ollama" : "anthropic"}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Model">
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={
                        aiMode === "LOCAL_MODEL"
                          ? "llama3.3:70b"
                          : "claude-sonnet-4-6"
                      }
                      className={inputCls}
                    />
                  </Field>
                </>
              )}

              <Field label="Approval rule">
                <select
                  value={approvalRule}
                  onChange={(e) => setApprovalRule(e.target.value as ApprovalRule)}
                  className={`${selectCls} w-full`}
                >
                  <option value="PM_APPROVAL">PM only</option>
                  <option value="PM_OR_LEAD_APPROVAL">PM or Lead</option>
                  <option value="ANY_REVIEWER">Any reviewer</option>
                </select>
              </Field>
            </Step>
          )}

          {step === 4 && (
            <Step
              title="How do you want to start?"
              subtitle="You can change your mind anytime after the project is created."
            >
              <div className="space-y-2">
                {(
                  [
                    ["blank", "Start blank", "Begin with an empty backlog."],
                    [
                      "import",
                      "Import from Excel",
                      "Upload a spreadsheet of existing items. (Coming soon)",
                    ],
                    [
                      "paste",
                      "Paste requirements",
                      "Paste text and let AI draft stories. (Coming soon)",
                    ],
                  ] as [StartOption, string, string][]
                ).map(([value, label, desc]) => {
                  const disabled = value !== "blank";
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setStartOption(value)}
                      className={`flex w-full flex-col items-start rounded-md border px-4 py-3 text-left ${
                        startOption === value
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      } ${disabled ? "opacity-50" : ""}`}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {label}
                      </span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-0"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                disabled={step === 0 && !step1Valid}
                className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create project"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const selectCls =
  "rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-ring";

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-card-foreground">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-card-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {hint && <p className="mb-1 text-xs text-muted-foreground">{hint}</p>}
      <div className={hint ? "" : "mt-1"}>{children}</div>
    </div>
  );
}
