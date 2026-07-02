"use client";

import { useEffect, useState } from "react";
import type {
  BoardColumn,
  BoardItem,
  BoardMember,
  BoardSprint,
} from "./types";
import {
  DISCIPLINES,
  PRIORITIES,
  PRIORITY_META,
  SEVERITIES,
  TYPE_META,
  TypeIcon,
  VERIFICATION_STATUSES,
} from "./meta";
import { LinksTab } from "./LinksTab";
import { TestCasesTab } from "./TestCasesTab";
import { ActivityTab, buildContext } from "@/components/activity/ActivityTab";
import { CommentsSection } from "@/components/comments/CommentsSection";

type Tab = "details" | "tests" | "links" | "activity";

export function WorkItemDetail({
  item,
  columns,
  members,
  sprints,
  canEdit,
  currentUserId,
  initialTab = "details",
  onClose,
  onPatch,
  onMove,
  onNavigate,
  onLinkCountChange,
}: {
  item: BoardItem;
  columns: BoardColumn[];
  members: BoardMember[];
  sprints: BoardSprint[];
  canEdit: boolean;
  currentUserId: string;
  initialTab?: Tab;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onMove: (statusId: string) => void;
  onNavigate?: (itemId: string) => void;
  onLinkCountChange?: (itemId: string, count: number) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Permission gates derived from the current member's role/discipline. The
  // server enforces these regardless; this just hides controls.
  const me = members.find((m) => m.userId === currentUserId);
  const canRemoveLinks = !!me && ["PM", "LEAD"].includes(me.role);
  const canReviewTests =
    !!me && (["PM", "LEAD"].includes(me.role) || me.discipline === "QE");
  const isPM = me?.role === "PM";
  const activityCtx = buildContext(columns, members, sprints);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <TypeIcon type={item.type} className="h-4 w-4" />
          <span className="text-sm font-medium text-muted-foreground">
            {item.itemKey}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {TYPE_META[item.type].label}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-border px-2 text-sm">
          {(
            [
              ["details", "Details"],
              ["tests", "Test Cases"],
              ["links", "Links"],
              ["activity", "Activity"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`border-b-2 px-3 py-2 ${
                tab === id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "details" && (
            <DetailsTab
              item={item}
              columns={columns}
              members={members}
              sprints={sprints}
              canEdit={canEdit}
              onPatch={onPatch}
              onMove={onMove}
            />
          )}
          {tab === "links" && (
            <LinksTab
              item={item}
              canEdit={canEdit}
              canRemoveLinks={canRemoveLinks}
              onNavigate={onNavigate}
              onLinkCountChange={onLinkCountChange}
            />
          )}
          {tab === "tests" && (
            <TestCasesTab
              item={item}
              canEdit={canEdit}
              canReviewTests={canReviewTests}
            />
          )}
          {tab === "activity" && (
            <ActivityTab itemId={item.id} ctx={activityCtx} />
          )}

          {/* Comments — always visible, below whichever tab is active. */}
          <CommentsSection
            itemId={item.id}
            members={members}
            currentUserId={currentUserId}
            canComment={canEdit}
            isPM={isPM}
          />
        </div>
      </aside>
    </>
  );
}

function DetailsTab({
  item,
  columns,
  members,
  sprints,
  canEdit,
  onPatch,
  onMove,
}: {
  item: BoardItem;
  columns: BoardColumn[];
  members: BoardMember[];
  sprints: BoardSprint[];
  canEdit: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onMove: (statusId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <EditableText
        label="Title"
        value={item.title}
        canEdit={canEdit}
        onCommit={(v) => onPatch({ title: v })}
        multiline
      />

      <div className="grid grid-cols-2 gap-3">
        <Picker
          label="Status"
          value={item.statusId}
          canEdit={canEdit}
          onChange={(v) => onMove(v)}
          options={columns.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Picker
          label="Priority"
          value={item.priority}
          canEdit={canEdit}
          onChange={(v) => onPatch({ priority: v })}
          options={PRIORITIES.map((p) => ({
            value: p,
            label: PRIORITY_META[p].label,
          }))}
        />
        <Picker
          label="Assignee"
          value={item.assigneeId ?? ""}
          canEdit={canEdit}
          onChange={(v) => onPatch({ assigneeId: v || null })}
          options={[
            { value: "", label: "Unassigned" },
            ...members.map((m) => ({ value: m.userId, label: m.name })),
          ]}
        />
        <Picker
          label="Sprint"
          value={item.sprintId ?? ""}
          canEdit={canEdit}
          onChange={(v) => onPatch({ sprintId: v || null })}
          options={[
            { value: "", label: "Backlog (no sprint)" },
            ...sprints.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Picker
          label="Discipline"
          value={item.discipline ?? ""}
          canEdit={canEdit}
          onChange={(v) => onPatch({ discipline: v || null })}
          options={[
            { value: "", label: "—" },
            ...DISCIPLINES.map((d) => ({
              value: d,
              label: d.charAt(0) + d.slice(1).toLowerCase(),
            })),
          ]}
        />
        <NumberField
          label="Story points"
          value={item.storyPoints}
          canEdit={canEdit}
          onCommit={(v) => onPatch({ storyPoints: v })}
        />
      </div>

      <EditableText
        label="Description"
        value={item.description ?? ""}
        canEdit={canEdit}
        onCommit={(v) => onPatch({ description: v })}
        multiline
        placeholder="Add a description…"
      />
      <EditableText
        label="Acceptance criteria"
        value={item.acceptanceCriteria ?? ""}
        canEdit={canEdit}
        onCommit={(v) => onPatch({ acceptanceCriteria: v })}
        multiline
        placeholder="Add acceptance criteria…"
      />

      {/* Blocker */}
      <div className="rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={item.isBlocked}
            disabled={!canEdit}
            onChange={(e) => onPatch({ isBlocked: e.target.checked })}
          />
          <span className="font-medium text-card-foreground">Blocked</span>
        </label>
        {item.isBlocked && (
          <EditableText
            label="Blocker reason"
            value={item.blockerReason ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ blockerReason: v })}
            multiline
            placeholder="Why is this blocked?"
          />
        )}
      </div>

      {/* Type-specific fields */}
      {item.type === "BUG" && (
        <Section title="Bug details">
          <Picker
            label="Severity"
            value={item.severity ?? ""}
            canEdit={canEdit}
            onChange={(v) => onPatch({ severity: v || null })}
            options={[
              { value: "", label: "—" },
              ...SEVERITIES.map((s) => ({
                value: s,
                label: s.charAt(0) + s.slice(1).toLowerCase(),
              })),
            ]}
          />
          <Picker
            label="Verification"
            value={item.verificationStatus ?? ""}
            canEdit={canEdit}
            onChange={(v) => onPatch({ verificationStatus: v || null })}
            options={[
              { value: "", label: "—" },
              ...VERIFICATION_STATUSES.map((v) => ({
                value: v,
                label: v.replace("_", " ").toLowerCase(),
              })),
            ]}
          />
          <EditableText
            label="Steps to reproduce"
            value={item.stepsToReproduce ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ stepsToReproduce: v })}
            multiline
          />
          <EditableText
            label="Expected result"
            value={item.expectedResult ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ expectedResult: v })}
            multiline
          />
          <EditableText
            label="Actual result"
            value={item.actualResult ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ actualResult: v })}
            multiline
          />
          <div className="grid grid-cols-2 gap-3">
            <EditableText
              label="Environment"
              value={item.environment ?? ""}
              canEdit={canEdit}
              onCommit={(v) => onPatch({ environment: v })}
            />
            <EditableText
              label="Build version"
              value={item.buildVersion ?? ""}
              canEdit={canEdit}
              onCommit={(v) => onPatch({ buildVersion: v })}
            />
          </div>
        </Section>
      )}

      {item.type === "SPIKE" && (
        <Section title="Spike details">
          <EditableText
            label="Research question"
            value={item.researchQuestion ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ researchQuestion: v })}
            multiline
          />
          <EditableText
            label="Time box"
            value={item.timeBox ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ timeBox: v })}
          />
          <EditableText
            label="Outcome summary"
            value={item.outcomeSummary ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ outcomeSummary: v })}
            multiline
          />
        </Section>
      )}

      {item.type === "TASK" && (
        <Section title="Task details">
          <EditableText
            label="Category"
            value={item.taskCategory ?? ""}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ taskCategory: v })}
          />
          <DateField
            label="Due date"
            value={item.dueDate}
            canEdit={canEdit}
            onCommit={(v) => onPatch({ dueDate: v })}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

// Commits on blur only if the value changed. Local state resets when the
// incoming value changes (e.g. optimistic update or switching items).
function EditableText({
  label,
  value,
  canEdit,
  onCommit,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const cls =
    "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-70";

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea
          value={draft}
          disabled={!canEdit}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
          className={`${cls} resize-y`}
        />
      ) : (
        <input
          value={draft}
          disabled={!canEdit}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className={cls}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  value: number | null;
  canEdit: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  useEffect(() => setDraft(value?.toString() ?? ""), [value]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min={0}
        value={draft}
        disabled={!canEdit}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft === "" ? null : Number(draft);
          if (next !== value) onCommit(next);
        }}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-70"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  value: string | null;
  canEdit: boolean;
  onCommit: (v: string | null) => void;
}) {
  const asDate = value ? value.slice(0, 10) : "";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="date"
        defaultValue={asDate}
        disabled={!canEdit}
        onChange={(e) => onCommit(e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-70"
      />
    </div>
  );
}

function Picker({
  label,
  value,
  canEdit,
  onChange,
  options,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        disabled={!canEdit}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-70"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
