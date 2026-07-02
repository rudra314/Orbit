import { Fragment } from "react";

// Minimal, dependency-free markdown renderer for comment bodies. Supports the
// subset the product promises: bold, italic, inline code, fenced code blocks,
// bullet lists — plus @mention highlighting. Output is React nodes (never
// dangerouslySetInnerHTML), so user input is escaped by React.

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a line of text into inline nodes: `code`, **bold**, *italic*, @mention.
function parseInline(text: string, mentionRe: RegExp | null): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first (opaque), then bold (**) before italic (*).
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    if (!chunk) return;
    if (!mentionRe) {
      nodes.push(<Fragment key={key++}>{chunk}</Fragment>);
      return;
    }
    // Highlight @mentions inside plain-text chunks.
    let li = 0;
    let mm: RegExpExecArray | null;
    mentionRe.lastIndex = 0;
    while ((mm = mentionRe.exec(chunk)) !== null) {
      if (mm.index > li) nodes.push(<Fragment key={key++}>{chunk.slice(li, mm.index)}</Fragment>);
      nodes.push(
        <span key={key++} className="font-medium text-primary">
          {mm[0]}
        </span>,
      );
      li = mm.index + mm[0].length;
    }
    if (li < chunk.length) nodes.push(<Fragment key={key++}>{chunk.slice(li)}</Fragment>);
  };

  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  pushText(text.slice(last));
  return nodes;
}

export function Markdown({
  body,
  mentionNames = [],
}: {
  body: string;
  mentionNames?: string[];
}) {
  // Build one regex matching @ + any known member name (longest first so
  // "@Jane Doe" wins over "@Jane").
  const mentionRe =
    mentionNames.length > 0
      ? new RegExp(
          `@(?:${[...mentionNames]
            .sort((a, b) => b.length - a.length)
            .map(escapeRegex)
            .join("|")})`,
          "g",
        )
      : null;

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="my-1 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground"
        >
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Bullet list (consecutive - / * lines).
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{parseInline(it, mentionRe)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line → spacing.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph.
    blocks.push(
      <p key={key++} className="my-0.5 whitespace-pre-wrap break-words">
        {parseInline(line, mentionRe)}
      </p>,
    );
    i++;
  }

  return <div className="text-sm text-card-foreground">{blocks}</div>;
}
