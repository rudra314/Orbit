"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IMPORT_FIELDS,
  autoDetectField,
  type ImportField,
  type ImportFieldKey,
} from "@/lib/importFields";
import type { ParsedSheet } from "@/lib/importParser";
import type {
  DuplicateMode,
  ImportMapping,
  ImportPreview,
  ImportResult,
  PreviewRow,
  RowCategory,
} from "@/services/importService";

const STEPS = ["Upload", "Preview", "Map columns", "Validate", "Import"] as const;
const BATCH_SIZE = 25;

type Props = { projectId: string; projectKey: string; projectName: string };

export function ImportWizard({ projectId, projectKey, projectName }: Props) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1–2
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);

  // Step 3 — per-column field assignment (index aligned to sheet headers)
  const [assignments, setAssignments] = useState<(ImportFieldKey | "")[]>([]);

  // Step 4
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");

  // Step 5
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const base = `/api/v1/projects/${projectId}/import`;
  const sheet = sheets[sheetIdx] ?? null;

  const mapping = useMemo<ImportMapping>(() => {
    const m: ImportMapping = {};
    assignments.forEach((field, col) => {
      if (field) m[field] = col;
    });
    return m;
  }, [assignments]);

  const titleMapped = mapping.title != null;

  function flash(msg: string) {
    setError(msg);
  }

  // --- Step 1: upload + parse -----------------------------------------
  async function handleFile(file: File) {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      flash("File is larger than 10MB.");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/parse`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not read file.");
      const data = (await res.json()) as { sheets: ParsedSheet[] };
      setSheets(data.sheets);
      setSheetIdx(data.sheets.findIndex((s) => s.rowCount > 0) || 0);
      setStep(2);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not read file.");
      setFileName("");
    } finally {
      setBusy(false);
    }
  }

  // --- Step 2 → 3: lock in sheet, auto-map columns --------------------
  function useThisSheet() {
    if (!sheet) return;
    setAssignments(sheet.headers.map((h) => autoDetectField(h) ?? ""));
    setStep(3);
  }

  function resetMapping() {
    if (!sheet) return;
    setAssignments(sheet.headers.map(() => ""));
  }

  // --- Step 3 → 4: validate -------------------------------------------
  async function runValidate() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: sheet.rows, mapping }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Validation failed.");
      setPreview((await res.json()) as ImportPreview);
      setStep(4);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  // --- Step 4 → 5: import in batches ----------------------------------
  async function runImport() {
    if (!preview) return;
    const importable = preview.rows.filter((r) => r.category !== "error");
    setStep(5);
    setProgress({ done: 0, total: importable.length });
    setResult(null);
    setError(null);

    const batchId = crypto.randomUUID();
    const totals: ImportResult = {
      created: 0,
      updated: 0,
      skippedEmpty: 0,
      skippedDuplicate: 0,
      defaulted: 0,
    };

    try {
      for (let i = 0; i < importable.length; i += BATCH_SIZE) {
        const chunk = importable.slice(i, i + BATCH_SIZE);
        const res = await fetch(`${base}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, duplicateMode, batchId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Import failed.");
        const r = (await res.json()) as ImportResult;
        totals.created += r.created;
        totals.updated += r.updated;
        totals.skippedEmpty += r.skippedEmpty;
        totals.skippedDuplicate += r.skippedDuplicate;
        totals.defaulted += r.defaulted;
        setProgress({ done: Math.min(i + chunk.length, importable.length), total: importable.length });
        setResult({ ...totals });
      }
      setResult({ ...totals });
    } catch (e) {
      flash(e instanceof Error ? e.message : "Import failed.");
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Import backlog</h1>
          <p className="text-sm text-muted-foreground">
            Bring tasks and stories into {projectName} from Excel or CSV.
          </p>
        </div>
        <Link
          href={`/${projectKey}/backlog`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>

      <Stepper step={step} />

      {error && (
        <div className="rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {step === 1 && <UploadStep busy={busy} onFile={handleFile} />}

      {step === 2 && sheet && (
        <PreviewStep
          fileName={fileName}
          sheets={sheets}
          sheetIdx={sheetIdx}
          onSelectSheet={setSheetIdx}
          onBack={() => setStep(1)}
          onContinue={useThisSheet}
        />
      )}

      {step === 3 && sheet && (
        <MappingStep
          headers={sheet.headers}
          sampleRow={sheet.rows[0] ?? []}
          assignments={assignments}
          onChange={(col, field) =>
            setAssignments((prev) => prev.map((a, i) => (i === col ? field : a)))
          }
          onReset={resetMapping}
          titleMapped={titleMapped}
          busy={busy}
          onBack={() => setStep(2)}
          onContinue={runValidate}
        />
      )}

      {step === 4 && preview && (
        <ValidateStep
          preview={preview}
          duplicateMode={duplicateMode}
          onDuplicateMode={setDuplicateMode}
          busy={busy}
          onBack={() => setStep(3)}
          onImport={runImport}
        />
      )}

      {step === 5 && (
        <ImportStep
          progress={progress}
          result={result}
          duplicateMode={duplicateMode}
          projectKey={projectKey}
        />
      )}
    </div>
  );
}

// --- Stepper ----------------------------------------------------------

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
            {n < STEPS.length && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

// --- Step 1: Upload ---------------------------------------------------

function UploadStep({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-20 text-center transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="text-4xl">📄</div>
      {busy ? (
        <p className="text-sm text-muted-foreground">Reading file…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">
            Drag and drop your file here
          </p>
          <p className="text-xs text-muted-foreground">
            or{" "}
            <button
              onClick={() => inputRef.current?.click()}
              className="text-primary hover:underline"
            >
              click to browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            Accepts .xlsx, .xls, .csv — up to 10MB
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// --- Step 2: Preview --------------------------------------------------

function PreviewStep({
  fileName,
  sheets,
  sheetIdx,
  onSelectSheet,
  onBack,
  onContinue,
}: {
  fileName: string;
  sheets: ParsedSheet[];
  sheetIdx: number;
  onSelectSheet: (i: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const sheet = sheets[sheetIdx];
  const sample = sheet.rows.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      {fileName && (
        <p className="text-xs text-muted-foreground">
          File: <span className="text-foreground">{fileName}</span>
        </p>
      )}
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => onSelectSheet(i)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
                i === sheetIdx
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.name} ({s.rowCount})
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{sheet.rowCount} rows</span> found
        {sheets.length > 1 ? ` in "${sheet.name}"` : ""}.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {sheet.headers.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, r) => (
              <tr key={r} className="border-t border-border">
                {sheet.headers.map((_, c) => (
                  <td key={c} className="max-w-[16rem] truncate px-3 py-1.5 text-foreground">
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Nav onBack={onBack} backLabel="Back">
        <button
          onClick={onContinue}
          disabled={sheet.rowCount === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Use this data
        </button>
      </Nav>
    </div>
  );
}

// --- Step 3: Mapping --------------------------------------------------

function MappingStep({
  headers,
  sampleRow,
  assignments,
  onChange,
  onReset,
  titleMapped,
  busy,
  onBack,
  onContinue,
}: {
  headers: string[];
  sampleRow: string[];
  assignments: (ImportFieldKey | "")[];
  onChange: (col: number, field: ImportFieldKey | "") => void;
  onReset: () => void;
  titleMapped: boolean;
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  // A field already chosen by another column is disabled to avoid collisions.
  const taken = new Set(assignments.filter(Boolean) as ImportFieldKey[]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Match each column from your file to an Orbit field.
        </p>
        <button onClick={onReset} className="text-xs text-primary hover:underline">
          Reset mapping
        </button>
      </div>

      {!titleMapped && (
        <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm text-warning">
          ⚠️ Map a column to <strong>Title</strong> to continue — it&apos;s required.
        </div>
      )}

      <div className="rounded-md border border-border">
        <div className="grid grid-cols-[1fr_1.4rem_1fr] items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Your column</span>
          <span />
          <span>Maps to Orbit field</span>
        </div>
        {headers.map((header, col) => (
          <div
            key={col}
            className="grid grid-cols-[1fr_1.4rem_1fr] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{header}</div>
              <div className="truncate text-xs text-muted-foreground">
                e.g. {sampleRow[col] || "—"}
              </div>
            </div>
            <span className="text-center text-muted-foreground">→</span>
            <FieldSelect
              value={assignments[col] ?? ""}
              taken={taken}
              onChange={(v) => onChange(col, v)}
            />
          </div>
        ))}
      </div>

      <Nav onBack={onBack} backLabel="Back">
        <button
          onClick={onContinue}
          disabled={!titleMapped || busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Validating…" : "Continue"}
        </button>
      </Nav>
    </div>
  );
}

function FieldSelect({
  value,
  taken,
  onChange,
}: {
  value: ImportFieldKey | "";
  taken: Set<ImportFieldKey>;
  onChange: (v: ImportFieldKey | "") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ImportFieldKey | "")}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
    >
      <option value="">— Ignore this column —</option>
      {IMPORT_FIELDS.map((f: ImportField) => (
        <option key={f.key} value={f.key} disabled={f.key !== value && taken.has(f.key)}>
          {f.label}
          {f.required ? " (required)" : ""}
        </option>
      ))}
    </select>
  );
}

// --- Step 4: Validate -------------------------------------------------

const CATEGORY_TABS: { key: RowCategory; label: string; icon: string }[] = [
  { key: "ready", label: "Ready", icon: "✅" },
  { key: "warning", label: "Warnings", icon: "⚠️" },
  { key: "error", label: "Errors", icon: "❌" },
  { key: "duplicate", label: "Duplicates", icon: "🔄" },
];

function ValidateStep({
  preview,
  duplicateMode,
  onDuplicateMode,
  busy,
  onBack,
  onImport,
}: {
  preview: ImportPreview;
  duplicateMode: DuplicateMode;
  onDuplicateMode: (m: DuplicateMode) => void;
  busy: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const { counts, rows } = preview;
  const [tab, setTab] = useState<RowCategory>("ready");
  const tabRows = rows.filter((r) => r.category === tab);
  const importableCount = counts.ready + counts.warnings + (duplicateMode === "skip" ? 0 : counts.duplicates);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm">
        <SummaryStat icon="✅" n={counts.ready} label="ready to import" tone="text-foreground" />
        <SummaryStat icon="⚠️" n={counts.warnings} label="warnings" tone="text-warning" />
        <SummaryStat icon="❌" n={counts.errors} label="errors (skipped)" tone="text-danger" />
        <SummaryStat icon="🔄" n={counts.duplicates} label="possible duplicates" tone="text-primary" />
      </div>

      {counts.duplicates > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">For duplicates:</span>
          {(["skip", "update", "new"] as DuplicateMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onDuplicateMode(m)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                duplicateMode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "skip" ? "Skip" : m === "update" ? "Update existing" : "Import as new"}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {CATEGORY_TABS.map((t) => {
          const n = counts[
            t.key === "ready"
              ? "ready"
              : t.key === "warning"
                ? "warnings"
                : t.key === "error"
                  ? "errors"
                  : "duplicates"
          ];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
                tab === t.key
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label} ({n})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        {tabRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No rows in this category.
          </p>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {tabRows.slice(0, 200).map((row: PreviewRow) => (
                <tr key={row.rowIndex} className="border-t border-border align-top">
                  <td className="max-w-[18rem] truncate px-3 py-1.5 text-foreground">
                    {row.title || <span className="text-muted-foreground">(empty)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.type || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.priority || "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {row.issues.length > 0 ? row.issues.join(" ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Nav onBack={onBack} backLabel="Back to mapping">
        <button
          onClick={onImport}
          disabled={busy || importableCount === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Proceed with import ({importableCount} items)
        </button>
      </Nav>
    </div>
  );
}

function SummaryStat({
  icon,
  n,
  label,
  tone,
}: {
  icon: string;
  n: number;
  label: string;
  tone: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span>{icon}</span>
      <span className={`font-semibold ${tone}`}>{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

// --- Step 5: Import + results -----------------------------------------

function ImportStep({
  progress,
  result,
  duplicateMode,
  projectKey,
}: {
  progress: { done: number; total: number };
  result: ImportResult | null;
  duplicateMode: DuplicateMode;
  projectKey: string;
}) {
  const pct = progress.total === 0 ? 100 : Math.round((progress.done / progress.total) * 100);
  const finished = result !== null && progress.done >= progress.total;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {finished ? "Import complete" : "Importing…"}
          </span>
          <span className="text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {result && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-4 py-3 text-sm">
          <ResultLine icon="✅" n={result.created + result.updated} label="imported successfully" />
          {result.defaulted > 0 && (
            <ResultLine icon="⚠️" n={result.defaulted} label="imported with defaults applied" />
          )}
          {result.skippedDuplicate > 0 && (
            <ResultLine
              icon="🔄"
              n={result.skippedDuplicate}
              label={duplicateMode === "skip" ? "duplicates skipped" : "duplicates"}
            />
          )}
          {result.skippedEmpty > 0 && (
            <ResultLine icon="❌" n={result.skippedEmpty} label="skipped (empty title)" />
          )}
        </div>
      )}

      {finished && (
        <div>
          <Link
            href={`/${projectKey}/backlog`}
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go to backlog
          </Link>
        </div>
      )}
    </div>
  );
}

function ResultLine({ icon, n, label }: { icon: string; n: number; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span>{icon}</span>
      <span className="font-semibold text-foreground">{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

// --- Shared nav -------------------------------------------------------

function Nav({
  onBack,
  backLabel,
  children,
}: {
  onBack: () => void;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={onBack}
        className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
      >
        ← {backLabel}
      </button>
      {children}
    </div>
  );
}
