"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardMember } from "@/components/board/types";
import { Avatar } from "@/components/board/meta";
import { Markdown } from "./Markdown";
import { absoluteTime, relativeTime } from "@/components/activity/time";

export type CommentDto = {
  id: string;
  body: string;
  mentions: string[];
  parentId: string | null;
  author: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
  editableUntil: string;
  replies: CommentDto[];
};

export function CommentsSection({
  itemId,
  members,
  currentUserId,
  canComment,
  isPM,
}: {
  itemId: string;
  members: BoardMember[];
  currentUserId: string;
  canComment: boolean;
  isPM: boolean;
}) {
  const isTemp = itemId.startsWith("temp-");
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(!isTemp);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const mentionNames = members.map((m) => m.name);

  async function fetchComments() {
    try {
      const res = await fetch(`/api/v1/work-items/${itemId}/comments`);
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Could not load comments.");
      else setComments(d.comments);
    } catch {
      setError("Could not load comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isTemp) return;
    setLoading(true);
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Resolves which members are @mentioned in a body (by display name).
  function resolveMentions(body: string): string[] {
    return members.filter((m) => body.includes(`@${m.name}`)).map((m) => m.userId);
  }

  async function create(body: string, parentId: string | null) {
    setError(null);
    const res = await fetch(`/api/v1/work-items/${itemId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId, mentions: resolveMentions(body) }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not post the comment.");
      return false;
    }
    setReplyingTo(null);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    await fetchComments();
    return true;
  }

  async function saveEdit(commentId: string, body: string) {
    setError(null);
    const res = await fetch(`/api/v1/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Could not save the edit.");
      return false;
    }
    setEditing(null);
    await fetchComments();
    return true;
  }

  async function remove(commentId: string) {
    setError(null);
    const res = await fetch(`/api/v1/comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Could not delete the comment.");
      return;
    }
    await fetchComments();
  }

  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comments {total > 0 && <span className="text-muted-foreground">({total})</span>}
      </h3>

      {error && (
        <p className="mb-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {isTemp ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Save this item before commenting.
        </p>
      ) : loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}

          {comments.map((c) => (
            <div key={c.id}>
              <CommentNode
                comment={c}
                members={members}
                mentionNames={mentionNames}
                currentUserId={currentUserId}
                isPM={isPM}
                canComment={canComment}
                isEditing={editing === c.id}
                onEditStart={() => setEditing(c.id)}
                onEditCancel={() => setEditing(null)}
                onEditSave={(body) => saveEdit(c.id, body)}
                onDelete={() => remove(c.id)}
                onReply={canComment ? () => setReplyingTo(c.id) : undefined}
              />

              {/* Replies (collapsed by default) */}
              {c.replies.length > 0 &&
                (expanded.has(c.id) ? (
                  <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
                    {c.replies.map((r) => (
                      <CommentNode
                        key={r.id}
                        comment={r}
                        members={members}
                        mentionNames={mentionNames}
                        currentUserId={currentUserId}
                        isPM={isPM}
                        canComment={canComment}
                        isEditing={editing === r.id}
                        onEditStart={() => setEditing(r.id)}
                        onEditCancel={() => setEditing(null)}
                        onEditSave={(body) => saveEdit(r.id, body)}
                        onDelete={() => remove(r.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      setExpanded((prev) => new Set(prev).add(c.id))
                    }
                    className="ml-9 mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    {c.replies.length} repl{c.replies.length === 1 ? "y" : "ies"}
                  </button>
                ))}

              {/* Inline reply box */}
              {replyingTo === c.id && (
                <div className="ml-9 mt-2">
                  <CommentInput
                    members={members}
                    placeholder="Write a reply… (supports markdown)"
                    submitLabel="Reply"
                    onSubmit={(body) => create(body, c.id)}
                    onCancel={() => setReplyingTo(null)}
                    autoFocus
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New top-level comment */}
      {!isTemp && canComment && (
        <div className="mt-4">
          <CommentInput
            members={members}
            placeholder="Add a comment… (supports markdown)"
            submitLabel="Comment"
            onSubmit={(body) => create(body, null)}
          />
        </div>
      )}
    </section>
  );
}

function CommentNode({
  comment,
  members,
  mentionNames,
  currentUserId,
  isPM,
  canComment,
  isEditing,
  onEditStart,
  onEditCancel,
  onEditSave,
  onDelete,
  onReply,
}: {
  comment: CommentDto;
  members: BoardMember[];
  mentionNames: string[];
  currentUserId: string;
  isPM: boolean;
  canComment: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (body: string) => Promise<boolean>;
  onDelete: () => void;
  onReply?: () => void;
}) {
  const isOwn = comment.author.id === currentUserId;
  const withinWindow = Date.now() < new Date(comment.editableUntil).getTime();
  const canEdit = isOwn && withinWindow;
  const canDelete = isOwn || isPM;
  const edited = comment.updatedAt !== comment.createdAt;

  return (
    <div className="flex gap-2">
      <Avatar
        id={comment.author.id}
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        size={28}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-card-foreground">
            {comment.author.name}
          </span>
          <span
            className="text-xs text-muted-foreground"
            title={absoluteTime(comment.createdAt)}
          >
            {relativeTime(comment.createdAt)}
            {edited && " (edited)"}
          </span>
        </div>

        {isEditing ? (
          <div className="mt-1">
            <CommentInput
              members={members}
              initialValue={comment.body}
              submitLabel="Save"
              placeholder="Edit comment…"
              onSubmit={onEditSave}
              onCancel={onEditCancel}
              autoFocus
            />
          </div>
        ) : (
          <div className="mt-0.5">
            <Markdown body={comment.body} mentionNames={mentionNames} />
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              {onReply && canComment && (
                <button onClick={onReply} className="hover:text-foreground">
                  Reply
                </button>
              )}
              {canEdit && (
                <button onClick={onEditStart} className="hover:text-foreground">
                  Edit
                </button>
              )}
              {canDelete && (
                <button onClick={onDelete} className="hover:text-danger">
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentInput({
  members,
  onSubmit,
  onCancel,
  initialValue = "",
  placeholder,
  submitLabel,
  autoFocus = false,
}: {
  members: BoardMember[];
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Detect an in-progress @mention immediately before the caret.
  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setValue(text);
    const caret = e.target.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(name: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@(\w*)$/, `@${name} `);
    const after = value.slice(caret);
    const next = before + after;
    setValue(next);
    setMentionQuery(null);
    // Restore focus and place caret after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }

  async function submit() {
    const body = value.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(body);
    setSubmitting(false);
    if (ok) setValue("");
  }

  const matches =
    mentionQuery !== null
      ? members
          .filter((m) =>
            m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      />

      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {matches.map((m) => (
            <button
              key={m.userId}
              onClick={() => insertMention(m.name)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Avatar id={m.userId} name={m.name} avatarUrl={m.avatarUrl} size={20} />
              <span className="truncate text-card-foreground">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={submitting || !value.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">⌘/Ctrl+Enter</span>
      </div>
    </div>
  );
}
