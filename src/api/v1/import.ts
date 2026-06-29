import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { importService, type ImportMapping, type MappedRow, type DuplicateMode } from "@/services/importService";
import { NotFoundError } from "@/services/boardService";
import { ValidationError } from "@/services/projectService";
import { PermissionError } from "@/services/permissionService";

type ProjectCtx = { params: Promise<{ projectId: string }> };

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = [".xlsx", ".xls", ".csv"];

function errorResponse(err: unknown) {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof PermissionError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  console.error("import request failed:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/v1/projects/[projectId]/import/parse  (multipart: file)
export async function parseImportHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 10MB." }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!ALLOWED.some((ext) => name.endsWith(ext))) {
    return NextResponse.json(
      { error: "Unsupported file type. Use .xlsx, .xls, or .csv." },
      { status: 400 },
    );
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await importService.parseFile({
      actorUserId: user.id,
      projectId,
      data,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/import/validate  (JSON: rows, mapping)
export async function validateImportHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!Array.isArray(body?.rows) || !body?.mapping) {
    return NextResponse.json({ error: "rows and mapping are required." }, { status: 400 });
  }
  try {
    const preview = await importService.buildPreview({
      actorUserId: user.id,
      projectId,
      rows: body.rows as string[][],
      mapping: body.mapping as ImportMapping,
    });
    return NextResponse.json(preview);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/v1/projects/[projectId]/import/batch  (JSON: rows, duplicateMode, batchId)
export async function importBatchHandler(request: Request, ctx: ProjectCtx) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { projectId } = await ctx.params;
  const body = await parseJson(request);
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: "rows are required." }, { status: 400 });
  }
  try {
    const result = await importService.importBatch({
      actorUserId: user.id,
      projectId,
      batchId: typeof body.batchId === "string" ? body.batchId : importService.newBatchId(),
      rows: body.rows as MappedRow[],
      duplicateMode: (body.duplicateMode as DuplicateMode) ?? "skip",
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
