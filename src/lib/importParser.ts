import * as XLSX from "xlsx";

// Isolated SheetJS wrapper: turns an uploaded .xlsx/.xls/.csv buffer into plain
// string sheets. No DB, no business logic — just parsing.

export type ParsedSheet = {
  name: string;
  headers: string[]; // first row, used as "Your column" names
  rows: string[][]; // data rows (header excluded), aligned to headers length
  rowCount: number; // number of data rows
};

// Guardrail so a pathological file can't exhaust memory in the parse step.
const MAX_ROWS = 5000;

function cell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// Parses every sheet in the workbook. CSV files surface as a single sheet.
export function parseWorkbook(data: Uint8Array): ParsedSheet[] {
  const wb = XLSX.read(data, { type: "array" });

  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
    });

    if (matrix.length === 0) {
      return { name, headers: [], rows: [], rowCount: 0 };
    }

    const headerRow = matrix[0].map(cell);
    // Replace empty header cells with a positional label so they remain mappable.
    const headers = headerRow.map((h, i) => (h === "" ? `Column ${i + 1}` : h));

    const rows = matrix
      .slice(1, MAX_ROWS + 1)
      .map((r) => headers.map((_, i) => cell(r[i])))
      // Drop rows that are entirely empty (trailing blanks are common in Excel).
      .filter((r) => r.some((v) => v !== ""));

    return { name, headers, rows, rowCount: rows.length };
  });
}
